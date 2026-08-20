using Microsoft.EntityFrameworkCore;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Services;
using AffiniSecurity.Waf.Middleware;
using AffiniSecurity.Waf.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(args);
Console.WriteLine("[Startup] WAF VERSION 2026.1 - UPDATED CODE LOADED");

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Database
builder.Services.AddSingleton<TenantDbInterceptor>();
builder.Services.AddDbContext<WafDbContext>((sp, options) => {
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"))
           .AddInterceptors(sp.GetRequiredService<TenantDbInterceptor>());
});

// Services
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ITenantService, TenantService>();
builder.Services.AddSingleton<IRedisService, RedisService>();
builder.Services.AddSingleton<INatsService, NatsService>();
builder.Services.AddSingleton<WafConfigGenerator>();
builder.Services.AddSingleton<IClickHouseService, ClickHouseService>();
builder.Services.AddScoped<IAuditService, ImmutableAuditService>();
builder.Services.AddSingleton<IK8sCertManagerService, K8sCertManagerService>();
builder.Services.AddHostedService<CertbotBackgroundService>();
builder.Services.AddHostedService<NatsLogIngester>();
builder.Services.AddHostedService<AiHealthMonitorService>();

// Register CrsDiscoveryService as a singleton so it can be injected by controllers,
// and also add it as a HostedService to run in the background.
builder.Services.AddSingleton<CrsDiscoveryService>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<CrsDiscoveryService>());

// Register ThreatFeedService — polls AlienVault OTX every 6 hours for live IOC feeds.
builder.Services.AddSingleton<ThreatIntelligenceService>();
builder.Services.AddSingleton<IThreatIntelligenceService>(provider => provider.GetRequiredService<ThreatIntelligenceService>());
builder.Services.AddSingleton<ThreatFeedService>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<ThreatFeedService>());

// Authentication & Authorization
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        var jwtIssuer   = builder.Configuration["Waf:JwtIssuer"];
        var jwtAudience = builder.Configuration["Waf:JwtAudience"];
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.ASCII.GetBytes(builder.Configuration["Waf:JwtSecret"]!)),
            // Issuer/Audience validation: when configured via env (production), JWTs
            // from foreign systems are rejected. When not configured (dev), validation
            // is skipped to allow easy local testing without extra setup.
            ValidateIssuer   = !string.IsNullOrEmpty(jwtIssuer),
            ValidIssuer      = jwtIssuer,
            ValidateAudience = !string.IsNullOrEmpty(jwtAudience),
            ValidAudience    = jwtAudience,
            ClockSkew        = TimeSpan.Zero
        };
        options.Events = new JwtBearerEvents
        {
            // Prefer an explicit Authorization header (API keys/scripts), and fall back to the
            // HttpOnly session cookie set by AuthController/AdminController. This lets the
            // frontend authenticate purely via the cookie without ever storing the raw JWT
            // in JS-readable storage.
            OnMessageReceived = context =>
            {
                if (string.IsNullOrEmpty(context.Token) &&
                    context.Request.Cookies.TryGetValue(AffiniSecurity.Waf.Security.CookieAuth.SessionCookieName, out var cookieToken) &&
                    !string.IsNullOrEmpty(cookieToken))
                {
                    context.Token = cookieToken;
                }
                return Task.CompletedTask;
            }
        };
    });

// Claims/permission-based authorization: a single handler resolves every policy below by
// checking whether the caller's role grants the requested permission, per the role -> permission
// map in WafPermissions.cs. This replaces the previous hard-coded RequireRole(...) lists.
builder.Services.AddSingleton<IAuthorizationHandler, PermissionAuthorizationHandler>();

builder.Services.AddAuthorization(options =>
{
    // Legacy bundle policies, preserved by name so every existing [Authorize(Policy = WafPolicies.X)]
    // call site keeps working unchanged. Each now maps to the representative granular permission
    // that reproduces its previous role list exactly (see WafPermissions.GetPermissionsForRole).
    options.AddPolicy(WafPolicies.RequirePlatformAdmin, policy =>
        policy.Requirements.Add(new PermissionRequirement(WafPermissions.PlatformSettings)));

    options.AddPolicy(WafPolicies.RequireFirewallManager, policy =>
        policy.Requirements.Add(new PermissionRequirement(WafPermissions.FirewallEdit)));

    options.AddPolicy(WafPolicies.RequireAnalyticsViewer, policy =>
        policy.Requirements.Add(new PermissionRequirement(WafPermissions.AnalyticsView)));

    options.AddPolicy(WafPolicies.RequireUserAdministrator, policy =>
        policy.Requirements.Add(new PermissionRequirement(WafPermissions.UsersManage)));

    // Fine-grained permission policies, one per WafPermissions constant, so controllers can opt
    // into specific capabilities (e.g. [Authorize(Policy = WafPermissions.FirewallView)]) instead
    // of the coarser bundles above.
    foreach (var permission in WafPermissions.All)
    {
        options.AddPolicy(permission, policy =>
            policy.Requirements.Add(new PermissionRequirement(permission)));
    }
});

// CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        var allowedOrigins = builder.Configuration["Waf:AllowedOrigins"]?.Split(',') ?? Array.Empty<string>();
        policy.WithOrigins(allowedOrigins) // Restricts specifically to authorized domains
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

var app = builder.Build();

// ── Fail-Fast Security Guard ────────────────────────────────────────────────
// Crash loudly at startup rather than silently running with a weak or missing
// JWT secret. This prevents an environment misconfiguration from ever reaching
// production traffic.
var jwtSecretCheck = app.Configuration["Waf:JwtSecret"];
if (string.IsNullOrWhiteSpace(jwtSecretCheck) || jwtSecretCheck.Length < 32)
    throw new InvalidOperationException(
        "[Security] Waf:JwtSecret is missing or too short (< 32 chars). " +
        "Set a strong secret via the WAF_JWT_SECRET environment variable. Application will not start.");
var challengeSecretCheck = app.Configuration["Waf:ChallengeSecret"];
if (string.IsNullOrWhiteSpace(challengeSecretCheck) || challengeSecretCheck.Length < 32)
    throw new InvalidOperationException(
        "[Security] Waf:ChallengeSecret is missing or too short (< 32 chars). " +
        "Set a strong secret via the CHALLENGE_SECRET environment variable. Application will not start.");
Console.WriteLine("[Security] Secret validation passed — JWT and Challenge secrets are present and adequately sized.");
// ─────────────────────────────────────────────────────────────────────────────

// Initialize Database
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try 
    {
        var context = services.GetRequiredService<WafDbContext>();
        DbInitializer.Initialize(context);

        try 
        {
            var clickhouse = services.GetRequiredService<IClickHouseService>();
            int retries = 10;
            while (retries > 0)
            {
                try
                {
                    clickhouse.InitializeAsync().Wait();
                    Console.WriteLine("[Startup] ClickHouse Initialization Succeeded.");
                    break;
                }
                catch (Exception)
                {
                    retries--;
                    if (retries == 0) throw;
                    Console.WriteLine($"[Startup] ClickHouse not ready. Retrying in 3 seconds... ({retries} retries left)");
                    System.Threading.Thread.Sleep(3000);
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Startup] ClickHouse Initialization Failed after retries: {ex.Message}");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Startup] Database Initialization Failed: {ex.Message}");
    }

    // Trigger initial WAF config generation
    try
    {
        var generator = services.GetRequiredService<WafConfigGenerator>();
        _ = Task.Run(async () => await generator.GenerateAndReloadAsync());
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Startup] WAF Config Generation Failed: {ex.Message}");
    }
}

// Configure the HTTP request pipeline.
var forwardedOptions = new ForwardedHeadersOptions
{
    ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto
};
forwardedOptions.KnownNetworks.Clear();
forwardedOptions.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedOptions);

if (app.Environment.IsDevelopment())
{
    // app.UseDeveloperExceptionPage(); // Disabled to ensure JSON responses for the frontend
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.Use(async (context, next) => {
    Console.WriteLine($"[RouteLog] {context.Request.Method} {context.Request.Path}");
    await next();
});

app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseCors("AllowFrontend");
app.UseMiddleware<DistributedRateLimiterMiddleware>();
app.UseMiddleware<GlobalExceptionHandlerMiddleware>();
app.UseMiddleware<ComplianceScrubberMiddleware>();
app.UseMiddleware<TrafficLoggerMiddleware>();
app.UseStaticFiles();
app.UseMiddleware<ApiKeyMiddleware>();
app.UseAuthentication();
app.UseMiddleware<TenantContextMiddleware>();
app.UseMiddleware<WAFInspectorMiddleware>();

// Management & Behavioral Analysis Pipeline
app.UseMiddleware<BotManagementMiddleware>();
app.UseMiddleware<EdgeProxyMiddleware>();
app.UseMiddleware<RiskScorerMiddleware>();

app.UseAuthorization();

// Post-Authorization Security Monitoring
app.UseMiddleware<ATOTrackerMiddleware>();

// Map Controllers
app.MapControllers();

app.Run();
