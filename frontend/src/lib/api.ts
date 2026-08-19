export async function authenticatedFetch(url: string, options: RequestInit = {}) {
  // Auth is carried by the HttpOnly `waf_session` cookie the backend sets on
  // login/signup/impersonate — it is sent automatically via `credentials: 'include'`
  // and is never readable from JavaScript, so there is no token to attach here.
  const response = await fetch(url, { ...options, credentials: 'include' });

  if (!response.ok) {
    console.error(`API error ${response.status} for ${url}`);
    try {
      const errBody = await response.text();
      console.error('Response body:', errBody);
    } catch (e) {
      console.error('Failed to read error body', e);
    }
  }

  if (response.status === 401) {
    console.warn('Unauthorized access detected');
  }

  return response;
}
