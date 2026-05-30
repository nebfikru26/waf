const http = require('http');

const data = JSON.stringify({ email: "admin@affinisecurity.com", password: "AdminPassword123!" });

const req = http.request({
  hostname: 'localhost',
  port: 5001,
  path: '/api/users/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const token = JSON.parse(body).token;
    console.log("Token:", token ? "Got token" : "Failed");
    
    // Now get settings
    http.get({
      hostname: 'localhost',
      port: 5001,
      path: '/api/modules/security-settings',
      headers: { 'Authorization': 'Bearer ' + token }
    }, res2 => {
      let body2 = '';
      res2.on('data', d => body2 += d);
      res2.on('end', () => {
        console.log("Settings GET:", body2);
        
        // Try PUT
        const putData = JSON.stringify({ ...JSON.parse(body2), js_challenge_enabled: false });
        const putReq = http.request({
          hostname: 'localhost',
          port: 5001,
          path: '/api/modules/security-settings',
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'Content-Length': putData.length
          }
        }, res3 => {
          console.log("PUT Status:", res3.statusCode);
          let body3 = '';
          res3.on('data', d => body3 += d);
          res3.on('end', () => console.log("PUT Response:", body3));
        });
        putReq.write(putData);
        putReq.end();
      });
    });
  });
});
req.write(data);
req.end();
