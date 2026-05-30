using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Models;
using Microsoft.EntityFrameworkCore;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize(Roles = "super_admin")]
    [ApiController]
    [Route("api/platform/crs")]
    public class CrsRulesController : ControllerBase
    {
        private readonly WafDbContext _context;

        public CrsRulesController(WafDbContext context)
        {
            _context = context;
        }

        [HttpGet("rules")]
        public async Task<IActionResult> GetRules()
        {
            var rulesInDb = await _context.OWASPRules.IgnoreQueryFilters().Where(r => r.TenantId == null).ToListAsync();
            var fullList = SeedCrsRules();

            // Check for missing rules and add them
            var missingRules = fullList.Where(f => !rulesInDb.Any(r => r.RuleId == f.RuleId)).ToList();
            if (missingRules.Any())
            {
                foreach (var rule in missingRules)
                {
                    rule.Id = Guid.NewGuid().ToString();
                    _context.OWASPRules.Add(rule);
                }
                await _context.SaveChangesAsync();
                // Refresh list
                rulesInDb = await _context.OWASPRules.IgnoreQueryFilters().Where(r => r.TenantId == null).ToListAsync();
            }
            
            return Ok(rulesInDb.OrderBy(r => r.RuleId).ToList());
        }

        [HttpPatch("rules/{id}")]
        public async Task<IActionResult> UpdateRule(string id, [FromBody] OWASPRule updatedRule)
        {
            var rule = await _context.OWASPRules.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == id && r.TenantId == null);
            if (rule == null) return NotFound(new { error = "Rule not found." });

            if (updatedRule.Action != null) rule.Action = updatedRule.Action;
            if (updatedRule.Description != null) rule.Description = updatedRule.Description;
            if (updatedRule.Severity != null) rule.Severity = updatedRule.Severity;
            if (updatedRule.Category != null) rule.Category = updatedRule.Category;
            if (updatedRule.Name != null) rule.Name = updatedRule.Name;
            if (updatedRule.RuleId != null) rule.RuleId = updatedRule.RuleId;

            await _context.SaveChangesAsync();
            return Ok(rule);
        }

        [HttpPost("rules")]
        public async Task<IActionResult> CreateRule([FromBody] OWASPRule newRule)
        {
            newRule.Id = Guid.NewGuid().ToString();
            newRule.TenantId = null; // Ensure it's a platform rule
            _context.OWASPRules.Add(newRule);
            await _context.SaveChangesAsync();
            return Ok(newRule);
        }

        [HttpDelete("rules/{id}")]
        public async Task<IActionResult> DeleteRule(string id)
        {
            var rule = await _context.OWASPRules.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == id && r.TenantId == null);
            if (rule == null) return NotFound();

            _context.OWASPRules.Remove(rule);
            await _context.SaveChangesAsync();
            return Ok();
        }

        private List<OWASPRule> SeedCrsRules()
        {
            return new List<OWASPRule>
            {
                // 911: Method Enforcement
                new OWASPRule { RuleId = "911100", Name = "Method Not Allowed (TRACE/TRACK)", Category = "POLICY", Severity = "ERROR", Action = "BLOCK", Description = "Blocks TRACE and TRACK methods to prevent information disclosure." },
                new OWASPRule { RuleId = "911110", Name = "Illegal HTTP Method", Category = "POLICY", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks non-standard HTTP methods that are not in the allowed list." },

                // 913: Scanner Detection
                new OWASPRule { RuleId = "913100", Name = "Known Security Scanner", Category = "SCANNER", Severity = "CRITICAL", Action = "BLOCK", Description = "Identifies requests from known security scanners like Nmap, Nessus, Acunetix." },
                new OWASPRule { RuleId = "913110", Name = "Scanner Header Detection", Category = "SCANNER", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects HTTP headers typically associated with scanners (e.g., X-Scanner)." },
                new OWASPRule { RuleId = "913120", Name = "Aggressive Crawler Detection", Category = "SCANNER", Severity = "WARNING", Action = "LOG", Description = "Detects high-frequency requests from known aggressive bots." },
                new OWASPRule { RuleId = "913130", Name = "User-Agent Scanner Match", Category = "SCANNER", Severity = "CRITICAL", Action = "BLOCK", Description = "Matches User-Agent strings known to belong to security auditing tools." },

                // 920: Protocol Validation (Expanded)
                new OWASPRule { RuleId = "920100", Name = "Invalid HTTP Request Line", Category = "PROTOCOL", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects protocol violations such as invalid request lines." },
                new OWASPRule { RuleId = "920120", Name = "HTTP Protocol Version Not Allowed", Category = "PROTOCOL", Severity = "CRITICAL", Action = "BLOCK", Description = "Restricts the allowed HTTP protocol versions (1.0, 1.1, 2.0)." },
                new OWASPRule { RuleId = "920130", Name = "Illegal Request Header", Category = "PROTOCOL", Severity = "WARNING", Action = "LOG", Description = "Identifies headers that violate HTTP standards." },
                new OWASPRule { RuleId = "920170", Name = "GET/HEAD Request with Body", Category = "PROTOCOL", Severity = "ERROR", Action = "BLOCK", Description = "Blocks GET or HEAD requests that contain an unexpected message body." },
                new OWASPRule { RuleId = "920180", Name = "POST Request Missing Content-Type", Category = "PROTOCOL", Severity = "ERROR", Action = "BLOCK", Description = "Ensures POST requests include a valid Content-Type header." },
                new OWASPRule { RuleId = "920190", Name = "Illegal Range Header", Category = "PROTOCOL", Severity = "WARNING", Action = "LOG", Description = "Detects malformed Range headers." },
                new OWASPRule { RuleId = "920200", Name = "Range Header DoS Check", Category = "PROTOCOL", Severity = "WARNING", Action = "LOG", Description = "Detects potential DoS attacks using range headers." },
                new OWASPRule { RuleId = "920210", Name = "Multiple Connection Headers", Category = "PROTOCOL", Severity = "WARNING", Action = "LOG", Description = "Detects multiple Connection headers which can be used for smuggling." },
                new OWASPRule { RuleId = "920230", Name = "Multiple Content-Length Headers", Category = "PROTOCOL", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects multiple Content-Length headers (Smuggling Attempt)." },
                new OWASPRule { RuleId = "920270", Name = "Missing Host Header", Category = "PROTOCOL", Severity = "ERROR", Action = "BLOCK", Description = "Ensures the Host header is present in HTTP/1.1 requests." },
                new OWASPRule { RuleId = "920271", Name = "Empty Host Header", Category = "PROTOCOL", Severity = "ERROR", Action = "BLOCK", Description = "Blocks requests with an empty Host header." },
                new OWASPRule { RuleId = "920280", Name = "Request Missing Accept Header", Category = "PROTOCOL", Severity = "NOTICE", Action = "LOG", Description = "Flags requests missing the Accept header." },
                new OWASPRule { RuleId = "920300", Name = "Missing Content-Length in POST", Category = "PROTOCOL", Severity = "ERROR", Action = "BLOCK", Description = "Blocks POST requests that do not specify a content length." },
                new OWASPRule { RuleId = "920320", Name = "Missing User-Agent Header", Category = "PROTOCOL", Severity = "NOTICE", Action = "LOG", Description = "Flags requests missing the User-Agent header." },
                new OWASPRule { RuleId = "920350", Name = "Numeric IP Host Header", Category = "PROTOCOL", Severity = "WARNING", Action = "LOG", Description = "Detects requests where the Host header is an IP address." },
                new OWASPRule { RuleId = "920420", Name = "Illegal Content-Type", Category = "PROTOCOL", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks requests with unauthorized Content-Type headers." },
                new OWASPRule { RuleId = "920440", Name = "URL Encoding Validation", Category = "PROTOCOL", Severity = "ERROR", Action = "BLOCK", Description = "Detects invalid URL encoding (%XX) in the request URI." },
                new OWASPRule { RuleId = "920470", Name = "Null Byte Injection", Category = "PROTOCOL", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects null byte (%00) characters in the request." },
                new OWASPRule { RuleId = "920480", Name = "Request Content-Type Charset Check", Category = "PROTOCOL", Severity = "WARNING", Action = "LOG", Description = "Validates the charset specified in Content-Type." },
                new OWASPRule { RuleId = "921110", Name = "HTTP Response Splitting", Category = "PROTOCOL", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects CR/LF characters in headers to prevent splitting." },
                new OWASPRule { RuleId = "921120", Name = "HTTP Header Injection", Category = "PROTOCOL", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects newline characters in headers (Injection Attempt)." },

                // 930: LFI (Expanded)
                new OWASPRule { RuleId = "930100", Name = "Path Traversal Attack", Category = "LFI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects directory traversal patterns (../)." },
                new OWASPRule { RuleId = "930110", Name = "Path Traversal (/etc/passwd)", Category = "LFI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detection for attempts to read system password files." },
                new OWASPRule { RuleId = "930120", Name = "OS File Access Attempt", Category = "LFI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects access to sensitive OS configuration files." },
                new OWASPRule { RuleId = "930130", Name = "Restricted File Access (.env)", Category = "LFI", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks access to .env and .htaccess files." },
                new OWASPRule { RuleId = "931100", Name = "RFI Attack Detection", Category = "RFI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects Remote File Inclusion (external URLs in params)." },
                new OWASPRule { RuleId = "931110", Name = "RFI Scheme Validation", Category = "RFI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects illegal URI schemes (ftp://, data://) in params." },
                new OWASPRule { RuleId = "931120", Name = "RFI Common Payload Match", Category = "RFI", Severity = "CRITICAL", Action = "BLOCK", Description = "Matches common RFI payloads like 'c99shell'." },

                // 932: RCE (Expanded)
                new OWASPRule { RuleId = "932100", Name = "Remote Command Execution", Category = "RCE", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects common shell command execution patterns." },
                new OWASPRule { RuleId = "932110", Name = "Unix Command Injection", Category = "RCE", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects Unix shell command injection sequences." },
                new OWASPRule { RuleId = "932115", Name = "Unix Shell Pipeline Match", Category = "RCE", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects Unix shell pipes (|) and redirects (>) in params." },
                new OWASPRule { RuleId = "932120", Name = "Unix Shell Script Injection", Category = "RCE", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects shebang (#! /bin/sh) in request body." },
                new OWASPRule { RuleId = "932130", Name = "Unix Command Injection (Expansion)", Category = "RCE", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects shell expansions ($() or ``)." },
                new OWASPRule { RuleId = "932150", Name = "Windows Command Injection", Category = "RCE", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects Windows-specific command injection (cmd.exe)." },
                new OWASPRule { RuleId = "932160", Name = "Shellshock Attack Detection", Category = "RCE", Severity = "CRITICAL", Action = "BLOCK", Description = "Protects against Shellshock (CVE-2014-6271)." },
                new OWASPRule { RuleId = "932170", Name = "Unix Shell Backdoor Detection", Category = "RCE", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects common PHP/Unix backdoor shells." },
                new OWASPRule { RuleId = "932180", Name = "Restricted OS Commands Match", Category = "RCE", Severity = "CRITICAL", Action = "BLOCK", Description = "Blocks commands like 'netstat', 'ifconfig', 'whoami'." },

                // 933: PHP Injection (Expanded)
                new OWASPRule { RuleId = "933100", Name = "PHP Injection Attack", Category = "PHP", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects PHP-specific injection patterns (eval, system)." },
                new OWASPRule { RuleId = "933110", Name = "PHP Script Tag Detection", Category = "PHP", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects <?php tag injection." },
                new OWASPRule { RuleId = "933120", Name = "PHP Configuration Override", Category = "PHP", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects attempts to override PHP config via params." },
                new OWASPRule { RuleId = "933130", Name = "PHP Variable Overwrite", Category = "PHP", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects attempts to overwrite global PHP variables." },
                new OWASPRule { RuleId = "933150", Name = "PHP Data Stream Wrapper Match", Category = "PHP", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects 'php://input' or 'php://filter' wrappers." },

                // 934: Node.js Injection (Expanded)
                new OWASPRule { RuleId = "934100", Name = "Node.js Injection Attack", Category = "NODEJS", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects JS/Node.js server-side injection patterns." },
                new OWASPRule { RuleId = "934110", Name = "Node.js Process Access", Category = "NODEJS", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects access to 'process.' object in params." },
                new OWASPRule { RuleId = "934120", Name = "Node.js Global Variable Match", Category = "NODEJS", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects 'global.' or 'require.' access." },

                // 941: XSS (Expanded)
                new OWASPRule { RuleId = "941100", Name = "XSS Filter - Libinjection", Category = "XSS", Severity = "CRITICAL", Action = "BLOCK", Description = "Uses Libinjection for advanced XSS detection." },
                new OWASPRule { RuleId = "941110", Name = "XSS Filter - HTML Injection", Category = "XSS", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects script, iframe, object tag injections." },
                new OWASPRule { RuleId = "941120", Name = "XSS Filter - JavaScript URI", Category = "XSS", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects 'javascript:' URI scheme in params." },
                new OWASPRule { RuleId = "941130", Name = "XSS Filter - Expression Detection", Category = "XSS", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects CSS 'expression()' or '-moz-binding'." },
                new OWASPRule { RuleId = "941140", Name = "XSS Filter - VBScript Detection", Category = "XSS", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects 'vbscript:' URI scheme." },
                new OWASPRule { RuleId = "941150", Name = "XSS Filter - Tag Content Match", Category = "XSS", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects common XSS payloads in HTML content." },
                new OWASPRule { RuleId = "941160", Name = "XSS Filter - Attribute Injection", Category = "XSS", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects XSS in HTML event attributes (onclick)." },
                new OWASPRule { RuleId = "941170", Name = "XSS Filter - OnError Detection", Category = "XSS", Severity = "CRITICAL", Action = "BLOCK", Description = "Specific detection for 'onerror' XSS payloads." },
                new OWASPRule { RuleId = "941180", Name = "XSS Filter - Style Attribute Match", Category = "XSS", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects XSS in HTML style attributes." },
                new OWASPRule { RuleId = "941200", Name = "XSS Filter - JS Keyword Match", Category = "XSS", Severity = "CRITICAL", Action = "BLOCK", Description = "Matches 'alert(', 'confirm(', 'prompt('." },
                new OWASPRule { RuleId = "941210", Name = "XSS Filter - JS Object Access", Category = "XSS", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects 'window.', 'document.', 'location.' access." },
                new OWASPRule { RuleId = "941320", Name = "XSS Filter - Script Tag Match", Category = "XSS", Severity = "CRITICAL", Action = "BLOCK", Description = "Direct script tag injection detection." },

                // 942: SQL Injection (Expanded)
                new OWASPRule { RuleId = "942100", Name = "SQL Injection - Libinjection", Category = "SQLI", Severity = "CRITICAL", Action = "BLOCK", Description = "Uses Libinjection for common SQL sequences." },
                new OWASPRule { RuleId = "942110", Name = "SQL Injection - Common Comments", Category = "SQLI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects -- , # , /* comments used for bypass." },
                new OWASPRule { RuleId = "942120", Name = "Blind SQL Injection Detection", Category = "SQLI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects boolean/time-based blind SQLi attempts." },
                new OWASPRule { RuleId = "942130", Name = "SQL Injection - Tautology", Category = "SQLI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects '1'='1' or 'a'='a' tautologies." },
                new OWASPRule { RuleId = "942140", Name = "SQL Injection - UNION Match", Category = "SQLI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects SQL UNION SELECT injection attempts." },
                new OWASPRule { RuleId = "942150", Name = "SQL Injection - Oracle Specific", Category = "SQLI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects Oracle SQLi patterns." },
                new OWASPRule { RuleId = "942160", Name = "SQL Injection - MySQL Specific", Category = "SQLI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects MySQL specific functions (version(), user())." },
                new OWASPRule { RuleId = "942170", Name = "SQL Injection - PgSQL Specific", Category = "SQLI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects PostgreSQL specific functions." },
                new OWASPRule { RuleId = "942180", Name = "SQL Injection - MSSQL Specific", Category = "SQLI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects MSSQL specific functions (xp_cmdshell)." },
                new OWASPRule { RuleId = "942190", Name = "NoSQL Injection Detection", Category = "SQLI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects MongoDB injection via JSON syntax." },
                new OWASPRule { RuleId = "942200", Name = "SQL Injection - Sleep Match", Category = "SQLI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects SQL SLEEP() or BENCHMARK() calls." },
                new OWASPRule { RuleId = "942210", Name = "SQL Injection - Hex Encoding", Category = "SQLI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects hex-encoded SQL commands (0x...)." },
                new OWASPRule { RuleId = "942260", Name = "SQL Injection - Keyword Match", Category = "SQLI", Severity = "CRITICAL", Action = "BLOCK", Description = "Matches keywords like 'SELECT', 'DROP', 'UPDATE', 'DELETE'." },
                new OWASPRule { RuleId = "942300", Name = "SQL Injection - Char Match", Category = "SQLI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects SQL CHAR() or CONCAT() functions." },
                new OWASPRule { RuleId = "942330", Name = "SQL Injection - Order By Match", Category = "SQLI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects SQL ORDER BY injection attempts." },
                new OWASPRule { RuleId = "942370", Name = "SQL Injection - Subquery Match", Category = "SQLI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects nested SQL subqueries in params." },

                // 943: Session Fixation
                new OWASPRule { RuleId = "943100", Name = "Session Fixation Attack", Category = "SESSION", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects session ID manipulation." },
                new OWASPRule { RuleId = "943110", Name = "Session Cookie Overwrite", Category = "SESSION", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects attempts to set session cookies via URI." },

                // 944: Java Injection (Expanded)
                new OWASPRule { RuleId = "944100", Name = "Java Injection Attack", Category = "JAVA", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects Java RMI/JNDI attack attempts." },
                new OWASPRule { RuleId = "944110", Name = "Java Class Loading Attack", Category = "JAVA", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects attempts to load malicious Java classes." },
                new OWASPRule { RuleId = "944120", Name = "Java Deserialization Attack", Category = "JAVA", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects common Java deserialization payloads." },
                new OWASPRule { RuleId = "944130", Name = "Java Log4j Protection", Category = "JAVA", Severity = "CRITICAL", Action = "BLOCK", Description = "Protection against Log4j (Log4Shell) attacks." },
                new OWASPRule { RuleId = "944200", Name = "Spring Expression Injection", Category = "JAVA", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects Spring SpEL injection attempts." },
                new OWASPRule { RuleId = "944210", Name = "Struts2 RCE Detection", Category = "JAVA", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects common Struts2 OGNL injection patterns." },

                // 913: Scanner Detection (More)
                new OWASPRule { RuleId = "913101", Name = "Scanner Detection (Nikto)", Category = "SCANNER", Severity = "CRITICAL", Action = "BLOCK", Description = "Specific detection for Nikto scanner headers." },
                new OWASPRule { RuleId = "913102", Name = "Scanner Detection (SQLmap)", Category = "SCANNER", Severity = "CRITICAL", Action = "BLOCK", Description = "Specific detection for SQLmap headers and payloads." },
                new OWASPRule { RuleId = "913103", Name = "Scanner Detection (ZAP)", Category = "SCANNER", Severity = "CRITICAL", Action = "BLOCK", Description = "Specific detection for OWASP ZAP scanner traffic." },

                // 921: Response Splitting (More)
                new OWASPRule { RuleId = "921130", Name = "HTTP Header Splitting Match", Category = "PROTOCOL", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects splitting characters in known header fields." },
                new OWASPRule { RuleId = "921140", Name = "Cookie Injection Match", Category = "PROTOCOL", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects newline characters in Set-Cookie headers." },

                // 930: Path Traversal (More)
                new OWASPRule { RuleId = "930101", Name = "Windows Path Traversal", Category = "LFI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects Windows-style path traversal (..\\)." },
                new OWASPRule { RuleId = "930111", Name = "Windows System File Access", Category = "LFI", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects access to C:\\Windows\\... files." },

                // 950-954: Data Leakage
                new OWASPRule { RuleId = "950100", Name = "Data Leakage - PHP Error", Category = "LEAKAGE", Severity = "ERROR", Action = "LOG", Description = "Detects PHP error messages in responses." },
                new OWASPRule { RuleId = "950110", Name = "Data Leakage - SQL Error", Category = "LEAKAGE", Severity = "ERROR", Action = "LOG", Description = "Detects SQL database error messages in responses." },
                new OWASPRule { RuleId = "951100", Name = "Data Leakage - Source Code", Category = "LEAKAGE", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects source code leakage in responses." },
                new OWASPRule { RuleId = "952100", Name = "Data Leakage - PII (Email)", Category = "LEAKAGE", Severity = "WARNING", Action = "LOG", Description = "Detects potential PII (Email addresses) in responses." },
                new OWASPRule { RuleId = "953100", Name = "Data Leakage - US SSN", Category = "LEAKAGE", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects potential US Social Security Numbers in responses." },
                new OWASPRule { RuleId = "954100", Name = "Data Leakage - Credit Card", Category = "LEAKAGE", Severity = "CRITICAL", Action = "BLOCK", Description = "Detects potential Credit Card numbers in responses (PCI-DSS)." },
                new OWASPRule { RuleId = "954110", Name = "Data Leakage - Visa Card", Category = "LEAKAGE", Severity = "CRITICAL", Action = "BLOCK", Description = "Specific detection for Visa card numbers." },
                new OWASPRule { RuleId = "954120", Name = "Data Leakage - MasterCard", Category = "LEAKAGE", Severity = "CRITICAL", Action = "BLOCK", Description = "Specific detection for MasterCard numbers." }
            };
        }
    }
}
