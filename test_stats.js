const http = require('http');
fetch("http://localhost/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@affinisecurity.io", password: "Password123!" })
}).then(r => r.json()).then(auth => {
  fetch("http://localhost/api/analytics/stats", {
    headers: { "Authorization": `Bearer ${auth.token}` }
  }).then(r => r.text()).then(text => console.log("Stats:", text));
});
