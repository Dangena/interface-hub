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
    
    if '/login' in current_url:
        print("WARNING: Login redirect failed!")
    else:
        print("Login redirect: SUCCESS")
    
    page.screenshot(path="/workspace/interface-hub/test_screenshots/final_01_dashboard.png")
    
    # 2. Test Interface List
    print("\n=== 2. Interface List ===")
    page.goto("http://localhost:5173/interfaces")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    iface_count = page.locator('a[href^="/interfaces/"]').count()
    print(f"Interface items: {iface_count}")
    page.screenshot(path="/workspace/interface-hub/test_screenshots/final_02_interfaces.png")
    
    # 3. Test Interface Detail
    print("\n=== 3. Interface Detail ===")
    if iface_count > 0:
        page.locator('a[href^="/interfaces/"]').first.click()
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        page.screenshot(path="/workspace/interface-hub/test_screenshots/final_03_detail.png")
    
    # 4. Test Interface Create
    print("\n=== 4. Interface Create ===")
    page.goto("http://localhost:5173/interfaces/create")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.fill('input[id="name"]', "测试创建接口")
    page.fill('input[id="path"]', "/api/test-create")
    page.screenshot(path="/workspace/interface-hub/test_screenshots/final_04_create.png")
    
    # 5. Test Models
    print("\n=== 5. Models ===")
    page.goto("http://localhost:5173/models")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/final_05_models.png")
    
    # 6. Test Graph
    print("\n=== 6. Graph ===")
    page.goto("http://localhost:5173/graph")
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/final_06_graph.png")
    
    # 7. Test Mock
    print("\n=== 7. Mock ===")
    page.goto("http://localhost:5173/mock")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/final_07_mock.png")
    
    # 8. Test API Tester
    print("\n=== 8. API Tester ===")
    page.goto("http://localhost:5173/testing")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/final_08_testing.png")
    
    # 9. Test Import
    print("\n=== 9. Import ===")
    page.goto("http://localhost:5173/import")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/final_09_import.png")
    
    # 10. Test Parser
    print("\n=== 10. Parser ===")
    page.goto("http://localhost:5173/parser")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/final_10_parser.png")
    
    # 11. Test Docs
    print("\n=== 11. Docs ===")
    page.goto("http://localhost:5173/docs")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/final_11_docs.png")
    
    # 12. Test Projects
    print("\n=== 12. Projects ===")
    page.goto("http://localhost:5173/projects")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/final_12_projects.png")
    
    # 13. Test Team
    print("\n=== 13. Team ===")
    page.goto("http://localhost:5173/team")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/final_13_team.png")
    
    # 14. Test Approvals
    print("\n=== 14. Approvals ===")
    page.goto("http://localhost:5173/approvals")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/final_14_approvals.png")
    
    # 15. Test Tracing
    print("\n=== 15. Tracing ===")
    page.goto("http://localhost:5173/tracing")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/final_15_tracing.png")
    
    # 16. Test CI/CD
    print("\n=== 16. CI/CD ===")
    page.goto("http://localhost:5173/cicd")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/final_16_cicd.png")
    
    # 17. Test Settings
    print("\n=== 17. Settings ===")
    page.goto("http://localhost:5173/settings")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/final_17_settings.png")
    
    # 18. Test Dark Mode
    print("\n=== 18. Dark Mode ===")
    toggle = page.locator('button[role="switch"]')
    if toggle.count() > 0:
        toggle.first.click()
        time.sleep(0.5)
        page.screenshot(path="/workspace/interface-hub/test_screenshots/final_18_dark.png")
        print("Dark mode toggle: SUCCESS")
    else:
        print("Dark mode toggle: NOT FOUND")
    
    # 19. Test Sidebar Collapse
    print("\n=== 19. Sidebar ===")
    page.goto("http://localhost:5173/")
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    sidebar = page.locator('aside')
    if sidebar.count() > 0:
        initial_width = sidebar.bounding_box()
        toggle_btn = page.locator('aside > div > button').first
        if toggle_btn.count() > 0:
            toggle_btn.click()
            time.sleep(0.5)
            page.screenshot(path="/workspace/interface-hub/test_screenshots/final_19_sidebar.png")
            print("Sidebar collapse: SUCCESS")
    
    # 20. Test Search
    print("\n=== 20. Search ===")
    page.goto("http://localhost:5173/")
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    search = page.locator('input[placeholder*="搜索"]')
    if search.count() > 0:
        search.fill("用户")
        time.sleep(1)
        page.screenshot(path="/workspace/interface-hub/test_screenshots/final_20_search.png")
        print("Search: SUCCESS")
    else:
        print("Search: NOT FOUND")
    
    # 21. Console Error Check
    print("\n=== 21. Console Error Check ===")
    errors = []
    page2 = browser.new_page(viewport={"width": 1280, "height": 800})
    page2.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text[:200]}") if msg.type == "error" else None)
    page2.on("pageerror", lambda err: errors.append(f"[pageerror] {str(err)[:200]}"))
    
    # Login
    page2.goto("http://localhost:5173/login")
    page2.wait_for_load_state("networkidle")
    page2.fill('input[type="email"]', "admin@test.com")
    page2.fill('input[type="password"]', "admin123")
    page2.click('button[type="submit"]')
    page2.wait_for_load_state("networkidle")
    time.sleep(2)
    
    pages_to_visit = [
        "/", "/interfaces", "/models", "/graph", "/mock", "/testing",
        "/import", "/parser", "/docs", "/projects", "/team", "/approvals",
        "/tracing", "/cicd", "/settings"
    ]
    
    for pg in pages_to_visit:
        page2.goto(f"http://localhost:5173{pg}")
        page2.wait_for_load_state("networkidle")
        time.sleep(0.5)
    
    if errors:
        print(f"Console errors: {len(errors)}")
        for e in errors[:20]:
            print(f"  {e}")
    else:
        print("No console errors! All pages clean.")
    
    page2.close()
    browser.close()
    print("\n=== All tests completed! ===")
