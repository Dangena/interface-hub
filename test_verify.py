from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    
    # 1. Test Login
    print("=== 1. Login Test ===")
    page.goto("http://localhost:5173/login")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    
    page.fill('input[type="email"]', "admin@test.com")
    page.fill('input[type="password"]', "admin123")
    page.click('button[type="submit"]')
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    
    current_url = page.url
    print(f"After login URL: {current_url}")
    token = page.evaluate("localStorage.getItem('token')")
    print(f"Token stored: {'Yes' if token else 'No'}")
    login_ok = '/' in current_url and '/login' not in current_url
    print(f"Login redirect: {'SUCCESS' if login_ok else 'FAILED'}")
    
    # 2. Test all pages for console errors
    print("\n=== 2. Console Error Check ===")
    errors = []
    page2 = browser.new_page(viewport={"width": 1280, "height": 800})
    page2.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text[:200]}") if msg.type == "error" else None)
    page2.on("pageerror", lambda err: errors.append(f"[pageerror] {str(err)[:200]}"))
    
    page2.goto("http://localhost:5173/login")
    page2.wait_for_load_state("networkidle")
    page2.fill('input[type="email"]', "admin@test.com")
    page2.fill('input[type="password"]', "admin123")
    page2.click('button[type="submit"]')
    page2.wait_for_load_state("networkidle")
    time.sleep(2)
    
    pages_to_visit = [
        ("/", "Dashboard"),
        ("/interfaces", "Interface List"),
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
    
    page_results = {}
    for path, name in pages_to_visit:
        errors_before = len(errors)
        page2.goto(f"http://localhost:5173{path}")
        page2.wait_for_load_state("networkidle")
        time.sleep(1)
        new_errors = errors[errors_before:]
        page_results[name] = "OK" if not new_errors else f"ERRORS: {len(new_errors)}"
        if new_errors:
            for e in new_errors:
                print(f"  {name}: {e[:100]}")
    
    print("\nPage Results:")
    for name, result in page_results.items():
        print(f"  {name}: {result}")
    
    # 3. Take screenshots of key pages
    print("\n=== 3. Screenshots ===")
    page3 = browser.new_page(viewport={"width": 1280, "height": 800})
    page3.goto("http://localhost:5173/login")
    page3.wait_for_load_state("networkidle")
    page3.fill('input[type="email"]', "admin@test.com")
    page3.fill('input[type="password"]', "admin123")
    page3.click('button[type="submit"]')
    page3.wait_for_load_state("networkidle")
    time.sleep(2)
    
    for path, name in pages_to_visit:
        page3.goto(f"http://localhost:5173{path}")
        page3.wait_for_load_state("networkidle")
        time.sleep(0.5)
        safe_name = name.lower().replace(' ', '_')
        page3.screenshot(path=f"/workspace/interface-hub/test_screenshots/verify_{safe_name}.png")
    
    page2.close()
    page3.close()
    browser.close()
    
    # Summary
    print("\n=== SUMMARY ===")
    all_ok = all(v == "OK" for v in page_results.values()) and login_ok
    print(f"Login: {'PASS' if login_ok else 'FAIL'}")
    print(f"All pages error-free: {'PASS' if all(v == 'OK' for v in page_results.values()) else 'FAIL'}")
    print(f"Overall: {'ALL TESTS PASSED' if all_ok else 'SOME TESTS FAILED'}")
