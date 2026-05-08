from playwright.sync_api import sync_playwright
import time
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    
    page.goto("http://localhost:5173/login")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    
    # Before login - check store state
    store_state_before = page.evaluate("""
        JSON.stringify({
            token: localStorage.getItem('token'),
            pathname: window.location.pathname
        })
    """)
    print(f"Before login: {store_state_before}")
    
    # Fill and submit
    page.fill('input[type="email"]', "admin@test.com")
    page.fill('input[type="password"]', "admin123")
    page.click('button[type="submit"]')
    
    # Wait and check state changes
    time.sleep(1)
    store_state_after = page.evaluate("""
        JSON.stringify({
            token: localStorage.getItem('token'),
            pathname: window.location.pathname
        })
    """)
    print(f"After login (1s): {store_state_after}")
    
    time.sleep(2)
    store_state_final = page.evaluate("""
        JSON.stringify({
            token: localStorage.getItem('token'),
            pathname: window.location.pathname
        })
    """)
    print(f"After login (3s): {store_state_final}")
    
    # Try to manually navigate
    page.evaluate("window.location.href = '/'")
    time.sleep(2)
    store_state_nav = page.evaluate("""
        JSON.stringify({
            token: localStorage.getItem('token'),
            pathname: window.location.pathname
        })
    """)
    print(f"After manual nav: {store_state_nav}")
    
    browser.close()
