using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using System.Text.Json.Serialization;

namespace AffiniSecurity.Waf.Controllers
{
    [ApiController]
    [Route("api/waf")]
    public class WafChallengeController : ControllerBase
    {
        private const string ChallengeSecret = "AFFINI_SHIELD_SECRET_2026_CHANGE_ME";

        [HttpGet("challenge")]
        public async Task<IActionResult> GetChallenge([FromQuery] string domain, [FromQuery] string target, [FromServices] WafDbContext dbContext)
        {
            if (string.IsNullOrEmpty(domain) || string.IsNullOrEmpty(target))
                return BadRequest("Invalid request");

            // Bypass EF Core TenantDbInterceptor to allow anonymous access to read domains and settings
            Domain domainObj = null;
            SecuritySettings settings = null;

            using (var conn = new Npgsql.NpgsqlConnection(dbContext.Database.GetConnectionString()))
            {
                await conn.OpenAsync();
                
                // Set PostgreSQL session tenant to SYSTEM_ADMIN to bypass RLS for this public endpoint
                using (var setupCmd = new Npgsql.NpgsqlCommand("SET app.current_tenant_id = 'SYSTEM_ADMIN';", conn))
                {
                    await setupCmd.ExecuteNonQueryAsync();
                }
                
                // Read Domain
                using (var cmd = new Npgsql.NpgsqlCommand("SELECT \"TenantId\", \"UnderAttackMode\" FROM domains WHERE \"DomainName\" = @domain", conn))
                {
                    cmd.Parameters.AddWithValue("domain", domain);
                    using (var reader = await cmd.ExecuteReaderAsync())
                    {
                        if (await reader.ReadAsync())
                        {
                            domainObj = new Domain
                            {
                                TenantId = reader.IsDBNull(0) ? null : reader.GetString(0),
                                UnderAttackMode = reader.GetBoolean(1)
                            };
                        }
                    }
                }

                // Read Settings if Domain exists
                if (domainObj != null && !string.IsNullOrEmpty(domainObj.TenantId))
                {
                    using (var cmd = new Npgsql.NpgsqlCommand("SELECT \"CaptchaEnabled\", \"JsChallengeEnabled\", \"FingerprintingEnabled\" FROM security_settings WHERE \"TenantId\" = @tenantId", conn))
                    {
                        cmd.Parameters.AddWithValue("tenantId", domainObj.TenantId);
                        using (var reader = await cmd.ExecuteReaderAsync())
                        {
                            if (await reader.ReadAsync())
                            {
                                settings = new SecuritySettings
                                {
                                    CaptchaEnabled = reader.GetBoolean(0),
                                    JsChallengeEnabled = reader.GetBoolean(1),
                                    FingerprintingEnabled = reader.GetBoolean(2)
                                };
                            }
                        }
                    }
                }
            }

            bool isUnderAttack = domainObj?.UnderAttackMode ?? false;
            bool useCaptcha = (settings?.CaptchaEnabled ?? false) || isUnderAttack;
            bool useJsChallenge = (settings?.JsChallengeEnabled ?? false) || isUnderAttack;
            bool useFingerprinting = (settings?.FingerprintingEnabled ?? false) || isUnderAttack;

            // Fallback: If none are explicitly enabled but we hit this page, do at least a JS challenge
            if (!useCaptcha && !useJsChallenge && !useFingerprinting) 
            {
                useJsChallenge = true;
            }

            var challengeId = Guid.NewGuid().ToString("N");
            var difficulty = isUnderAttack ? 5 : 4; // Harder PoW if under attack

            var html = $@"
<!DOCTYPE html>
<html lang='en'>
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <title>Security Check - AffiniSecurity</title>
    <style>
        :root {{ --primary: #10b981; --bg: #09090b; --text: #fafafa; --muted: #a1a1aa; }}
        body {{ background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; overflow: hidden; }}
        .container {{ max-width: 400px; padding: 2.5rem; text-align: center; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 1.5rem; backdrop-filter: blur(20px); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); }}
        .spinner {{ border: 3px solid rgba(255,255,255,0.05); border-top: 3px solid var(--primary); border-radius: 50%; width: 48px; height: 48px; animation: spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite; margin: 0 auto 2rem; }}
        @keyframes spin {{ 0% {{ transform: rotate(0deg); }} 100% {{ transform: rotate(360deg); }} }}
        h1 {{ font-size: 1.5rem; font-weight: 700; margin-bottom: 0.75rem; letter-spacing: -0.025em; }}
        p {{ font-size: 0.9375rem; color: var(--muted); line-height: 1.6; margin-bottom: 2.5rem; }}
        .captcha-box {{ display: none; margin-top: 1.5rem; padding: 1.5rem; border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 1rem; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); background: rgba(16, 185, 129, 0.08); }}
        .captcha-box:hover {{ background: rgba(16, 185, 129, 0.15); border-color: var(--primary); transform: translateY(-2px); box-shadow: 0 10px 20px -5px rgba(16, 185, 129, 0.2); }}
        .check-icon {{ display: inline-block; width: 24px; height: 24px; border: 2px solid rgba(255,255,255,0.2); border-radius: 8px; vertical-align: middle; margin-right: 16px; position: relative; transition: all 0.4s; }}
        .verified .check-icon {{ background: var(--primary); border-color: var(--primary); transform: scale(1.1); }}
        .verified .check-icon::after {{ content: '✓'; color: white; position: absolute; top: -2px; left: 5px; font-size: 18px; font-weight: bold; }}
        #status {{ margin-top: 2rem; font-size: 0.75rem; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; opacity: 0.6; text-transform: uppercase; letter-spacing: 0.1em; }}
        .progress-bar {{ width: 100%; height: 3px; background: rgba(255,255,255,0.05); margin-top: 1.5rem; border-radius: 3px; overflow: hidden; }}
        .progress-fill {{ height: 100%; background: var(--primary); width: 0%; transition: width 0.4s ease-out; box-shadow: 0 0 10px var(--primary); }}
    </style>
</head>
<body>
    <div class='container' id='main-box'>
        <div style='height: 60px; margin-bottom: 40px; display: flex; justify-content: center;'>
             <img src='/logo-official.png' style='height: 100%; filter: drop-shadow(0 0 20px rgba(16, 185, 129, 0.3));' />
        </div>
        <div class='spinner' id='loader'></div>
        <h1 id='title'>Identity Verification</h1>
        <p id='desc'>Our security shield is verifying your browser connection to ensure a secure environment.</p>
        
        <div id='captcha' class='captcha-box' onclick='solveCaptcha()'>
            <span class='check-icon'></span>
            <span style='font-size: 1.05rem; font-weight: 600; color: #fff;'>I am not a robot</span>
        </div>

        <div class='progress-bar'><div id='progress' class='progress-fill'></div></div>
        <div id='status'>Initializing secure handshake...</div>
    </div>

    <script>
        const payload = {{
            domain: '{domain}',
            target: '{target}',
            challengeId: '{challengeId}',
            nonce: 0,
            fingerprint: {{}},
            interaction: false
        }};

        async function solvePoW() {{
            const prefix = '{(isUnderAttack ? "00000" : "0000")}'; // Target difficulty
            let nonce = 0;
            const progress = document.getElementById('progress');
            
            // Tiny SHA-256 implementation for synchronous execution
            function sha256(ascii) {{
                function rightRotate(value, amount) {{ return (value>>>amount) | (value<<(32 - amount)); }}
                var mathPow = Math.pow, maxWord = mathPow(2, 32), lengthProperty = 'length', i, j, result = '', words = [], asciiBitLength = ascii[lengthProperty]*8, hash = sha256.h = sha256.h || [], k = sha256.k = sha256.k || [], primeCounter = k[lengthProperty], isComposite, candidate = 2;
                if (!primeCounter) {{ while (primeCounter < 64) {{ isComposite = false; for (i = 2; i * i <= candidate; i++) {{ if (candidate % i === 0) {{ isComposite = true; break; }} }} if (!isComposite) {{ hash[primeCounter] = (mathPow(candidate, .5)*maxWord)|0; k[primeCounter++] = (mathPow(candidate, 1/3)*maxWord)|0; }} candidate++; }} }}
                ascii += '\x80'; while (ascii[lengthProperty]%64 - 56) ascii += '\x00';
                for (i = 0; i < ascii[lengthProperty]; i++) {{ j = ascii.charCodeAt(i); if (j>>8) return; words[i>>2] |= j << ((3 - i)%4)*8; }}
                words[words[lengthProperty]] = ((asciiBitLength/maxWord)|0); words[words[lengthProperty]] = (asciiBitLength)
                for (j = 0; j < words[lengthProperty];) {{
                    var w = words.slice(j, j += 16), oldHash = hash; hash = hash.slice(0, 8);
                    for (i = 0; i < 64; i++) {{
                        var i2 = i + j, w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4], temp1 = hash[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e&hash[5])^((~e)&hash[6])) + k[i] + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15>>>3)) + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2>>>10)))|0), temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a&hash[1])^(a&hash[2])^(hash[1]&hash[2]));
                        hash = [(temp1 + temp2)|0].concat(hash); hash[4] = (hash[4] + temp1)|0;
                    }}
                    for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i])|0;
                }}
                for (i = 0; i < 8; i++) {{ for (j = 3; j + 1; j--) {{ var b = (hash[i]>>(j*8))&255; result += ((b < 16) ? 0 : '') + b.toString(16); }} }}
                return result;
            }}

            while (true) {{
                nonce++;
                if (nonce % 5000 === 0) {{
                    progress.style.width = Math.min(95, (nonce / 100000) * 100) + '%';
                    await new Promise(r => setTimeout(r, 0));
                }}
                
                const hashInput = payload.challengeId + nonce;
                const hashHex = sha256(hashInput);
                
                if (hashHex.startsWith(prefix)) {{
                    break;
                }}
            }}
            payload.nonce = nonce;
            progress.style.width = '100%';
            return true;
        }}

        async function executeChallenges() {{
            const log = (msg) => {{ document.getElementById('status').innerText = msg; }};
            
            {(useFingerprinting ? @"
            log('Collecting hardware telemetry...');
            payload.fingerprint.screen = screen.width + 'x' + screen.height;
            payload.fingerprint.cores = String(navigator.hardwareConcurrency || 4);
            payload.fingerprint.tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

            log('Probing graphics renderer...');
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillText('AffiniShield-V3', 2, 10);
                    payload.fingerprint.canvas = canvas.toDataURL().slice(-40);
                }
            } catch(e) {}
            " : "")}

            await solvePoW();

            {(useCaptcha ? @"
            setTimeout(() => {
                document.getElementById('loader').style.display = 'none';
                document.getElementById('captcha').style.display = 'block';
                document.getElementById('title').innerText = 'Action Required';
                log('Identity validation pending');
            }, 800);
            " : "submitChallenge();")}
        }}

        function solveCaptcha() {{
            document.getElementById('captcha').classList.add('verified');
            payload.interaction = true;
            document.getElementById('status').innerText = 'Shield verified. Reconnecting...';
            setTimeout(submitChallenge, 800);
        }}

        async function submitChallenge() {{
            try {{
                const res = await fetch('/api/waf/verify', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify(payload)
                }});
                
                const data = await res.json();
                if (data.success) {{
                    window.location.href = payload.target;
                }} else {{
                    document.getElementById('main-box').innerHTML = '<h1 style=""color: #ef4444"">Shield Denied</h1><p>' + (data.reason || 'Verification failed') + '</p><button onclick=""location.reload()"" style=""background: #1f1f23; color: white; border: 1px solid #333; padding: 0.5rem 1rem; border-radius: 0.5rem; cursor: pointer;"">Retry</button>';
                }}
            }} catch(e) {{
                document.getElementById('status').innerText = 'Network error. Retrying...';
            }}
        }}

        executeChallenges();
    </script>
