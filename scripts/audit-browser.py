"""Run against a local keyless dev server. Requires Python Playwright and Chromium."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

origin = "http://127.0.0.1:" + os.getenv("PORT", "3456")
output = Path(__file__).resolve().parents[1] / "docs/audit/browser.json"
evidence = {"pages": {}, "page_errors": [], "http_errors": [], "console_errors": [], "request_failures": [], "checks": {}}
selector = 'button,a[href],input,select,textarea,summary,[role=button],[role=tab],[role=combobox],[tabindex="0"]'
descriptor = """e => ({tag:e.tagName.toLowerCase(), label:(e.getAttribute('aria-label') || e.innerText || e.title || e.placeholder || e.id || '').trim().slice(0,100), id:e.id || undefined, disabled:e.disabled || undefined})"""
observed, passed = set(), set()

def signature(path, item):
    return (path.split("?")[0], item["tag"], item.get("id") or "", item["label"] or "")

def record(page, route):
    items = page.locator(selector).evaluate_all(
        "els => els.filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map(" + descriptor + ")")
    evidence["pages"][route] = items
    observed.update(signature(page.evaluate("location.pathname"), item) for item in items)

def target(locator):
    key = signature(locator.page.evaluate("location.pathname"), locator.evaluate(descriptor))
    observed.add(key)
    return key

with sync_playwright() as runner:
    browser = runner.chromium.launch(executable_path=os.getenv("CHROMIUM", "/usr/bin/chromium"), args=["--disable-dev-shm-usage"])
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    page.set_default_timeout(5000)
    page.emulate_media(reduced_motion="reduce")
    page.on("pageerror", lambda e: evidence["page_errors"].append([page.url, str(e)[:250]]))
    page.on("console", lambda msg: evidence["console_errors"].append([page.url,msg.text[:200]]) if msg.type == "error" else None)
    page.on("requestfailed", lambda r: evidence["request_failures"].append([r.url.split("?")[0],r.failure]) if r.failure != "net::ERR_ABORTED" else None)
    page.on("response", lambda r: evidence["http_errors"].append([r.status, r.url.split("?")[0]]) if r.status >= 400 else None)
    page.goto(origin + "/?demo=1", wait_until="domcontentloaded")
    skip = page.get_by_role("button", name="Skip Tour")
    skip.wait_for()
    record(page, "tour")
    k = target(skip)
    skip.click()
    expect(skip).to_have_count(0)
    passed.add(k)
    evidence["checks"]["skip tour"] = True
    for currency in ["THB", "USD"]:
        button = page.get_by_role("button", name=currency, exact=True).first
        k = target(button)
        button.click()
        expect(button).to_have_attribute("aria-pressed", "true")
        passed.add(k)
        evidence["checks"]["switch " + currency] = True
    page.get_by_role("button", name="Expand all", exact=True).click()
    links = page.locator('aside a[href^="#/"]')
    routes = links.evaluate_all("(links) => links.map(a => [a.getAttribute('href'),a.innerText])")
    for href, label in routes:
        try:
            link = page.locator('aside a[href="' + href + '"]')
            k = target(link)
            link.click()
            expect(link).to_have_attribute("aria-current", "page")
            expect(page.locator('main h1').first).to_contain_text(label)
            passed.add(k)
            page.wait_for_timeout(160)
            evidence["checks"][href] = True
        except Exception as error:
            evidence["checks"][href] = str(error)[:400]
        record(page, href)
    def go(route):
        page.locator('aside a[href="#/' + route + '"]').click()

    go("account/preferences")
    themes = page.evaluate("PT_THEMES.THEMES.map(t => [t.id, t.name])")
    opener = page.get_by_role("button", name="Color theme", exact=True)
    opener_key = target(opener)
    for idx, (theme_id, name) in enumerate(themes):
        opener.click()
        dialog = page.get_by_role("dialog")
        if idx == 0:
            record(page, "theme picker")
            passed.add(opener_key)
        button = dialog.get_by_role("button", name=name, exact=True)
        k = target(button)
        button.click()
        page.wait_for_function("id => PT_UI.getPref('theme') === id", arg=theme_id)
        passed.add(k)
    evidence["checks"]["all " + str(len(themes)) + " theme selections persisted"] = True

    languages = page.evaluate("PT_I18N.LANGS.map(l => [l.code, l.native])")
    for code, name in sorted(languages, key=lambda pair: pair[0] == "en"):
        button = page.locator("main button.notranslate").filter(has_text=name).first
        k = target(button)
        with page.expect_navigation(wait_until="domcontentloaded"):
            button.click()
        page.wait_for_function("code => window.PT_I18N?.lang === code", arg=code)
        passed.add(k)
    evidence["checks"]["all language selections survived reload"] = True
    if page.get_by_role("button", name="Expand all", exact=True).count():
        page.get_by_role("button", name="Expand all", exact=True).click()
    go("portfolio/watchlist")
    quotes_url = origin + "/api/data/quotes"
    page.route(quotes_url, lambda r:r.fulfill(json={"data":{"SPY":{"name":"Fixture fund","price":100,"currency":"USD","source":"Test fixture","meta":{"freshness":"historical"}}}}))
    ticker = page.get_by_label("Ticker to add")
    ticker.fill("spy")
    add_button = page.get_by_role("button", name="Add", exact=True)
    add_key = target(add_button)
    add_button.click()
    expect(page.locator("main")).to_contain_text("$100.00")
    passed.add(add_key)
    record(page, "populated watchlist")
    page.unroute(quotes_url)
    page.route(quotes_url, lambda r:r.fulfill(status=503,json={"error":"Test outage"}))
    page.reload(wait_until="domcontentloaded")
    expect(page.locator("main")).to_contain_text("Test outage")
    remove = page.get_by_role("button", name="Remove SPY")
    k = target(remove)
    remove.click()
    expect(page.locator("main")).to_contain_text("Your watchlist is empty")
    passed.add(k)
    evidence["checks"]["watchlist add, quote, persistence, outage and remove"] = True
    if page.get_by_role("button", name="Expand all", exact=True).count():
        page.get_by_role("button", name="Expand all", exact=True).click()
    go("simulation/main")
    page.wait_for_function("window.LEKHA_SIM_LAST?.completedPaths === 100000", timeout=60000)
    for button in page.locator("#sim-hz button, #sim-n button").all():
        k = target(button)
        button.click()
        expect(button).to_have_attribute("aria-pressed", "true")
        passed.add(k)
        evidence["checks"]["simulation " + button.inner_text()] = True
    page.locator("#sim-n [data-n='10000']").click()
    page.locator("#sim-go").click()
    page.wait_for_function("window.LEKHA_SIM_LAST.completedPaths === 10000")
    page.get_by_text("Execution details & methodology", exact=True).click()
    record(page, "simulation results")
    with page.expect_download() as result:
        page.locator("#sim-json").click()
    saved = json.loads(Path(result.value.path()).read_text())
    assert saved["completedPaths"] == saved["requestedPaths"] == saved["horizons"]["1Y"]["n"] == 10000
    assert saved["p5"] <= saved["p50"] <= saved["p95"]
    with page.expect_download() as chart:
        page.locator("#sim-svg").click()
    assert "<svg" in Path(chart.value.path()).read_text()
    evidence["checks"]["run and export JSON and SVG"] = True
    page.locator("#sim-n [data-n='1000000']").click()
    page.locator("#sim-go").click()
    page.locator("#sim-stop").click()
    page.wait_for_function("window.LEKHA_SIM_LAST?.stopped === true")
    assert page.evaluate("LEKHA_SIM_LAST.completedPaths < LEKHA_SIM_LAST.requestedPaths")
    evidence["checks"]["cancel million-path request"] = True

    go("analysis/council")
    ai_requests = []
    page.on("request", lambda r: ai_requests.append(r.url) if "/api/ai/" in r.url else None)
    for button in page.locator(".cn-samples button").all():
        k = target(button)
        question = button.inner_text()
        button.click()
        expect(page.locator(".cn-report h3")).to_have_text(question)
        expect(page.locator(".cn-report")).to_contain_text("sample report")
        passed.add(k)
        evidence["checks"]["council sample " + question] = True
    record(page, "sample report")
    for card in page.locator(".cn-card[role=button]").all():
        k = target(card)
        card.press("Enter")
        expect(card).to_have_attribute("aria-expanded", "true")
        card.press("Space")
        expect(card).to_have_attribute("aria-expanded", "false")
        passed.add(k)
        evidence["checks"]["council " + card.get_attribute("data-l")] = True
    assert not ai_requests
    go("analysis/reports")
    for button in page.locator("[data-sample]").all():
        button.click()
        expect(page.locator(".cn-report")).to_contain_text("sample report")
        go("analysis/reports")
    page.reload(wait_until="domcontentloaded")
    expect(page.locator("main h1")).to_contain_text("AI research reports")
    evidence["checks"]["saved navigation after reload"] = True

    for path in ["/v3?demo=1", "/v2?demo=1", "/login.html"]:
        response = page.goto(origin + path, wait_until="domcontentloaded")
        page.wait_for_timeout(700)
        record(page, path)
        evidence["checks"][path] = response.status == 200 and bool(page.locator("body").inner_text().strip())
        if path.startswith("/v3"):
            for tab in page.locator("button[id^=nt-]").all():
                k = target(tab)
                tab.click()
                expect(tab).to_have_attribute("aria-selected", "true")
                passed.add(k)
                for sub in page.locator(".v3sub [data-s]:visible").all():
                    k = target(sub)
                    sub.click()
                    expect(sub).to_have_attribute("aria-selected", "true")
                    passed.add(k)
                    record(page, "v3 " + page.url.split("#")[-1])
                    evidence["checks"]["v3 " + page.url.split("#")[-1]] = True
        elif path.startswith("/v2"):
            for name in ["val", "set", "ov"]:
                k = target(page.locator("#tb-" + name))
                page.locator("#tb-" + name).click()
                expect(page.locator("#tab-" + name)).to_be_visible()
                passed.add(k)
                record(page, "v2 " + name)
                evidence["checks"]["v2 " + name] = True
        else:
            assert page.evaluate("typeof PT_I18N") != "undefined"
            page.get_by_role("button", name="Forgot password?").click()
            expect(page.locator("body")).to_contain_text("Enter your email first")
            evidence["checks"]["login recovery validation"] = True
    page.set_viewport_size({"width":390,"height":844})
    page.goto(origin + "/?demo=1", wait_until="domcontentloaded")
    page.wait_for_timeout(500)
    evidence["checks"]["mobile horizontal fit"] = page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    record(page, "mobile")
    page.get_by_role("button", name="Open navigation").click()
    expect(page.get_by_role("navigation", name="Main navigation").last).to_be_visible()
    evidence["checks"]["mobile navigation"] = True
    # Intercept every API call in these account journeys. No service receives a login or a purchase.
    for tier in ["free", "paid", "premium"]:
        context = browser.new_context(reduced_motion="reduce")
        account = context.new_page()
        account.set_default_timeout(7000)
        account.on("pageerror", lambda e: evidence["page_errors"].append(["tier fixture", str(e)]))
        fixture_user = {"email":tier + "@example.invalid", "tier":tier, "limits":{}, "prefs":{}}
        council_calls = []
        session = {"access_token":"test-session", "refresh_token":"fixture", "expires_at":4102444800, "email":fixture_user["email"]}
        def api_fixture(route):
            path = route.request.url.split("?")[0].replace(origin,"")
            if path == "/api/free/csv/ROTATION":
                return route.fulfill(content_type="text/csv", body="fixture,rotation")
            if path == "/api/auth/setup":
                return route.fulfill(json={"needed":False})
            if path == "/api/auth/login":
                return route.fulfill(json={"session":session})
            if path == "/api/auth/me":
                return route.fulfill(json={"user":fixture_user})
            if path == "/api/ai/council-v3":
                council_calls.append(route.request.post_data_json)
                if len(council_calls) == 1:
                    return route.fulfill(status=502, json={"error":"Fixture providers unavailable"})
                result = json.loads((output.parents[2] / "public/v3/council-demo.json").read_text())["scenarios"][0]
                result["meta"] = {"model":"Gemini fixture", "llmRequests":2, "fallback":"Fixture primary unavailable; answered by Gemini", "generatedAt":"2026-11-21T00:00:00Z"}
                return route.fulfill(json=result)
            return route.fulfill(status=503, json={"error":"Integration unavailable in account fixture"})
        context.route(origin + "/api/**", api_fixture)
        account.goto(origin + "/login.html", wait_until="domcontentloaded")
        account.locator("#email").fill(fixture_user["email"])
        account.locator("#password").fill("local-fixture-password")
        submit = account.get_by_role("button", name="Sign in", exact=True)
        k = target(submit)
        submit.click()
        account.wait_for_url(origin + "/**")
        account.wait_for_function("location.pathname === '/' && !!window.PT_AUTH?.session()")
        passed.add(k)
        account.goto(origin + "/#/analysis/council", wait_until="domcontentloaded")
        skip_account = account.get_by_role("button", name="Skip Tour")
        if skip_account.is_visible(): skip_account.click()
        account.wait_for_function("window.PT_TIER === " + json.dumps(tier))
        assert account.evaluate('PT_DATA_SOURCE.fetchCsv("ROTATION")') == "fixture,rotation"
        if tier == "premium":
            ask = account.locator("#cn-go")
            ask.wait_for()
            if skip_account.is_visible(): skip_account.click()
            ask.click()
            expect(account.locator("#cn-board")).to_contain_text("Type a research question first")
            account.locator("#cn-q").fill("Fixture research question?")
            ask.click()
            expect(account.locator("#cn-board")).to_contain_text("Fixture providers unavailable")
            expect(account.locator(".cn-report")).to_have_count(0)
            k = target(ask)
            ask.click()
            expect(account.locator(".cn-report")).to_contain_text("answered by Gemini")
            expect(account.locator(".cn-report")).to_contain_text("2 model requests")
            passed.add(k)
            assert len(council_calls) == 2
            account.goto(origin + "/#/analysis/reports")
            expect(account.locator("[data-rep]").first).to_contain_text("Fixture research question?")
        else:
            expect(account.locator(".cn-samples button").first).to_be_visible()
            expect(account.locator("#cn-go")).to_be_hidden()
            assert not council_calls
        record(account, tier + " fixture")
        evidence["checks"][tier + " fixture login and council"] = True
        context.close()
    browser.close()
evidence["control_coverage"] = {"observed_signatures":len(observed), "verified_signatures":len(passed),
    "verified":sorted(passed), "percentage":round(100 * len(passed)/len(observed), 1)}
output.write_text(json.dumps(evidence, ensure_ascii=False, indent=1) + "\n")
print({k:v for k,v in evidence['checks'].items() if v != True})
assert all(value is True for value in evidence["checks"].values())
assert not evidence["page_errors"], evidence["page_errors"]
print(len(routes), "sidebar routes;", sum(map(len,evidence['pages'].values())), "visible control instances")
