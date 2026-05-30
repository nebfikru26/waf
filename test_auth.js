const http = require('http');

const postData = JSON.stringify({ email: 'admin@affinisecurity.io', password: 'WafSecurePass2026!' });

const options = {
  hostname: 'localhost',
  port: 5001,
  path: '/api/auth/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': postData.length }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const token = JSON.parse(body).token;
    
    http.get('http://localhost:5001/api/platform/crs/rules', { headers: { 'Authorization': 'Bearer ' + token } }, (res2) => {
      let b2 = '';
      console.log('Status:', res2.statusCode);
      res2.on('data', c => b2 += c);
      res2.on('end', () => {
         const rules = JSON.parse(b2);
         console.log('Rules Length:', rules.length);
      });
    });
  });
});
req.write(postData);
req.end();
