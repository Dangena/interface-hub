from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    
    print("=== 1. Testing Login Page ===")
    page.goto("http://localhost:4173/login")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/workspace/interface-hub/test_screenshots/01_login.png")
    
    page.fill('input[type="email"]', "admin@test.com")
    page.fill('input[type="password"]', "admin123")
    page.click('button[type="submit"]')
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/02_dashboard.png")
    print(f"After login URL: {page.url}")
    
    print("\n=== 2. Testing Interface List ===")
    page.goto("http://localhost:4173/interfaces")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/03_interfaces.png")
    
    print("\n=== 3. Testing Interface Detail ===")
    links = page.locator('a[href^="/interfaces/"]')
    if links.count() > 0:
        links.first.click()
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        page.screenshot(path="/workspace/interface-hub/test_screenshots/04_interface_detail.png")
    
    print("\n=== 4. Testing Models ===")
    page.goto("http://localhost:4173/models")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/05_models.png")
    
    print("\n=== 5. Testing Graph ===")
    page.goto("http://localhost:4173/graph")
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/06_graph.png")
    
    print("\n=== 6. Testing Mock ===")
    page.goto("http://localhost:4173/mock")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/07_mock.png")
    
    print("\n=== 7. Testing API Tester ===")
    page.goto("http://localhost:4173/testing")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/08_testing.png")
    
    print("\n=== 8. Testing Import ===")
    page.goto("http://localhost:4173/import")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/09_import.png")
    
    print("\n=== 9. Testing Parser ===")
    page.goto("http://localhost:4173/parser")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/10_parser.png")
    
    print("\n=== 10. Testing Docs ===")
    page.goto("http://localhost:4173/docs")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/11_docs.png")
    
    print("\n=== 11. Testing Projects ===")
    page.goto("http://localhost:4173/projects")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/12_projects.png")
    
    print("\n=== 12. Testing Team ===")
    page.goto("http://localhost:4173/team")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/13_team.png")
    
    print("\n=== 13. Testing Approvals ===")
    page.goto("http://localhost:4173/approvals")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/14_approvals.png")
    
    print("\n=== 14. Testing Tracing ===")
    page.goto("http://localhost:4173/tracing")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/15_tracing.png")
    
    print("\n=== 15. Testing CI/CD ===")
    page.goto("http://localhost:4173/cicd")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/16_cicd.png")
    
    print("\n=== 16. Testing Settings ===")
    page.goto("http://localhost:4173/settings")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/17_settings.png")
    
    print("\n=== 17. Testing Dark Mode ===")
    toggle = page.locator('button:has(.translate-x-1)')
    if toggle.count() > 0:
        toggle.first.click()
        time.sleep(0.5)
        page.screenshot(path="/workspace/interface-hub/test_screenshots/18_dark_mode.png")
    
    print("\n=== 18. Testing Sidebar Collapse ===")
    page.goto("http://localhost:4173/")
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    collapse_btn = page.locator('aside button').first
    if collapse_btn.count() > 0:
        collapse_btn.click()
        time.sleep(0.5)
        page.screenshot(path="/workspace/interface-hub/test_screenshots/19_sidebar_collapsed.png")
    
    print("\n=== 19. Testing Search ===")
    page.goto("http://localhost:4173/")
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    search = page.locator('aside input[placeholder*="搜索"]')
    if search.count() > 0:
        search.fill("用户")
        time.sleep(0.5)
        page.screenshot(path="/workspace/interface-hub/test_screenshots/20_search.png")
    
    print("\n=== 20. Console Errors Check ===")
    errors = []
    page2 = browser.new_page(viewport={"width": 1280, "height": 800})
    page2.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    
    pages_to_visit = [
        "/", "/interfaces", "/models", "/graph", "/mock", "/testing",
        "/import", "/parser", "/docs", "/projects", "/team", "/approvals",
        "/tracing", "/cicd", "/settings"
    ]
    
    for pg in pages_to_visit:
        page2.goto(f"http://localhost:4173{pg}")
        page2.wait_for_load_state("networkidle")
        time.sleep(0.5)
    
    if errors:
        print(f"Console errors found: {len(errors)}")
        for err in errors[:10]:
            print(f"  - {err[:150]}")
    else:
        print("No console errors found!")
    
    page2.close()
    browser.close()
    print("\n=== All frontend tests completed! ===")