</body>
</html>";

            return Content(html, "text/html");
        }

        [HttpPost("verify")]
        public async Task<IActionResult> VerifyChallenge([FromBody] ChallengePayload payload)
        {
            if (payload == null || string.IsNullOrEmpty(payload.Domain))
            {
                return BadRequest(new { success = false, reason = "Missing required fields" });
            }

            // 1. Verify PoW (Proof of Work)
            var prefix = "0000";
            var hashInput = payload.ChallengeId + payload.Nonce;
            
            using (var sha256 = SHA256.Create())
            {
                var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(hashInput));
                var hashStr = BitConverter.ToString(hashBytes).Replace("-", "").ToLower();
                
                if (!hashStr.StartsWith(prefix))
                {
                    return Unauthorized(new { success = false, reason = "Computational verification failed" });
                }
            }

            // 2. Generate Clearance Cookie
            var expiry = DateTimeOffset.UtcNow.AddHours(2).ToUnixTimeSeconds();
            var dataToSign = $"{payload.Domain}:{expiry}";
            
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(ChallengeSecret));
            var sigBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(dataToSign));
            var signature = Convert.ToBase64String(sigBytes).Replace("+", "-").Replace("/", "_").Replace("=", "");
            
            var cookieValue = $"{dataToSign}:{signature}";

            Response.Cookies.Append("affini_clearance", cookieValue, new Microsoft.AspNetCore.Http.CookieOptions
            {
                HttpOnly = true,
                Secure = Request.IsHttps,
                SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Lax,
                MaxAge = TimeSpan.FromHours(2),
                Path = "/"
            });

            return Ok(new { success = true });
        }
    }

    public class ChallengePayload
    {
        [JsonPropertyName("domain")] public string? Domain { get; set; }
        [JsonPropertyName("target")] public string? Target { get; set; }
        [JsonPropertyName("challengeId")] public string? ChallengeId { get; set; }
        [JsonPropertyName("nonce")] public int Nonce { get; set; }
        [JsonPropertyName("fingerprint")] public BrowserFingerprint? Fingerprint { get; set; }
        [JsonPropertyName("interaction")] public bool Interaction { get; set; }
    }

    public class BrowserFingerprint
    {
        [JsonPropertyName("screen")] public string? Screen { get; set; }
        [JsonPropertyName("cores")] public string? Cores { get; set; }
        [JsonPropertyName("tz")] public string? Tz { get; set; }
        [JsonPropertyName("canvas")] public string? Canvas { get; set; }
        [JsonPropertyName("renderer")] public string? Renderer { get; set; }
    }
}
