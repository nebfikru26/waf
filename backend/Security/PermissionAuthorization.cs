using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;

namespace AffiniSecurity.Waf.Security
{
    /// <summary>
    /// An authorization requirement satisfied when the current user's role grants the given
    /// permission, per <see cref="WafPermissions.GetPermissionsForRole"/>.
    /// </summary>
    public class PermissionRequirement : IAuthorizationRequirement
    {
        public string Permission { get; }

        public PermissionRequirement(string permission)
        {
            Permission = permission;
        }
    }

    /// <summary>
    /// Resolves a <see cref="PermissionRequirement"/> against the user's role claim. Roles are
    /// mapped to permission sets in <see cref="WafPermissions"/>, so authorization checks stay
    /// claims/permission-based (auditable, per-capability) instead of hard-coded role lists
    /// scattered across controllers.
    /// </summary>
    public class PermissionAuthorizationHandler : AuthorizationHandler<PermissionRequirement>
    {
        protected override Task HandleRequirementAsync(
            AuthorizationHandlerContext context,
            PermissionRequirement requirement)
        {
            var role = context.User.FindFirst(ClaimTypes.Role)?.Value;
            var permissions = WafPermissions.GetPermissionsForRole(role);

            if (permissions.Contains(requirement.Permission))
            {
                context.Succeed(requirement);
            }

            return Task.CompletedTask;
        }
    }
}
