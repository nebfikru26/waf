using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using AffiniSecurity.Waf.Security;
using Microsoft.AspNetCore.Authorization;
using Xunit;

namespace AffiniSecurity.Waf.Tests.Security
{
    /// <summary>
    /// Exercises PermissionAuthorizationHandler directly against ClaimsPrincipal role claims,
    /// without needing a full ASP.NET Core host/DI container.
    /// </summary>
    public class PermissionAuthorizationHandlerTests
    {
        private static ClaimsPrincipal UserWithRole(string? role)
        {
            var identity = new ClaimsIdentity(authenticationType: "Test");
            if (role != null)
            {
                identity.AddClaim(new Claim(ClaimTypes.Role, role));
            }
            return new ClaimsPrincipal(identity);
        }

        private static async Task<bool> AuthorizeAsync(string? role, string permission)
        {
            var requirement = new PermissionRequirement(permission);
            var context = new AuthorizationHandlerContext(
                new[] { requirement }, UserWithRole(role), resource: null);

            var handler = new PermissionAuthorizationHandler();
            await handler.HandleAsync(context);

            return context.HasSucceeded;
        }

        [Fact]
        public async Task SuperAdmin_IsAuthorizedForFirewallEdit()
        {
            Assert.True(await AuthorizeAsync("super_admin", WafPermissions.FirewallEdit));
        }

        [Fact]
        public async Task SecurityAnalyst_IsNotAuthorizedForFirewallEdit()
        {
            Assert.False(await AuthorizeAsync("security_analyst", WafPermissions.FirewallEdit));
        }

        [Fact]
        public async Task SecurityAnalyst_IsAuthorizedForFirewallView()
        {
            Assert.True(await AuthorizeAsync("security_analyst", WafPermissions.FirewallView));
        }

        [Fact]
        public async Task MissingRoleClaim_IsNeverAuthorized()
        {
            Assert.False(await AuthorizeAsync(role: null, WafPermissions.FirewallView));
        }

        [Fact]
        public async Task UnknownRole_IsNeverAuthorized()
        {
            Assert.False(await AuthorizeAsync("totally_made_up_role", WafPermissions.PlatformSettings));
        }
    }
}
