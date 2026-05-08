from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    
    # Capture console logs
    logs = []
    page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}") if msg.type in ("log", "error", "warning") else None)
    
    page.goto("http://localhost:5173/login")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    
    # Fill and submit login
    page.fill('input[type="email"]', "admin@test.com")
    page.fill('input[type="password"]', "admin123")
    
    # Clear logs before submit
    logs.clear()
    
    page.click('button[type="submit"]')
    page.wait_for_load_state("networkidle")
    time.sleep(3)
    
    print(f"URL after login: {page.url}")
    print(f"Token: {page.evaluate('localStorage.getItem(\"token\")')[:30]}...")
    
    # Check console logs
    print(f"\nConsole logs ({len(logs)}):")
    for log in logs[:20]:
        print(f"  {log[:200]}")
    
    # Check if there's an error message on the page
    error_el = page.locator('.text-red-500, .text-red-400, [role="alert"]')
    if error_el.count() > 0:
        print(f"\nError on page: {error_el.all_text_contents()}")
    
    # Check if PrivateRoute is working
    # Try navigating directly to /
    page.goto("http://localhost:5173/")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    print(f"\nDirect navigation to /: {page.url}")
    
    # Check if we see the dashboard
    heading = page.locator('h1').first
    if heading.count() > 0:
        print(f"Page heading: {heading.text_content()}")
    
    browser.close()
