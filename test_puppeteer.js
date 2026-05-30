const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  page.on('response', resp => {
    if(resp.url().includes('rules')) {
       console.log('API RESPONSE STATUS:', resp.status());
    }
  });

  await page.goto('http://localhost/login');
  await page.fill('input[type="email"]', 'admin@affinisecurity.io');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  
  await page.waitForTimeout(3000);
  
  await page.goto('http://localhost/crs-rules');
  await page.waitForTimeout(3000);

  const ruleCount = await page.evaluate(() => document.querySelectorAll('tr').length);
  console.log('RULES HTML ROWS:', ruleCount);
  
  const text = await page.evaluate(() => document.body.innerText);
  if(text.includes('No Rules Found') || text.includes('nothing is showing')) {
     console.log('PAGE VERDICT: Rules are missing');
  }

  await browser.close();
})();
