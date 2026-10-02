# Challenge write-up

Four applications, four defects, one cause. Each write-up below covers what the
application is, the mechanism behind the bug, the attack, the fix, and the
paths that were deliberately closed.

- Target deployments: [`deployments.md`](deployments.md)
- Verification: `bash apps/solve/verify.sh`
- Presentations: `presentation.md`

---

## Background

Each application is a small Next.js storefront backed by SQLite. They share an
implementation and a design system, and differ by exactly one marked
substitution, which `build.mjs` enforces. That arrangement is deliberate: a fix
applied to one is the fix for all, and the distance between a working
implementation and a broken one is always a single reviewable line.

All four share one root cause. **The server trusts a claim it never verified.**
The trust boundary differs, and that is the whole taxonomy:

| Application | The unverified claim |
|---|---|
| 01 session-forge | the algorithm named inside the token |
| 02 clearance | whether input is data or statement text |
| 03 reflector | whether input is text or markup |
| 04 keyring | the verification key carried by the token |

A note on classification. These are **authorisation** failures, not
authentication failures. No password was obtained and no credential was
stolen in any of them. An attacker authenticates normally, or not at all in
the case of application 02, and then defeats a check that should have refused
them. That distinction matters when reading the results below, and it is the
distinction most often blurred in discussion of these bug classes.

---

# 01 Session Forge

**Target:** `https://northwind-01-session-forge.vercel.app`
**Class:** broken authentication, CWE-347 (improper verification of
cryptographic signature)
**Solution:** `apps/solve/solve-01.sh`

## Statement

Sign in with the credentials `wiener` / `peter`. This account authenticates
successfully and is refused by the administration page. Reach that page without
the administrator's password.

## The mechanism

A JSON Web Token is three base64url segments joined by dots: a header naming
the signing algorithm, a payload of claims, and a signature. The signature is
HMAC-SHA256 over the ASCII bytes of the first two segments:

```
signature = base64url( HMAC-SHA256( key, "header.payload" ) )
```

The server verifies by recomputing that value with its own key and comparing
it in constant time. Two properties follow, and this application breaks the
second:

1. The key is the entire security. A leaked or guessable key lets anyone mint
   any token, and `hashcat -a 0 -m 16500 <jwt> <wordlist>` cracks weak keys
   entirely offline.
2. **The algorithm must be chosen by the server.** If verification dispatches
   on the `alg` value read from the token, the attacker selects the routine
   that judges it.

## The defect

```js
if (header.alg === 'none') {
  return { ...payload, _verified: false };   // VULNERABLE (application 01)
}
if (header.alg !== 'HS256') return null;
```

`alg: none` is the JWT specification's marker for an unsecured token. A
conforming library rejects it. Here the attacker sets it, the server honours
it, and the payload is returned with no signature checked.

The token is not modified in any way that detection would catch. It is
structurally valid, correctly formatted, and simply unsigned.

## The attack

1. Sign in as `wiener`, capture the session cookie, replay it against `/admin`,
   and observe **403**. The boundary works for the identity it was issued for.
2. Rebuild the token: `alg` becomes `none`, `sub` becomes `administrator`,
   `exp` moves forward, the signature becomes empty. A trailing dot is retained
   because the parser splits on it.
3. Replay it. The comparison in the administration handler is
   `claims.sub === 'administrator'`, and the claim now says so.

**No cryptography is performed.** The forged token is the work of a text
editor. That is the point: an unsigned token over an unverified payload is
indistinguishable from a genuine one to a server that skipped the check.

## The fix

Delete the branch and keep the pinned check:

```js
if (header.alg !== 'HS256') return null;
```

Better still, pin the algorithm in the library's own configuration rather than
in application code, and reject `none` explicitly. Modern libraries expose an
algorithm allow-list precisely so that this cannot be forgotten.

## Unintended paths considered

