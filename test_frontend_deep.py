from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    
    # Navigate to login
    page.goto("http://localhost:4173/login")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    
    # Fill and submit login
    page.fill('input[type="email"]', "admin@test.com")
    page.fill('input[type="password"]', "admin123")
    page.click('button[type="submit"]')
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    
    # Check if redirected to dashboard
    current_url = page.url
    print(f"After login URL: {current_url}")
    
    # If still on login, check for error messages
    if '/login' in current_url:
        error_text = page.locator('.text-red-500, .text-red-400, [role="alert"]').all_text_contents()
        print(f"Error messages: {error_text}")
        
        # Check page content
        body_text = page.locator('body').inner_text()[:500]
        print(f"Page content: {body_text}")
    
    # Navigate directly to dashboard
    page.goto("http://localhost:4173/")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    print(f"Dashboard URL: {page.url}")
    
    # Take screenshot of dashboard
    page.screenshot(path="/workspace/interface-hub/test_screenshots/deep_01_dashboard.png")
    
    # Test interface creation
    print("\n=== Testing Interface Creation ===")
    page.goto("http://localhost:4173/interfaces/create")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/deep_02_create.png")
    
    # Fill create form
    name_input = page.locator('input[id="name"], input[placeholder*="名称"]').first
    if name_input.count() > 0:
        name_input.fill("测试接口")
        page.locator('input[id="path"], input[placeholder*="路径"]').first.fill("/api/test")
        page.screenshot(path="/workspace/interface-hub/test_screenshots/deep_03_create_filled.png")
    
    # Test interface list
    print("\n=== Testing Interface List ===")
    page.goto("http://localhost:4173/interfaces")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    
    # Check for interface cards/rows
    iface_items = page.locator('a[href^="/interfaces/"], tr[data-id], .interface-card')
    print(f"Interface items found: {iface_items.count()}")
    page.screenshot(path="/workspace/interface-hub/test_screenshots/deep_04_interfaces.png")
    
    # Test Tracing page interaction
    print("\n=== Testing Tracing Page ===")
    page.goto("http://localhost:4173/tracing")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    
    # Check stats cards
    stats_cards = page.locator('.bg-white, .dark\\:bg-gray-800').first
    page.screenshot(path="/workspace/interface-hub/test_screenshots/deep_05_tracing.png")
    
    # Test CI/CD page interaction
    print("\n=== Testing CI/CD Page ===")
    page.goto("http://localhost:4173/cicd")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/deep_06_cicd.png")
    
    # Click on "变更检测" tab
    change_tab = page.locator('button:has-text("变更检测")')
    if change_tab.count() > 0:
        change_tab.click()
        time.sleep(0.5)
        page.screenshot(path="/workspace/interface-hub/test_screenshots/deep_07_cicd_changes.png")
    
    # Test Settings page
    print("\n=== Testing Settings Page ===")
    page.goto("http://localhost:4173/settings")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/deep_08_settings.png")
    
    # Scroll down to see backup/restore buttons
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    time.sleep(0.5)
    page.screenshot(path="/workspace/interface-hub/test_screenshots/deep_09_settings_bottom.png")
    
    # Test notification bell
    print("\n=== Testing Notification Bell ===")
    page.goto("http://localhost:4173/")
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    
    bell = page.locator('button:has(svg.lucide-bell), [class*="bell"], [aria-label*="通知"]').first
    if bell.count() > 0:
        bell.click()
        time.sleep(0.5)
        page.screenshot(path="/workspace/interface-hub/test_screenshots/deep_10_notifications.png")
    else:
        print("Notification bell not found")
    
    # Test dark mode toggle
    print("\n=== Testing Dark Mode ===")
    page.goto("http://localhost:4173/settings")
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    
    # Find and click dark mode toggle
    toggle = page.locator('button[role="switch"], button:has(.translate-x)').first
    if toggle.count() > 0:
        toggle.click()
        time.sleep(0.5)
        page.screenshot(path="/workspace/interface-hub/test_screenshots/deep_11_dark_mode.png")
    
    # Test search functionality
    print("\n=== Testing Search ===")
    page.goto("http://localhost:4173/")
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    
    search = page.locator('input[placeholder*="搜索"]')
    if search.count() > 0:
        search.fill("用户")
        time.sleep(1)
        page.screenshot(path="/workspace/interface-hub/test_screenshots/deep_12_search.png")
        
        # Check if search results appeared
        results = page.locator('.search-results, [class*="search-result"], a[href^="/interfaces/"]')
        print(f"Search results: {results.count()}")
    
    # Check for console errors on all pages
    print("\n=== Console Error Check ===")
    errors = []
    page2 = browser.new_page(viewport={"width": 1280, "height": 800})
    page2.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text[:200]}") if msg.type in ("error", "warning") else None)
    page2.on("pageerror", lambda err: errors.append(f"[pageerror] {str(err)[:200]}"))
    
    # Login first
    page2.goto("http://localhost:4173/login")
    page2.wait_for_load_state("networkidle")
    page2.fill('input[type="email"]', "admin@test.com")
    page2.fill('input[type="password"]', "admin123")
    page2.click('button[type="submit"]')
    page2.wait_for_load_state("networkidle")
    time.sleep(1)
    
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
        print(f"Console issues found: {len(errors)}")
        for err in errors[:20]:
            print(f"  {err}")
    else:
        print("No console errors or warnings found!")
    
    page2.close()
    browser.close()
    print("\n=== Deep frontend tests completed! ===")
