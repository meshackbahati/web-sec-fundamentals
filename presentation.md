---
marp: true
theme: default
paginate: true
---

# Web Security Fundamentals

## Four real applications, four broken trust boundaries

**Bahati** · Saturday 3 October 2026

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

1. **Definitions** — the vocabulary, up front
2. **The one idea** behind all four bugs
3. **Four applications**, one each:
   - Session Forge — a forged identity
   - Clearance — a query you should not have been able to write
   - Reflector — code running in someone else's browser
   - Keyring — a lock that accepts the wrong key
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

- The **client** — usually a browser. It sends requests and renders what comes
  back.
- The **server** — your code. It receives the request, decides what to do, and
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

Form fields, query strings, cookies, headers, JSON bodies, file names — all of
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

**Authentication** — *who are you?*
Proves an identity. Password, multi-factor code, passkey.

**Authorisation** — *what may you do?*
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
natively — each request stands alone.

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

- **header** — metadata, including which algorithm signed it
- **payload** — the claims: `sub` (subject, the user), `exp` (expiry), `role`
- **signature** — proof the token was not altered

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
it **in constant time** — a comparison that takes the same time whether it
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

# Demo 1 — Session Forge

**`https://northwind-01-session-forge.vercel.app`**

Sign in as a normal employee. The goal is the administration page.

Here is the entire verification function:

```js
if (header.alg === 'none') {
  return { ...payload, _verified: false };   // ← the bug
}
if (header.alg !== 'HS256') return null;
```

`alg` comes from the token. The attacker edits the header, so the attacker
chooses which branch runs — and picks the one that skips verification.

<!--
Count the lines. The whole authorisation boundary in this application is one
comparison. Emphasise how little code has to be exactly right.
-->

---

# Demo 1 — the attack

```bash
BASE=https://northwind-01-session-forge.vercel.app \
  bash apps/solve/solve-01.sh
```

1. Sign in as `wiener`. Capture the session cookie.
2. Replay it against `/admin` → **403**. The check works.
3. Rebuild the token: `alg` → `none`, `sub` → `administrator`, signature
   emptied, trailing dot kept. **No cryptography is performed.**
4. Replay → the administration page, and the flag.

An empty signature over an unverified token is indistinguishable from a real
one to a server that never checked.

<!--
Type the payload on screen if you can. The 'none' algorithm performing no
maths whatsoever is the memorable moment.
-->

---

# Demo 1 — the fix

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

- **SELECT … FROM** — which columns, from which table
- **WHERE** — which rows
- `'Home'` — a **string literal**: text, quoted, not a command

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

# Demo 2 — Clearance

**`https://northwind-02-clearance.vercel.app`**

No login needed. The catalogue filter is the whole target.

With `category` set to `Home' OR 1=1--`:

```sql
WHERE category = 'Home' OR 1=1--' AND classification = 'public'
                         ─────  ─────────  ──
                         true   true        comment
```

- The `'` **closes the string literal**
- `OR 1=1` is **always true**
- `--` **comments out the rest of the line**, including the clearance filter

```bash
BASE=https://northwind-02-clearance.vercel.app bash apps/solve/solve-02.sh
```

4 rows → 16 rows, including the withheld trade lines and the flag.

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
statement — so the injected `SELECT` must project exactly as many columns as
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

# Demo 2 — the fix

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
finding — it turns a blind injection into a verbose one.

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

# Demo 3 — Reflector

**`https://northwind-03-reflector.vercel.app`**

The search box reflects your query into the results heading with no encoding.

```bash
BASE=https://northwind-03-reflector.vercel.app python3 apps/solve/solve-03.py
```

The payload calls the settlement console — which refuses requests from a
terminal:

```
HTTP 403  administrator session required
```

So the flag cannot be fetched from a shell. It can only be read by a **browser
executing script in an administrator's session**.

<!--
This is why a browser is required and a curl loop is not. The proof of impact
is that code ran, not that a request was malformed.
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

# Demo 3 — the fix

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

The `kid` (**key ID**) names which key signed a token — a legitimate feature
for servers holding several keys.

The mistake is trusting the token to say **which key verifies it**. An empty
key is a perfectly valid HMAC secret, so a token signed with the empty string
verifies.

<!--
The attacker never learns your key. They simply supply the key your check
uses. That is the whole defect.
-->

---

# Demo 4 — Keyring

**`https://northwind-04-keyring.vercel.app`**

```js
if (header.jwk && typeof header.jwk.k === 'string') {
  const embedded = createHmac('sha256', header.jwk.k).update(input).digest();
  /* compared against the token's own signature */
}
```

```bash
BASE=https://northwind-04-keyring.vercel.app bash apps/solve/solve-04.sh
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

# Reading the results honestly

| Attack | Unpatched | After the one-line fix |
|---|---|---|
| 01 forged `alg:none` token | flag returned | rejected |
| 02 `OR 1=1` tautology | flag returned | treated as data |
| 03 reflected script | flag returned | encoded |
| 04 embedded JWK | flag returned | key no longer chosen |

Thirteen automated checks pass against the live deployments
(`apps/solve/verify.sh`), including an assertion that the deployed builds are
the **vulnerable** ones — so the demonstrations cannot silently stop working.

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

- **Never trust a claim you have not verified** — including one the client
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

Everything in the next hour is a consequence of breaking that rule — in a
token header, in a SQL string, in an HTML page, and in a key lookup.

---

# Resources

- **PortSwigger Web Security Academy** — free, legal labs:
  https://portswigger.net/web-security
- **OWASP Cheat Sheet Series** — the practical reference:
  https://cheatsheetseries.owasp.org
- **RFC 7519** (JWT), **RFC 7515** (JWS)
- **MDN** — HTTP, cookies, CSP, CORS
- Four of these challenges have public write-ups in this repository

---

# Thank you

Questions?

> Authorised testing only. These applications exist to be attacked, contain
> real defects and no real data, and are removed once the event is over.
> Never use these techniques against systems you have no permission to test.