- **Case variants.** `alg: None`, `NONE`, `nOnE` were tested and are rejected.
  Accepting them would be a second instance of the same defect, so they are not
  accepted.
- **A tampered payload with a valid signature.** Rejected, because the HMAC
  covers the payload. Recomputing it needs the server's key.
- **Expired tokens.** Rejected. The `none` branch enforces `exp` as well, so
  this is not a bypass into stale sessions.
- **Obfuscated segments.** Malformed base64url and non-JSON segments are
  rejected during parsing.

---

# 02 Clearance

**Target:** `https://northwind-02-clearance.vercel.app`
**Class:** SQL injection, CWE-89 (improper neutralisation of special elements)
**Solution:** `apps/solve/solve-02.sh`

## Statement

No login is required. The catalogue filters by category. Retrieve the withheld
supplier lines, which the clearance predicate is supposed to exclude.

## The mechanism

A query can be built two ways.

**Bound**, which is safe. The statement and the value travel separately, the
database parses the statement once, and the value is never parsed as SQL:

```js
db.prepare('SELECT … WHERE category = ?').all(category);
```

**Concatenated**, which is not safe. The value becomes part of the statement
text and is parsed as SQL:

```js
`SELECT … WHERE category = '${category}' AND classification = 'public'`
```

With `category` set to `Home' OR 1=1--`, the statement becomes:

```sql
WHERE category = 'Home' OR 1=1--' AND classification = 'public'
```

The trailing `'` **closes the string literal**. `OR 1=1` is **permanently
true**. `--` **comments out the remainder of the line**, which removes the
clearance filter the application depends on.

## The defect

```js
const sql = `SELECT … FROM products WHERE category = '${category}' `
          + `AND classification = 'public' ORDER BY id`;
rows = db.prepare(sql).all();
```

The application also returns the SQLite error message to the user. That is a
**second finding**: it converts what could be a blind injection into a verbose
one and confirms the query is reachable at all.

## Two details that cost real time

Both make the demonstration fail *quietly*, which is worse than failing
loudly, and both are worth knowing independently of this application.

**`--` ends at the newline.** An earlier version placed the two predicates on
separate lines:

```sql
WHERE category = 'Home' OR 1=1--' AND classification = 'public'
  AND classification = 'public'      ← still parsed, so still applied
```

The comment removed only the first line's remainder. The clearance filter
survived, the injection appeared to fail, and it returned exactly the public
rows. The predicates now sit on one line, and the reason is documented in the
source so the fix is not mistaken for tidying.

**A `UNION` requires matching column counts.** SQLite refuses a statement
whose two halves project different numbers of columns, so an injected `SELECT`
must supply exactly as many as the original. This turns a filter bypass into
arbitrary read:

```
x' UNION SELECT sql,name,type,name,0 FROM sqlite_master WHERE type='table'--
```

That reads the database's own schema, including the definitions of tables the
catalogue never exposes.

## The attack

```bash
BASE=https://northwind-02-clearance.vercel.app bash apps/solve/solve-02.sh
```

4 public rows become all 16, including the three withheld trade lines and the
flag. The `UNION` variant then dumps the schema.

## The fix

```js
const sql = `SELECT … WHERE category = ? AND classification = 'public' ORDER BY id`;
rows = db.prepare(sql).all(category);
```

An allow-list of permitted categories is a useful second layer.
Parameterisation is the actual control.

Worth stating plainly: **"we sanitised it" is not a fix.** Escaping single
quotes does not help, because a quote is rarely the only thing an attacker
needs. Blacklisting `OR`, `UNION` or `--` is a losing game against an encoding
space far larger than any list. Also suppress the error message.

## Unintended paths considered

- **No authentication is required**, so the injection is reachable by anyone.
  That is intentional: the lesson is about the query, not about access
  control, and it keeps the demonstration available if login breaks.
- **Parameterised statements elsewhere in the same application** are correct,
  which makes the contrast instructive. Two disciplines, one codebase.
