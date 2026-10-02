---
marp: true
theme: default
paginate: true
---

# Web Security Fundamentals

## One idea, four broken boundaries

Presenter name / date

> Authorised testing only. The four targets are deliberately vulnerable,
> deployed by me for this talk, and hold no real data.

---

# The one idea

Every challenge in this talk is the same mistake:

> **The server trusts something it never verified.**

The trust boundary is different each time.

| | What is trusted unverified |
|---|---|
| 01 JWT | the algorithm named inside the token |
| 02 SQL | whether input is data or statement text |
| 03 XSS | whether input is text or markup |
| 04 Keys | the token's `kid` as a key identifier |

The goal is not the flag. It is that you can break it, read the line that
made it break, fix it, and watch the same attack fail.

---

# What you need

- Node 22.5+ — SQLite is built in as `node:sqlite`
- A browser
- Playwright, for the cross-site scripting target only
- No containers, no dependencies to install

```bash
cd northwind-lab/challenges
bash dev-up.sh        # ports 8801-8804
bash verify-fixes.sh  # attack, then fix, then attack again
```

---

# A JWT is not an encryption

Three base64url segments joined by dots:

```
eyJhbGciOiJIUzI1NiJ9 . eyJzdWIiOiJ3aWVuZXIifQ . 7Vm1...
└──── header ────┘   └──── payload ────┘   └─ signature ─┘
```

base64url is base64 with `+` and `/` swapped for `-` and `_`, padding stripped,
so a token survives a URL or a cookie.

**Anyone holding the token can read the payload.** Confidentiality comes from
TLS and nothing else.

---

# HS256: how the signature is formed

HMAC-SHA256. A key, a message, a tag that changes completely if either changes.

```
signing_input = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ3aWVuZXIifQ"
signature     = base64url( HMAC-SHA256( key, signing_input ) )
```

Verification recomputes it with the server's key and compares **in constant
time**.

Two things follow, and both are real bugs:

1. The key is the whole security. Weak keys are cracked offline with
   `hashcat -a 0 -m 16500 <jwt> <wordlist>` — no requests to the server.
2. The server must choose the algorithm. Never read it from the token.

> Gotcha we hit: compare **raw bytes**.
> `Buffer.from(sig, 'base64url')` *decodes* to 32 bytes. Comparing that
> against the base64url text compares 32 bytes to 43 and never matches.

---

# RS256 and algorithm confusion

Asymmetric: sign with the private key, verify with the public one. Because the
public key is public, anyone can verify — nobody can forge.

Unless the server decides which algorithm to use by reading `alg` from the
token. Then an attacker sends an **HS256** token and supplies the *public* key
as the HMAC secret. The server verifies with a key the attacker chose, and
concludes the token is authentic.

Fix: pin the algorithm server-side.

---

# Demo 1 — JWT forgery

**https://northwind-01-jwt-forgery.vercel.app**

Target: the session cookie. Goal: the admin area.

The verifier reads `alg` from the token and honours it:

```js
if (header.alg === 'none') return payload;   // no signature checked
if (header.alg !== 'HS256') return null;     // everything else is pinned
```

One branch. That is the whole vulnerability.

---

# Demo 1 — the attack

```bash
BASE=https://northwind-01-jwt-forgery.vercel.app \
  bash 01-jwt-forgery/solution/solve.sh
```

What happens:

1. Sign in as `wiener`, a normal account. Capture the cookie.
2. Replay it against `/admin` — **403**.
3. Rebuild the token: `alg` becomes `none`, `sub` becomes `administrator`,
   signature becomes empty. **No cryptography.** A trailing dot is kept.
4. Replay — the admin area, and the flag.

An empty signature over an unverified token is indistinguishable from a real
one to a server that skipped the check.

---

# Demo 1 — the fix

Delete the branch that honours the token's `alg`. Keep:

```js
if (header.alg !== 'HS256') return null;
```

Better still: pin the algorithm in library options rather than in your own
code, and reject `none` outright.

`verify-fixes.sh` replays this exact attack against the patched copy. It fails.

---

# SQL: how the statement is built

Bound input — the driver sends statement and value **separately**:

```sql
SELECT ... WHERE category = ? AND classification = 'public'
```

Concatenation removes that separation:

```sql
WHERE category = 'Gifts' AND classification = 'public'
```

With `category` = `Gifts' OR 1=1--`:

```sql
WHERE category = 'Gifts' OR 1=1--' AND classification = 'public'
```

The quote closes. `OR 1=1` is always true. `--` comments out the rest —
**including the clearance filter.**

---

# Two details that cost us time

**`--` ends at the newline.** When the two predicates sat on separate lines,
the clearance filter survived the comment and the attack silently returned
only public rows. One line, or it does not work.

**A `UNION` needs matching column counts** or SQLite refuses the statement
entirely:

```
x' UNION SELECT sql,name,type,name,0 FROM sqlite_master WHERE type='table'--
```

