const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  await page.goto('http://localhost:8080');
  
  // Try to login
  try {
    await page.waitForSelector('input[type="email"]', { timeout: 5000 });
    await page.type('input[type="email"]', 'admin@affinisecurity.com');
    await page.type('input[type="password"]', 'AdminPassword123!');
    await page.click('button[type="submit"]');
    
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    console.log("Navigated to dashboard");
    
    await page.goto('http://localhost:8080/bot-protection');
    await page.waitForTimeout(2000);
    console.log("Navigated to bot protection");
  } catch (e) {
    console.log("Error during navigation:", e);
  }

  await browser.close();
})();