- **The flag row is unreachable by any legitimate query.** It sits in a named
  category while carrying the `withheld` classification, and the clearance
  predicate excludes that classification. An earlier version placed it in a
  category the public filter could name, which let an administrator see it
  without any injection. That was a flaw in the challenge design, found by
  testing, and fixed.

---

# 03 Reflector

**Target:** `https://northwind-03-reflector.vercel.app`
**Class:** reflected cross-site scripting, CWE-79
**Solution:** `apps/solve/solve-03.py` (requires a browser)

## Statement

Search the catalogue. The search box reflects your query into the page without
encoding it. Read a value that the settlement console will not return to a
terminal.

## The mechanism

A browser receives bytes and **parses** them into a document. Its only task is
deciding what is markup and what is text, and it has no way to know which
characters were intended as which. A template that writes user input directly
into the stream produces a `<script>` element, and the parser runs it.

**Output encoding** restores the distinction by replacing characters that
carry structural meaning with inert equivalents. Encoding is applied on the way
**out**, at the point of output, for a specific context. It is not input
cleaning.

## The defect

```js
// VULNERABLE (application 03)
`<h2>${rows.length} results for &ldquo;${query}&rdquo;</h2>`
```

The query is interpolated as markup. Note that the search input elsewhere in
the same template *is* correctly escaped, so both forms appear in one response.
That contrast is deliberate and makes the boundary easy to point at.

## Why this application requires a browser

The settlement console answers only script-initiated requests carrying an
administrator session:

```
HTTP 403  administrator session required
```

So the flag cannot be retrieved by sending a request. It can only be read by a
browser **executing script in an administrator's session**, which is precisely
the capability this class of bug grants. The reference solution therefore
drives a real browser, and the flag is read out of the document title after the
injected script has run.

## The shape of the attack

What the attacker does **not** do is the point:

- no password is obtained
- the administrator's session cookie is never read by the attacker
- the attacker never sends a single request to the console

The attacker sends a link. An administrator opens it. The script runs in their
browser, with their session, and calls the console as them.

## `HttpOnly` and what it does not do

The session cookie in these applications is marked `HttpOnly`, which prevents
`document.cookie` from reading it in JavaScript. **It does not prevent this
attack.** `HttpOnly` stops cookie theft; it does not stop a script acting as
the user. Both are real mitigations for different problems, and they are
routinely conflated.

## The fix

```js
&ldquo;${escapeHtml(query)}&rdquo;
```

One call, at the point of output, for the context in question. Behind it, a
**Content Security Policy** forbidding inline script would have blocked this
payload regardless of encoding. Encoding is the fix; CSP is the belt.

## Unintended paths considered

- **Terminal access is deliberately insufficient.** The console returns 403 to
  anything that is not a script-initiated request, so no amount of curl
  crafting reaches the flag. This closes the shortcut where a solver assumes
  the flag must be fetchable directly.
- **The browser is required, and that is stated.** A demonstration that
  appeared to succeed via HTTP would be demonstrating nothing.
- **The screenshot is gitignored.** `xss-proof.png` captures the flag in the
  page title. It is evidence, so it is written locally, and it is excluded
  from version control deliberately.
- **The reflected value is escaped in the search input** and unescaped in the
  results heading. Both are visible in one response, which makes the exact
  failure point unambiguous.

---

# 04 Keyring

**Target:** `https://northwind-04-keyring.vercel.app`
**Class:** improper verification of cryptographic signature, CWE-347, via
insecure key selection
**Solution:** `apps/solve/solve-04.sh`

## Statement

Sign in as `wiener`, a valid low-privilege account. Reach the administration
page without the administrator's password and without knowing the server's
signing key.

## The mechanism

A **JWK** is a standard way to express a key as JSON. A `kid` names which key
signed a token, which is a legitimate feature for a server holding several
keys. The misuse is trusting the token to nominate **which key verifies it**.

