const http = require('http');
fetch("http://localhost/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@affinisecurity.io", password: "Password123!" })
}).then(r => r.json()).then(async auth => {
  if (!auth.token) return;
  // Get tenants
  const tRes = await fetch("http://localhost/api/admin/tenants", {
    headers: { "Authorization": `Bearer ${auth.token}` }
  });
  const tenants = await tRes.json();
  const firstClient = tenants.find(t => t.name !== "AffiniSecurity Global");
  if (!firstClient) return console.log("No client tenant found");
  
  // Impersonate
  const impRes = await fetch(`http://localhost/api/admin/impersonate/${firstClient.id}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${auth.token}` }
  });
  console.log("Impersonate Status:", impRes.status);
  console.log("Impersonate Response:", await impRes.text());
});
