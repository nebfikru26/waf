using Microsoft.AspNetCore.Http;

namespace AffiniSecurity.Waf.Security
{
    /// <summary>
    /// Centralizes issuance/clearing of the HttpOnly session cookies used to carry the JWT.
    /// Moving the token out of client-readable storage (localStorage/sessionStorage) and into
    /// an HttpOnly cookie removes the primary XSS token-exfiltration vector: JavaScript can no
    /// longer read the session token even if a script injection occurs.
    ///
    /// Two cookies are used:
    ///  - SessionCookieName: the active session token (whatever identity is currently "logged in
    ///    as", including an impersonated tenant identity).
    ///  - AdminBackupCookieName: holds the platform admin's own token while they are impersonating
    ///    a tenant, so `Unimpersonate` can restore it server-side without ever exposing either
    ///    token to client-side script.
    /// </summary>
    public static class CookieAuth
    {
        public const string SessionCookieName = "waf_session";
        public const string AdminBackupCookieName = "waf_admin_session";

        public static void SetSessionCookie(HttpResponse response, string token, bool isDevelopment)
        {
            response.Cookies.Append(SessionCookieName, token, BuildOptions(isDevelopment, TimeSpan.FromDays(30)));
        }

        public static void SetAdminBackupCookie(HttpResponse response, string token, bool isDevelopment)
        {
            response.Cookies.Append(AdminBackupCookieName, token, BuildOptions(isDevelopment, TimeSpan.FromDays(30)));
        }

        public static void ClearSessionCookie(HttpResponse response, bool isDevelopment)
        {
            response.Cookies.Delete(SessionCookieName, BuildOptions(isDevelopment, TimeSpan.Zero));
        }

        public static void ClearAdminBackupCookie(HttpResponse response, bool isDevelopment)
        {
            response.Cookies.Delete(AdminBackupCookieName, BuildOptions(isDevelopment, TimeSpan.Zero));
        }

        private static CookieOptions BuildOptions(bool isDevelopment, TimeSpan maxAge)
        {
            return new CookieOptions
            {
                HttpOnly = true,
                // Secure cookies are required for SameSite=Lax/None in modern browsers over HTTPS.
                // Relaxed only in local development so the app remains usable over plain HTTP.
                Secure = !isDevelopment,
                SameSite = SameSiteMode.Lax,
                Path = "/",
                MaxAge = maxAge
            };
        }
    }
}
