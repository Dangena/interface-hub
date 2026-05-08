from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    
    # Test with Vite dev server instead of preview
    # First, let's check what the login API actually returns
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    
    # Capture network requests
    responses = []
    page.on("response", lambda resp: responses.append({"url": resp.url, "status": resp.status}) if "api" in resp.url else None)
    
    page.goto("http://localhost:4173/login")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    
    # Fill and submit login
    page.fill('input[type="email"]', "admin@test.com")
    page.fill('input[type="password"]', "admin123")
    page.click('button[type="submit"]')
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    
    # Check API responses
    print("=== API Responses ===")
    for r in responses:
        print(f"  {r['status']} {r['url']}")
    
    # Check localStorage for token
    token = page.evaluate("localStorage.getItem('token')")
    print(f"\nToken in localStorage: {token[:30] if token else 'None'}...")
    
    # Check current URL
    print(f"Current URL: {page.url}")
    
    # Check if user is set in Zustand store
    user_json = page.evaluate("JSON.stringify(window.__ZUSTAND_STORE__ || 'not available')")
    print(f"Store: {user_json[:100]}")
    
    # Now check which page causes c.map error
    print("\n=== Checking pages for c.map error ===")
    errors = []
    page2 = browser.new_page(viewport={"width": 1280, "height": 800})
    page2.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text[:300]}") if msg.type == "error" else None)
    page2.on("pageerror", lambda err: errors.append(f"[pageerror] {str(err)[:300]}"))
    
    # Login on page2
    page2.goto("http://localhost:4173/login")
    page2.wait_for_load_state("networkidle")
    page2.fill('input[type="email"]', "admin@test.com")
    page2.fill('input[type="password"]', "admin123")
    page2.click('button[type="submit"]')
    page2.wait_for_load_state("networkidle")
    time.sleep(2)
    
    # Visit each page and check for errors
    pages_to_visit = [
        ("/", "Dashboard"),
        ("/interfaces", "Interfaces"),
        ("/models", "Models"),
        ("/graph", "Graph"),
        ("/mock", "Mock"),
        ("/testing", "Testing"),
        ("/import", "Import"),
        ("/parser", "Parser"),
        ("/docs", "Docs"),
        ("/projects", "Projects"),
        ("/team", "Team"),
        ("/approvals", "Approvals"),
        ("/tracing", "Tracing"),
        ("/cicd", "CI/CD"),
        ("/settings", "Settings"),
    ]
    
    for path, name in pages_to_visit:
        errors_before = len(errors)
        page2.goto(f"http://localhost:4173{path}")
        page2.wait_for_load_state("networkidle")
        time.sleep(1)
        new_errors = errors[errors_before:]
        if new_errors:
            print(f"\n{name} ({path}):")
            for e in new_errors:
                print(f"  {e}")
        else:
            print(f"{name} ({path}): OK")
    
    page2.close()
    browser.close()
    print("\n=== Done ===")
