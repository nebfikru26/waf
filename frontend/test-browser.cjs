const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.toString());
  });
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
    }
  });

  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 10000 });
    console.log('Page loaded successfully on 5173');
  } catch (err) {
    console.log('Failed to load on 5173:', err.message);
  }

  try {
    await page.goto('http://localhost:80', { waitUntil: 'networkidle0', timeout: 10000 });
    console.log('Page loaded successfully on 80');
  } catch (err) {
    console.log('Failed to load on 80:', err.message);
  }

  await browser.close();
})();