## The defect

```js
if (header.jwk && typeof header.jwk.k === 'string') {
  const embedded = createHmac('sha256', header.jwk.k)
    .update(`${encodedHeader}.${encodedPayload}`).digest();
  /* compared against the token's own signature */
}
```

An **empty key is a perfectly valid HMAC secret**. Supplying
`"k": ""` and signing with the empty string produces a token the server
verifies successfully.

The attacker never learns the server's key. They do not need it: they supply
the key the check uses.

## The attack

```bash
BASE=https://northwind-04-keyring.vercel.app bash apps/solve/solve-04.sh
```

Genuine token against `/admin` returns **403**. The forged token, carrying its
own empty signing key in the header, returns **200** and the flag.

This is the same lesson as applications 01 and 02 arriving by a different
route: a claim supplied by the client, used as though it were the server's own.

## A note on what this application used to be

The original version exploited `kid` path traversal. The server located its
verification key with `readFileSync(KEY_ROOT + kid)`, and `kid` of
`../../../../dev/null` read an empty file, producing an empty signing key.

That worked on a laptop and **cannot work on a serverless platform**, whose
sandbox refuses traversal reads outside its writable tree. Migrating the
applications to Next.js did not change this, because they run in the same
sandbox.

`jwk` injection replaced it. The mechanism and the lesson are identical, and
it behaves the same on a laptop, in a container, and on Vercel. The general rule
survives the change: **an identifier from untrusted input may select from an
allow-list, never from a namespace the attacker can address.**

## Unintended paths considered

- **A random key does not help the attacker.** With any unknown key, the
  attacker cannot produce a matching signature, because HMAC is keyed. Only a
  key they choose, including the empty string, works. That is what makes this
  specific and not a general signing bypass.
- **Removing the branch closes it.** The fix is to verify only with the
  server's own key, which is what the pinned HS256 path already does.
- **Empty keys are the interesting edge.** A reviewer checking "is the key
  non-empty" would have missed the bug in the original traversal version
  entirely, since the emptiness was a property of a file the application never
  inspected.

---

# Common fixes

| Application | The fix | The class it closes |
|---|---|---|
| 01 session-forge | delete the `alg: none` branch; pin the algorithm | broken authentication |
| 02 clearance | bind the value with `?`; suppress error messages | SQL injection |
| 03 reflector | `escapeHtml()` at the point of output | reflected XSS |
| 04 keyring | verify only with the server's own key | key confusion |

Each is one line. That ratio is the argument for code review over tooling:
most of these defects are far too small to be caught by pattern matching and
exactly the size of a mistake a second reader catches.

---

# Verification

```bash
bash apps/solve/verify.sh
```

Thirteen checks against the four public targets:

- each application answers `GET /api/health` and identifies itself correctly
- each storefront renders
- each attack returns its flag through the intended path only
- a genuine low-privilege token is still refused, confirming the deployed
  builds are the **vulnerable** ones rather than a patched copy

That last assertion matters. Without it, a successful verification run could
mean the opposite of what it appears to mean.

---

# Deployment notes

Two settings decide whether four projects stay four projects, and both were
arrived at by breaking them first.

**A project created before its root directory is set is classified as a static
site.** The later build then fails looking for a `public` output directory that
a Next.js application never produces. Framework and root directory must be set
together.

**The Vercel CLI records the project link in the working directory.** Deploying
from the repository root leaves one `.vercel` there, and every later iteration
silently reuses the first project, so all four applications publish under one
name. Each iteration now starts from a clean link and keeps its own beside the
application.

The production aliases are publicly reachable, which is required for a live
demonstration. They contain real defects and no real data. Remove them with
`vercel project remove <name>` when the event is over.

---

# Authorised use only

These applications exist to be attacked. Use them on your own deployments, on
systems you own, or with written permission. Do not point these techniques at
systems you have no authorisation to test.