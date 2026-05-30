const http = require('http');
fetch("http://localhost/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@affinisecurity.io", password: "Password123!" })
}).then(r => r.json()).then(async auth => {
  if (!auth.token) return;
  const tRes = await fetch("http://localhost/api/admin/tenants", {
    headers: { "Authorization": `Bearer ${auth.token}` }
  });
  const tenants = await tRes.json();
  for (const t of tenants) {
    if (t.name === "AffiniSecurity Global") continue;
    const impRes = await fetch(`http://localhost/api/admin/impersonate/${t.id}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${auth.token}` }
    });
    console.log(`Impersonate ${t.name} (${t.id}): ${impRes.status}`);
    if (impRes.status === 500) {
      console.log("FAILED WITH 500:", await impRes.text());
    }
  }
});
