local cjson = require "cjson"
local http = require "resty.http"
local redis = require "resty.redis"

-- ─────────────────────────────────────────────
--   CONSTANTS & CONFIG
-- ─────────────────────────────────────────────

-- Routes where fail-secure blocking applies if the sidecar is unreachable
local FAIL_SECURE_PATHS = {"/api/auth", "/api/admin", "/api/payment"}

local function is_fail_secure_path(path)
    for _, prefix in ipairs(FAIL_SECURE_PATHS) do
        if string.sub(path, 1, #prefix) == prefix then
            return true
        end
    end
    return false
end

-- ─────────────────────────────────────────────
--   STEP 1: Resolve Tenant Policy
-- ─────────────────────────────────────────────

local host = ngx.var.host
if not host then
    ngx.log(ngx.WARN, "[AI-WAF] No Host header. Skipping AI pass.")
    return
end

local request_path = ngx.var.uri

-- Check Nginx shared memory cache first (zero-latency)
local cache = ngx.shared.tenant_policies
local cached_val = cache:get(host)
local policy

if cached_val then
    policy = cjson.decode(cached_val)
else
    ngx.log(ngx.INFO, "[AI-WAF] Cache miss for: ", host, ". Querying Redis...")
    local red = redis:new()
    red:set_timeouts(100, 100, 100)

    local ok, err = red:connect("redis", 6379)
    if not ok then
        ngx.log(ngx.ERR, "[AI-WAF] Redis connect failed: ", err, ". Skipping AI validation.")
        return
    end

    -- ──────────────────────────────────────────
    --   Phase 3.1: JA4 Fingerprint Blocklist
    -- ──────────────────────────────────────────
    local ja4_fp = ngx.var.http_x_ja4_fingerprint or ""
    if ja4_fp ~= "" then
        local blocked, check_err = red:sismember("waf:ja4:blocklist", ja4_fp)
        if check_err then
            ngx.log(ngx.WARN, "[AI-WAF] JA4 blocklist lookup error: ", check_err)
        elseif blocked == 1 then
            ngx.log(ngx.ERR, "[AI-WAF] BLOCKED known-bad JA4 fingerprint: ", ja4_fp)
            ngx.status = ngx.HTTP_FORBIDDEN
            ngx.header.content_type = "application/json; charset=utf-8"
            ngx.say(cjson.encode({
                error = "Forbidden",
                message = "Client fingerprint blocked by AffiniSecurity Threat Intelligence."
            }))
            ngx.exit(ngx.HTTP_FORBIDDEN)
        end
    end

    local res, err = red:get("tenant:" .. host .. ":policy")
    if not res or res == ngx.null then
        ngx.log(ngx.WARN, "[AI-WAF] No policy for host: ", host, ". Defaulting disabled.")
        policy = { enabled = false }
        cache:set(host, cjson.encode(policy), 30)
    else
        local status, decoded = pcall(cjson.decode, res)
        if status then
            policy = decoded
            cache:set(host, res, 60)
        else
            ngx.log(ngx.ERR, "[AI-WAF] Failed to decode policy JSON: ", decoded)
            return
        end
    end
end

-- Tenant has AI inspection disabled — exit early
if not policy or not policy.enabled then
    return
end

-- ─────────────────────────────────────────────
--   STEP 2: Check Path Bypass Rules
-- ─────────────────────────────────────────────

if policy.bypass_paths then
    for _, pattern in ipairs(policy.bypass_paths) do
        if string.find(request_path, pattern) then
            ngx.log(ngx.INFO, "[AI-WAF] Path bypassed by tenant policy: ", request_path)
            return
        end
    end
end

-- ─────────────────────────────────────────────
--   STEP 3: Read and Buffer Request Body
-- ─────────────────────────────────────────────

ngx.req.read_body()
local body_data = ngx.req.get_body_data()
if not body_data then
    local body_file = ngx.req.get_body_file()
    if body_file then
        local file = io.open(body_file, "r")
        if file then
            body_data = file:read("*all")
            file:close()
        end
    end
end

-- ─────────────────────────────────────────────
--   STEP 4: Build Sidecar Classification Payload
-- ─────────────────────────────────────────────

local ja4_fp = ngx.var.http_x_ja4_fingerprint or ""
local content_type = ngx.req.get_headers()["Content-Type"] or ""

local payload = {
    tenant_id    = host,
    url          = ngx.var.request_uri,
    method       = ngx.req.get_method(),
    headers      = ngx.req.get_headers(),
    body         = body_data or "",
    content_type = content_type,
    ja4          = ja4_fp,
}

-- ─────────────────────────────────────────────
--   STEP 5: Call Go AI Sidecar over Unix Socket
-- ─────────────────────────────────────────────

local hc = http.new()
hc:set_timeout(280) -- 280ms hard cap to stay below Nginx upstream timeout

local ok, err = hc:connect("unix:/var/run/shared/ai.sock")
if not ok then
    ngx.log(ngx.ERR, "[AI-WAF] Sidecar offline: ", err)
    -- Phase 1.5 Fail-Secure: block critical routes if sidecar is unreachable
    if is_fail_secure_path(request_path) then
        ngx.status = ngx.HTTP_SERVICE_UNAVAILABLE
        ngx.header.content_type = "application/json; charset=utf-8"
        ngx.say(cjson.encode({
            error = "Service unavailable",
            message = "Security inspection temporarily unavailable on this endpoint."
        }))
        ngx.exit(ngx.HTTP_SERVICE_UNAVAILABLE)
    end
    return -- fail-open for non-critical paths to preserve uptime
end

local res, err = hc:request({
    path    = "/v1/classify",
    method  = "POST",
    body    = cjson.encode(payload),
    headers = { ["Content-Type"] = "application/json" }
})

if not res then
    ngx.log(ngx.ERR, "[AI-WAF] Sidecar request failed: ", err)
    if is_fail_secure_path(request_path) then
        ngx.status = ngx.HTTP_SERVICE_UNAVAILABLE
        ngx.say(cjson.encode({ error = "Service unavailable" }))
        ngx.exit(ngx.HTTP_SERVICE_UNAVAILABLE)
    end
    return
end

-- ─────────────────────────────────────────────
--   STEP 6: Handle Sidecar Response
-- ─────────────────────────────────────────────

if res.status == ngx.HTTP_FORBIDDEN then
    -- Confirmed block by AI engine (score >= tenant threshold)
    local data = cjson.decode(res.body)
    local score = (data and data.score) or 1.0
    ngx.log(ngx.ERR, "[AI-WAF] BLOCKED | Host: ", host,
            " | URI: ", request_path, " | Score: ", score, " | JA4: ", ja4_fp)

    -- Add JA4 fingerprint to blocklist if it is a confirmed malicious request
    if ja4_fp ~= "" then
        local red2 = redis:new()
        red2:set_timeouts(100, 100, 100)
        if red2:connect("redis", 6379) then
            red2:sadd("waf:ja4:blocklist", ja4_fp)
            red2:expire("waf:ja4:blocklist:member:" .. ja4_fp, 86400) -- 24h TTL
        end
    end

    ngx.status = ngx.HTTP_FORBIDDEN
    ngx.header.content_type = "application/json; charset=utf-8"
    ngx.say(cjson.encode({
        error   = "Forbidden",
        message = "Blocked by AffiniSecurity AI Engine v2.0.",
        score   = score
    }))
    ngx.exit(ngx.HTTP_FORBIDDEN)

elseif res.status == 429 then
    -- Sidecar returned "challenge required" — redirect to JS challenge gate
    local data = cjson.decode(res.body)
    local score = (data and data.score) or 0.5
    ngx.log(ngx.WARN, "[AI-WAF] CHALLENGE | Host: ", host,
            " | URI: ", request_path, " | Score: ", score)

    local domain = host
    ngx.status = ngx.HTTP_FOUND
    ngx.header["Location"] = "/api/waf/challenge?domain=" .. domain .. "&target=" .. ngx.var.request_uri
    ngx.exit(ngx.HTTP_FOUND)

elseif res.status == ngx.HTTP_OK then
    local data = cjson.decode(res.body)
    if data and data.score then
        ngx.log(ngx.INFO, "[AI-WAF] PASS | Score: ", data.score,
                " | URI: ", request_path)
    end

else
    ngx.log(ngx.WARN, "[AI-WAF] Sidecar returned unexpected status: ", res.status, ". Permitting request.")
end
