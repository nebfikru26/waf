using Microsoft.EntityFrameworkCore.Diagnostics;
using System.Data.Common;
using AffiniSecurity.Waf.Services;
using Microsoft.Extensions.DependencyInjection;

namespace AffiniSecurity.Waf.Data
{
    public class TenantDbInterceptor : DbConnectionInterceptor
    {
        private readonly IServiceProvider _serviceProvider;

        public TenantDbInterceptor(IServiceProvider serviceProvider)
        {
            _serviceProvider = serviceProvider;
        }

        public override async Task ConnectionOpenedAsync(
            DbConnection connection,
            ConnectionEndEventData eventData,
            CancellationToken cancellationToken = default)
        {
            await base.ConnectionOpenedAsync(connection, eventData, cancellationToken);

            using var scope = _serviceProvider.CreateScope();
            var tenantService = scope.ServiceProvider.GetService<ITenantService>();
            var httpContext = scope.ServiceProvider.GetService<IHttpContextAccessor>()?.HttpContext;
            var path = httpContext?.Request.Path.Value?.ToLower() ?? "";
            
            string tenantId;
            if (httpContext == null)
            {
                // Background service / System task
                tenantId = "SYSTEM_ADMIN";
            }
            else if (path.Contains("/api/auth/login") || path.Contains("/api/auth/signup") || path.Contains("/api/auth/debug-users"))
            {
                tenantId = "AUTH_SERVICE";
            }
            else
            {
                tenantId = tenantService?.IsPlatformAdmin == true ? "SYSTEM_ADMIN" : (tenantService?.TenantId ?? "NONE");
            }

            using var command = connection.CreateCommand();
            command.CommandText = $"SET app.current_tenant_id = '{tenantId}'";
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        public override void ConnectionOpened(
            DbConnection connection,
            ConnectionEndEventData eventData)
        {
            base.ConnectionOpened(connection, eventData);

            using var scope = _serviceProvider.CreateScope();
            var tenantService = scope.ServiceProvider.GetService<ITenantService>();
            var httpContext = scope.ServiceProvider.GetService<IHttpContextAccessor>()?.HttpContext;
            var path = httpContext?.Request.Path.Value?.ToLower() ?? "";
            
            string tenantId;
            if (httpContext == null)
            {
                // Background service / System task
                tenantId = "SYSTEM_ADMIN";
            }
            else if (path.Contains("/api/auth/login") || path.Contains("/api/auth/signup") || path.Contains("/api/auth/debug-users"))
            {
                tenantId = "AUTH_SERVICE";
            }
            else
            {
                tenantId = tenantService?.IsPlatformAdmin == true ? "SYSTEM_ADMIN" : (tenantService?.TenantId ?? "NONE");
            }

            using var command = connection.CreateCommand();
            command.CommandText = $"SET app.current_tenant_id = '{tenantId}'";
            command.ExecuteNonQuery();
        }
    }
}
