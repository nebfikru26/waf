using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using AffiniSecurity.Waf.Models;
using AffiniSecurity.Waf.Security;
using System.Text.RegularExpressions;
using System.Collections.Generic;
using System;
using System.Linq;

namespace AffiniSecurity.Waf.Controllers
{
    [Authorize(Policy = WafPolicies.RequireFirewallManager)]
    [ApiController]
    [Route("api/firewall/sandbox")]
    public class SandboxController : ControllerBase
    {
        public class SandboxRequest
        {
            public CustomRule Rule { get; set; }
            public MockHttpRequest Request { get; set; }
        }

        public class MockHttpRequest
        {
            public string Method { get; set; } = "GET";
            public string Uri { get; set; } = "/";
            public string Body { get; set; } = "";
            public Dictionary<string, string> Headers { get; set; } = new Dictionary<string, string>();
            public string IpAddress { get; set; } = "127.0.0.1";
        }

        [HttpPost]
        public IActionResult EvaluateRule([FromBody] SandboxRequest payload)
        {
            if (payload?.Rule == null || payload?.Request == null) 
                return BadRequest(new { Message = "Invalid payload." });

            bool isMatch = false;

            if (payload.Rule.IsRaw)
            {
                // We cannot fully simulate Coraza ModSecurity locally in C# safely.
                return Ok(new { 
                    IsMatch = false, 
                    Simulated = false, 
                    Message = "Raw ModSecurity rules cannot be evaluated offline. They require edge compiling." 
                });
            }

            try 
            {
                bool cond1 = EvaluateCondition(payload.Rule.ConditionField, payload.Rule.ConditionOperator, payload.Rule.ConditionValue, payload.Request);
                
                if (string.IsNullOrEmpty(payload.Rule.LogicOperator))
                {
                    isMatch = cond1;
                }
                else
                {
                    bool cond2 = EvaluateCondition(payload.Rule.Condition2Field, payload.Rule.Condition2Operator, payload.Rule.Condition2Value, payload.Request);
                    
                    if (payload.Rule.LogicOperator.ToUpper() == "AND") isMatch = cond1 && cond2;
                    else if (payload.Rule.LogicOperator.ToUpper() == "OR") isMatch = cond1 || cond2;
                }

                return Ok(new { IsMatch = isMatch, Simulated = true, Action = payload.Rule.Action });
            }
            catch (Exception ex)
            {
                return BadRequest(new { Message = $"Simulation failed: {ex.Message}" });
            }
        }

        private bool EvaluateCondition(string field, string op, string expectedValue, MockHttpRequest req)
        {
            if (string.IsNullOrEmpty(field) || string.IsNullOrEmpty(op)) return false;

            string actualValue = "";

            if (field.ToLower() == "uri" || field.ToLower() == "url") actualValue = req.Uri;
            else if (field.ToLower() == "ip") actualValue = req.IpAddress;
            else if (field.ToLower() == "body") actualValue = req.Body;
            else if (field.ToLower() == "method") actualValue = req.Method;
            else if (field.ToLower() == "user_agent")
            {
                var hFound = req.Headers.Keys.FirstOrDefault(k => k.ToLower() == "user-agent");
                actualValue = hFound != null ? req.Headers[hFound] : "";
            }
            else if (field.ToLower() == "country")
            {
                // Cannot natively evaluate IP-to-Country local without DB
                return false; 
            }
            else if (field.ToLower() == "header") 
            {
                if (expectedValue.Contains(":"))
                {
                    var split = expectedValue.Split(':', 2);
                    var hName = split[0].Trim().ToLower();
                    expectedValue = split[1].Trim();
                    
                    var hFound = req.Headers.Keys.FirstOrDefault(k => k.ToLower() == hName);
                    actualValue = hFound != null ? req.Headers[hFound] : "";
                }
            }

            actualValue = actualValue ?? "";
            expectedValue = expectedValue ?? "";

            switch (op.ToLower())
            {
                case "equals": return actualValue.Equals(expectedValue, StringComparison.OrdinalIgnoreCase);
                case "not_equals": return !actualValue.Equals(expectedValue, StringComparison.OrdinalIgnoreCase);
                case "contains": return actualValue.IndexOf(expectedValue, StringComparison.OrdinalIgnoreCase) >= 0;
                case "starts_with": return actualValue.StartsWith(expectedValue, StringComparison.OrdinalIgnoreCase);
                case "ends_with": return actualValue.EndsWith(expectedValue, StringComparison.OrdinalIgnoreCase);
                case "regex":
                case "matches_regex": return Regex.IsMatch(actualValue, expectedValue, RegexOptions.IgnoreCase);
                default: throw new Exception($"Unsupported operator {op}");
            }
        }
    }
}
