"""Focused Chromium regression. Run against the local dev server, with no external services."""
import json
import os
from collections import defaultdict
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

origin = "http://127.0.0.1:" + os.getenv("PORT", "3456")
server = defaultdict(dict)
errors = []


def fixture(route):
    path = urlsplit(route.request.url).path
    if route.request.url == origin + "/sync-fixture":
        return route.fulfill(content_type="text/html", body='<script src="/pt-datasource.js"></script><script src="/pt-state.js"></script>')
    if path in ("/pt-datasource.js", "/pt-state.js"):
        return route.continue_()
    owner = route.request.headers.get("authorization", "").removeprefix("Bearer ")
    if path == "/api/state" and owner in ("alice", "bob"):
        if route.request.method == "POST":
            data = route.request.post_data_json
            for doc in data["docs"]:
                server[owner][doc["key"]] = dict(doc, updated_at="2026-01-01T00:00:00Z")
            return route.fulfill(json={"ok": True})
        return route.fulfill(json={"docs": list(server[owner].values())})
    if path == "/api/auth/me":
        return route.fulfill(json={"tier": "premium", "prefs": {}})
    return route.abort()


def sign_in(page, owner):
    page.goto(origin + "/sync-fixture")
    page.evaluate("""id => localStorage.setItem("ptpub.v1.session", JSON.stringify({
        user_id: id, email: id+"@example.invalid", access_token: id, refresh_token: "fixture", expires_at: 4102444800
    }))""", owner)
    page.reload()
    page.wait_for_function("window.PT_SYNC?.status.ready && !window.PT_DEMO_MODE")


def write(page, key, value):
    result = page.evaluate("""async ([key,data]) => {
      localStorage.setItem(PT_STORAGE_NS+"db."+key, JSON.stringify(data));
      PT_SYNC.touch(key);
      return PT_SYNC.flush();
    }""", [key, value])
    assert result["ok"], result


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.getenv("CHROMIUM", "/usr/bin/chromium"), args=["--disable-dev-shm-usage"])
    first = browser.new_context()
    first.route("**/*", fixture)
    page = first.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    sign_in(page, "alice")
    write(page, "holdings/all", {"items": [{"tk": "SPY", "qty": 2}]})
    write(page, "reports/example", {"ceo": {"verdict": "fixture"}})
    second_tab = first.new_page()
    sign_in(second_tab, "bob")
    page.wait_for_function("window.PT_STORAGE_NS === 'ptpub.v1.account.bob.'")
    assert page.evaluate("PT_SYNC.keys()") == []
    assert not server["bob"]
    write(second_tab, "holdings/all", {"items": [{"tk": "MSFT", "qty": 1}]})
    other_device = browser.new_context()
    other_device.route("**/*", fixture)
    returning = other_device.new_page()
    sign_in(returning, "alice")
    assert sorted(returning.evaluate("PT_SYNC.keys()")) == ["holdings/all", "reports/example"]
    assert returning.evaluate("JSON.parse(localStorage.getItem(PT_STORAGE_NS+'db.holdings/all')).items[0].tk") == "SPY"
    assert server["bob"]["holdings/all"]["data"]["items"][0]["tk"] == "MSFT"
    assert not errors, errors
    browser.close()
print("PASS owner-scoped holdings and report sync, account switch in two tabs, fresh-browser restore (fixture store)")