That reads the schema instead of the rows — arbitrary read, not just a bypass.

---

# Demo 2 — SQL injection

**https://northwind-02-sqli.vercel.app**

No login needed. The catalogue filter is the whole target.

```bash
BASE=https://northwind-02-sqli.vercel.app bash 02-sqli/solution/solve.sh
```

Legitimate filter → 4 public lines.
Tautology → all 15 lines, including the withheld trade lines and the flag.

The page also returns the database error verbatim, which turns a blind
injection into a verbose one. That is a second finding, not a detail.

---

# Demo 2 — the fix

```js
const sql = `SELECT ... WHERE category = ? AND classification = 'public' ORDER BY id`;
rows = db.prepare(sql).all(category);
```

One line, and the input becomes data again. Allow-list validation is a useful
second layer; parameterisation is the actual control.

Never string-concatenate. "We sanitised it" is not a substitute — `'` alone is
not the problem, and filtering `OR`/`UNION` is not a fix.

---

# HTML: why a string becomes code

A browser receives bytes and parses them into a document. When a template
writes user input straight into that stream, the parser cannot know which
characters were meant as text and which as markup. It finds a `<script>`
element and runs it.

Output encoding restores the distinction: `<` becomes `&lt;`, and the angle
brackets are text again.

Encoding is **context-specific**. The correct encoding for HTML text is not the
one for a JavaScript string, an attribute value, or a URL.

---

# Demo 3 — Cross-site scripting

**https://northwind-03-xss.vercel.app**

The search box reflects the query into the results heading with no encoding.

```bash
BASE=https://northwind-03-xss.vercel.app python3 03-xss/solution/solve.py
```

The payload calls the settlement console the way the site's own front end
would. Notice the shape of the attack: **the attacker never holds the
administrator's session and never contacts the console.** The script runs in
the administrator's browser and acts as them.

---

# Why this target needs a real browser

`/console` refuses direct requests:

```
HTTP 403  administrator session required
```

It answers only script-initiated requests carrying an administrator session.
So the flag cannot be fetched from a terminal — the browser has to ask for it.

That is the point: the damage is what the *script* can reach, not what the
attacker can request.

`HttpOnly` prevents `document.cookie` from reading the token. It does **not**
stop the script acting as the user. Both are worth saying out loud.

---

# Demo 3 — the fix

```js
&ldquo;${escapeHtml(query)}&rdquo;
```

One call. Defence in depth behind it: a Content-Security Policy that forbids
inline script would have stopped this payload regardless of encoding.

Encoding is the fix. CSP is the belt.

---

# Demo 4 — the token picks the key

**https://northwind-04-jwt-kid-injection.vercel.app**

`kid` exists so a server with several keys can say which one signed a token.
Here it is concatenated into a path with no normalisation and no confinement:

```js
readFileSync(KEY_ROOT + kid)
```

`kid` = `../../../../dev/null` reads an **empty file**, so the HMAC key is the
empty string — and an HMAC over known input under a known key is computable by
anyone.

General rule: identifiers from untrusted input may select from an allow-list,
never from a namespace the attacker can address.

---

# Reading the results honestly

| Attack | Unpatched | Patched |
|---|---|---|
| 01 forged `alg:none` token | flag | rejected |
| 02 `OR 1=1` tautology | flag | treated as data |
| 03 reflected script | flag | encoded |
| 04 `kid` path traversal | flag | key no longer chosen |

Eight checks, all green, run by `verify-fixes.sh` on every run.

---

# What to take away

- The server must never trust a claim it has not verified — including one the
  client wrote.
- Bind parameters. Encode output. Allow-list identifiers.
- Pin the algorithm. Choose it yourself.
- Errors are findings. Do not return them to the user.
- Defence in depth: encoding plus CSP, authorisation plus ownership checks.

---

# Tooling notes worth knowing

- **SQLite on Vercel works** via `node:sqlite` (Node 22.5+). No native module
  to compile, which is the usual reason it does not.
- **`jwt-tool` 2.3.0 is broken on Python 3.14.** Its config writer emits keys
  containing `:`, which 3.14's `configparser` rejects mid-write, leaving a
  truncated file and `KeyError: 'argvals'` on every later run. Upstream is
  unfixed. The one-line repair is `delimiters=('=',)`. This talk does not
  depend on it — `forge.py` is dependency-free, and shows the mechanism better.
- **Vercel discards a default export that returns a `Response`** and then
  waits for a response that never arrives: `FUNCTION_INVOCATION_TIMEOUT`.
  Export a named `GET`/`POST` instead. `build-check.sh` now catches this.

---

# Resources

- PortSwigger Web Security Academy — https://portswigger.net/web-security
- OWASP Cheat Sheet Series — https://cheatsheetseries.owasp.org
- RFC 7519 (JWT), RFC 7515 (JWS)
- MDN: HTTP, CORS, CSP

---

# Thank you

Questions?

> Authorised testing only. These targets exist to be attacked and should be
> removed once the event is over.