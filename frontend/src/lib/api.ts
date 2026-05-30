export async function authenticatedFetch(url: string, options: RequestInit = {}) {
  const token = (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")) || sessionStorage.getItem("auth_token");
  const headers = {
    ...options.headers,
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
  };

  const response = await fetch(url, { ...options, headers });
  
  if (response.status === 401) {
    // Handle unauthorized (maybe logout)
    console.warn("Unauthorized access detected");
  }
  
  return response;
}
