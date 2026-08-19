// Critical prefixes that fail-secure if sidecar is unreachable/timed out
var FAIL_SECURE_PREFIXES = ["/api/auth", "/api/admin", "/api/payment"];

// ─────────────────────────────────────────────
// PHASE 9 — Adaptive Rate Limiting
// Each client IP accumulates a suspicion budget.
// Budget refills slowly over time; anomalous requests drain it faster.
// When budget is exhausted, requests are throttled (429) even if safe.
// This catches adversarial low-and-slow probing without needing a block.
// ─────────────────────────────────────────────
var suspicionBudgets = {}; // ip -> { budget: float, lastRefill: ts }
var MAX_BUDGET = 10.0;    // Maximum suspicion units before throttle
var REFILL_RATE = 1.0;    // Units refilled per second when idle
var THROTTLE_THRESH = 8.0;// Budget level at which we start throttling

function getBudget(ip) {
    var now = Date.now() / 1000;
    if (!suspicionBudgets[ip]) {
        suspicionBudgets[ip] = { budget: 0, lastRefill: now };
    }
    var entry = suspicionBudgets[ip];
    var elapsed = now - entry.lastRefill;
    // Refill budget (reduce suspicion over time)
    entry.budget = Math.max(0, entry.budget - elapsed * REFILL_RATE);
    entry.lastRefill = now;
    return entry;
}

function chargeScore(ip, score) {
    var entry = getBudget(ip);
    // Convert the sidecar 0.0-1.0 score into suspicion units (amplified)
    var units = score * MAX_BUDGET;
    entry.budget = Math.min(MAX_BUDGET, entry.budget + units);
    return entry.budget;
}

function isFailSecurePath(uri) {
    for (var i = 0; i < FAIL_SECURE_PREFIXES.length; i++) {
        if (uri.indexOf(FAIL_SECURE_PREFIXES[i]) === 0) {
            return true;
        }
    }
    return false;
}

function authorize(r) {
    var parent = r.parent || r;
    var rawBody = parent.requestBody || "";
    var hostHeader = parent.headersIn["Host"] || "localhost";
    var host = hostHeader.split(":")[0];

    // Use request_uri from parent to get full URL including query params
    var fullUrl = parent.variables["request_uri"] || parent.uri;
    var ja4Header = parent.headersIn["X-JA4-Fingerprint"] || "";
    var clientIp = parent.variables["remote_addr"] || "unknown";

    r.log("[AI-WAF] Authorizing request: " + parent.method + " " + fullUrl + " (Host: " + host + ", JA4: " + ja4Header + ")");

    var payload = {
        tenant_id: host,
        url: fullUrl,
        method: parent.method,
        headers: parent.headersIn,
        body: rawBody,
        content_type: parent.headersIn["Content-Type"] || "",
        ja4: ja4Header
    };

    r.log("[AI-WAF] Sending subrequest to sidecar...");
    r.subrequest('/internal/ai-sidecar', {
        method: 'POST',
        body: JSON.stringify(payload)
    }, function (reply) {
        r.log("[AI-WAF] Sidecar reply status: " + reply.status);

        if (reply.status === 200) {
            // ── Phase 9: Check suspicion budget even on 200 OK ──
            var scoreHeader = reply.headersOut && reply.headersOut["X-AI-Score"];
            var aiScore = scoreHeader ? parseFloat(scoreHeader) : 0.0;
            var budget = chargeScore(clientIp, aiScore);
            r.log("[AI-WAF] Client IP " + clientIp + " suspicion budget: " + budget.toFixed(2) + "/" + MAX_BUDGET);

            if (budget >= THROTTLE_THRESH) {
                r.log("[AI-WAF] Adaptive Throttle: budget exhausted for " + clientIp + " (score=" + aiScore + ")");
                r.return(429, JSON.stringify({
                    error: "Too Many Requests",
                    message: "AffiniSecurity Adaptive Rate Limiter: Anomalous request pattern detected."
                }));
                return;
            }

            r.log("[AI-WAF] Permitted");
            r.return(200);
        } else if (reply.status === 403) {
            // On hard block, fully saturate budget so recovery takes time
            chargeScore(clientIp, 1.0);
            r.log("[AI-WAF] Blocked by Go sidecar validation.");
            r.return(403, reply.responseBody);
        } else if (reply.status === 429) {
            r.log("[AI-WAF] Challenge Required. Redirecting client...");
            parent.headersOut["Location"] = "/api/waf/challenge?domain=" + encodeURIComponent(host) + "&target=" + encodeURIComponent(fullUrl);
            r.return(302);
        } else {
            r.log("[AI-WAF] Sidecar returned status " + reply.status + ". Evaluating fallback...");
            if (isFailSecurePath(fullUrl)) {
                r.log("[AI-WAF] Fail-Secure Block (Critical Path: " + fullUrl + ")");
                r.return(503, JSON.stringify({
                    error: "Service Temporarily Unavailable",
                    message: "Security inspection offline. Direct access restricted."
                }));
            } else {
                r.log("[AI-WAF] Fail-Open Allowed (Non-Critical Path: " + fullUrl + ")");
                r.return(200);
            }
        }
    });
}

export default { authorize };
