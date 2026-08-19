using AffiniSecurity.Waf.Security;
using Xunit;

namespace AffiniSecurity.Waf.Tests.Security
{
    /// <summary>
    /// Verifies the role -> permission mapping backing claims/permission-based authorization
    /// (see backend/Security/WafPermissions.cs). These pin down the exact behavior the RBAC
    /// migration is required to preserve for existing roles, plus the new read-only grant for
    /// security_analyst.
    /// </summary>
    public class WafPermissionsTests
    {
        [Theory]
        [InlineData("super_admin")]
        [InlineData("admin")]
        public void PlatformOwnerRoles_HaveEveryPermission(string role)
        {
            var permissions = WafPermissions.GetPermissionsForRole(role);

            foreach (var permission in WafPermissions.All)
            {
                Assert.Contains(permission, permissions);
            }
        }

        [Fact]
        public void TenantAdmin_CanEditFirewallButNotPlatformSettings()
        {
            var permissions = WafPermissions.GetPermissionsForRole("tenant_admin");

            Assert.Contains(WafPermissions.FirewallView, permissions);
            Assert.Contains(WafPermissions.FirewallEdit, permissions);
            Assert.DoesNotContain(WafPermissions.PlatformSettings, permissions);
            Assert.DoesNotContain(WafPermissions.PlatformAudit, permissions);
        }

        [Fact]
        public void SecurityAnalyst_CanViewFirewallButNotEdit()
        {
            var permissions = WafPermissions.GetPermissionsForRole("security_analyst");

            Assert.Contains(WafPermissions.FirewallView, permissions);
            Assert.DoesNotContain(WafPermissions.FirewallEdit, permissions);
        }

        [Fact]
        public void SupportEngineer_CannotEditFirewallRules()
        {
            // Regression guard: support_engineer was never in the old RequireFirewallManager
            // role list ("super_admin", "admin", "tenant_admin"), so it must not gain edit
            // access purely by being granted read-only analytics/platform-audit permissions.
            var permissions = WafPermissions.GetPermissionsForRole("support_engineer");

            Assert.DoesNotContain(WafPermissions.FirewallEdit, permissions);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("not_a_real_role")]
        public void UnknownOrMissingRole_GrantsNoPermissions(string? role)
        {
            var permissions = WafPermissions.GetPermissionsForRole(role);

            Assert.Empty(permissions);
        }

        [Fact]
        public void All_ContainsEveryDeclaredPermissionConstantExactlyOnce()
        {
            var expected = new[]
            {
                WafPermissions.FirewallView,
                WafPermissions.FirewallEdit,
                WafPermissions.FirewallManageGlobal,
                WafPermissions.AnalyticsView,
                WafPermissions.AnalyticsExport,
                WafPermissions.UsersView,
                WafPermissions.UsersManage,
                WafPermissions.DomainsManage,
                WafPermissions.SslManage,
                WafPermissions.PlatformAudit,
                WafPermissions.PlatformSettings,
                WafPermissions.ApiKeysManage,
            };

            Assert.Equal(expected.Length, WafPermissions.All.Count);
            foreach (var permission in expected)
            {
                Assert.Single(WafPermissions.All, p => p == permission);
            }
        }
    }
}
