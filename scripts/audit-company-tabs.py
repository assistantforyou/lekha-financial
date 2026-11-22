"""Exercise merged company tab routing using local API fixtures and real Chromium."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

origin = "http://127.0.0.1:" + os.getenv("PORT", "3456")
result = {"fixture": "company data unavailable", "tabs": [], "page_errors": []}
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=os.getenv("CHROMIUM", "/usr/bin/chromium"))
    page = browser.new_page(reduced_motion="reduce")
    page.on("pageerror", lambda error: result["page_errors"].append(str(error)))
    def data(route):
        bundle = {key:{"ok":False,"error":"Fixture provider unavailable","attempts":[]} for key in
                  ["quote","profile","annual","quarterly","ratios","filings","earnings","news","peers","history"]}
        if "/company?" in route.request.url:
            return route.fulfill(json={"data":dict(bundle,symbol="SPY"),"meta":{"source":"fixture"}})
        return route.fulfill(status=503,json={"error":"Fixture provider unavailable"})
    page.route(origin + "/api/data/**", data)
    page.goto(origin + "/?demo=1", wait_until="domcontentloaded")
    page.get_by_role("button", name="Skip Tour").click()
    page.evaluate("location.hash = '/company/SPY'")
    tabs = page.locator('[data-tour="company-tabs"] [role=tab]')
    tabs.first.wait_for()
    for tab in tabs.all():
        label = tab.inner_text()
        tab.click()
        expect(tab).to_have_attribute("aria-selected", "true")
        panel_id = tab.get_attribute("aria-controls")
        expect(page.locator('[id="' + panel_id + '"]')).to_be_visible()
        result["tabs"].append({"label":label,"route":page.url.split("#")[-1]})
    assert len(result["tabs"]) == 9 and len({r["route"] for r in result["tabs"]}) == 9
    assert not result["page_errors"], result["page_errors"]
    browser.close()
(Path(__file__).resolve().parents[1] / "docs/audit/company-tabs.json").write_text(json.dumps(result,indent=2)+"\n")
print("9 company tabs changed URL, selected tab and visible panel")
