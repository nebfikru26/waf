using Microsoft.EntityFrameworkCore;
using AffiniSecurity.Waf.Data;
using AffiniSecurity.Waf.Services;
using AffiniSecurity.Waf.Middleware;
using AffiniSecurity.Waf.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
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
builder.Services.AddHostedService<CertbotBackgroundService>();
builder.Services.AddHostedService<NatsLogIngester>();

// Register CrsDiscoveryService as a singleton so it can be injected by controllers,
// and also add it as a HostedService to run in the background.
builder.Services.AddSingleton<CrsDiscoveryService>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<CrsDiscoveryService>());

// Authentication & Authorization
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.ASCII.GetBytes(builder.Configuration["Waf:JwtSecret"])),
            ValidateIssuer = false,
            ValidateAudience = false,
            ClockSkew = TimeSpan.Zero
        };
    });

builder.Services.AddAuthorization(options =>
{
    // High-level Platform Admin (SuperAdmin only)
    options.AddPolicy(WafPolicies.RequirePlatformAdmin, policy => 
        policy.RequireRole("super_admin"));

    // Firewall Management (Full edit access)
    options.AddPolicy(WafPolicies.RequireFirewallManager, policy => 
        policy.RequireRole("super_admin", "admin", "tenant_admin"));

    // Read-only Analytics access
    options.AddPolicy(WafPolicies.RequireAnalyticsViewer, policy => 
        policy.RequireRole("super_admin", "admin", "tenant_admin", "support_engineer", "security_analyst"));
});

// CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.SetIsOriginAllowed(origin => true) // More robust for dev than "*" with AllowCredentials
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

var app = builder.Build();

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
            clickhouse.InitializeAsync().Wait();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Startup] ClickHouse Initialization Failed: {ex.Message}");
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

app.UseCors("AllowFrontend");
app.UseMiddleware<GlobalExceptionHandlerMiddleware>();
app.UseMiddleware<ComplianceScrubberMiddleware>();
app.UseMiddleware<TrafficLoggerMiddleware>();
app.UseStaticFiles();
app.UseMiddleware<ApiKeyMiddleware>();
app.UseAuthentication();
app.UseMiddleware<TenantContextMiddleware>();

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
