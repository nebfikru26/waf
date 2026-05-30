from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
    page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))
    
    # Wait for response and see if it fails
    response = page.goto("http://localhost:8080", wait_until="networkidle")
    print(f"Status: {response.status if response else 'No response'}")
    
    browser.close()
