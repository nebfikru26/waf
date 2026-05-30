const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Login first
  await page.goto('http://localhost/login');
  await page.fill('input[type="email"]', 'admin@affinisecurity.io');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  
  // Wait for dashboard to load
  await page.waitForTimeout(3000);
  
  // Go to rules
  await page.goto('http://localhost/crs-rules');
  await page.waitForTimeout(3000);
  
  await page.screenshot({ path: '/Users/user/.gemini/antigravity/brain/ae96376e-4930-4d7a-898b-67014a68a17d/frontend_rules.png' });
  await browser.close();
})();
