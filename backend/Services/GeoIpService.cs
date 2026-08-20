using System;
using System.Net;
using MaxMind.Db;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace AffiniSecurity.Waf.Services
{
    public class GeoIpLookupResult
    {
        public string CountryCode { get; set; } = "";
        public string CountryName { get; set; } = "";
    }

    public interface IGeoIpService
    {
        /// <summary>
        /// True when a real IP-to-country database was found and loaded on disk. When false,
        /// every lookup honestly returns null instead of guessing — no fabricated country data.
        /// </summary>
        bool IsAvailable { get; }

        GeoIpLookupResult? Lookup(string? ipAddress);
    }

    /// <summary>
    /// Resolves an IP address to a country using a locally provisioned MMDB (MaxMind DB format)
    /// file — compatible with both MaxMind's own GeoLite2-Country and the free, no-license-key
    /// DB-IP "IP to Country Lite" database (CC BY 4.0, https://db-ip.com/db/download/ip-to-country-lite).
    ///
    /// This database is an operational artifact, not application source: it is NOT committed to
    /// git (see .gitignore) and must be provisioned onto disk at the configured path
    /// (Waf:GeoIpDatabasePath, default "geoip/dbip-country-lite.mmdb") — e.g. via a Docker build
    /// step or a mounted volume, refreshed periodically per the database's release cadence.
    ///
    /// If the file is absent (as it will be in local dev/CI, matching this repo's pattern for the
    /// Kubernetes cert-manager client), IsAvailable is false and Lookup always returns null so
    /// country-based analytics honestly show "no data" instead of fabricated countries.
    /// </summary>
    public class GeoIpService : IGeoIpService, IDisposable
    {
        private readonly ILogger<GeoIpService> _logger;
        private readonly Reader? _reader;

        public bool IsAvailable => _reader != null;

        public GeoIpService(ILogger<GeoIpService> logger, IConfiguration configuration)
        {
            _logger = logger;
            var path = configuration["Waf:GeoIpDatabasePath"] ?? "geoip/dbip-country-lite.mmdb";

            try
            {
                if (System.IO.File.Exists(path))
                {
                    _reader = new Reader(path);
                    _logger.LogInformation("GeoIP database loaded from {Path}. Country-based analytics are enabled.", path);
                }
                else
                {
                    _logger.LogWarning(
                        "GeoIP database not found at {Path}. Country-based analytics (Traffic by Country, " +
                        "Regional Traffic) will report no data until a database is provisioned there. " +
                        "This is expected in local dev/CI environments.", path);
                    _reader = null;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to load GeoIP database at {Path}. Country-based analytics disabled.", path);
                _reader = null;
            }
        }

        public GeoIpLookupResult? Lookup(string? ipAddress)
        {
            if (_reader == null || string.IsNullOrWhiteSpace(ipAddress))
            {
                return null;
            }

            if (!IPAddress.TryParse(ipAddress, out var parsed))
            {
                return null;
            }

            try
            {
                var data = _reader.Find<System.Collections.Generic.Dictionary<string, object>>(parsed);
                if (data == null)
                {
                    return null;
                }

                string? code = null;
                string? name = null;

                if (data.TryGetValue("country", out var countryObj) && countryObj is System.Collections.Generic.Dictionary<string, object> country)
                {
                    if (country.TryGetValue("iso_code", out var isoObj)) code = isoObj?.ToString();
                    if (country.TryGetValue("names", out var namesObj) && namesObj is System.Collections.Generic.Dictionary<string, object> names
                        && names.TryGetValue("en", out var enNameObj))
                    {
                        name = enNameObj?.ToString();
                    }
                }

                if (string.IsNullOrEmpty(code))
                {
                    return null;
                }

                return new GeoIpLookupResult { CountryCode = code, CountryName = name ?? code };
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "GeoIP lookup failed for {Ip}", ipAddress);
                return null;
            }
        }

        public void Dispose()
        {
            _reader?.Dispose();
        }
    }
}
