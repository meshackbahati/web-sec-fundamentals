# Northwind Supply Co. — four web security challenges

A deliberately vulnerable storefront used as a live teaching target. Four
independent challenges, each built around one mechanism, each deployed as its
own application.

The aim is not flag collection. Each challenge is designed to be broken, read,
**fixed**, and then broken again by the same attack to prove the fix holds.
`verify-fixes.sh` measures exactly that loop.

---

## The one idea

Every challenge is the same mistake in a different place: **the server trusts
something it never verified.**

| Challenge | What is trusted without verification | Where it breaks |
|---|---|---|
| 01 JWT forgery | the algorithm named inside the token | the token boundary |
| 02 SQL injection | whether input is data or statement text | the query boundary |
| 03 Cross-site scripting | whether input is text or markup | the rendering boundary |
| 04 Key-path traversal | the token's `kid` as a key identifier | the key boundary |

Once that framing is in place the exploits stop being four tricks and become
one repeated lesson.

---

## Running it locally

Requires Node 22.5 or later (for `node:sqlite`). There are no dependencies to
install and no container.

```bash
cd northwind-lab/challenges
bash dev-up.sh          # starts all four on ports 8801-8804
bash verify-fixes.sh    # proves each attack works, and fails after the fix
bash dev-down.sh        # stops them
```

A `.env` with random flag values is generated on first run.

---

## Deploying

Each challenge is a separate Vercel project, because each is an independently
solvable target rather than one deployment with three routes.

```bash
bash deploy-all.sh      # deploys all four and sets their flags as secrets
bash build-check.sh     # the gate that must pass before deploying
```

`build-check.sh` rejects two mistakes that both cost a production build during
development:

- a `functions.runtime` that is not a valid identifier (`"nodejs24.x"` is
  rejected; the Node runtime comes from `engines` in `package.json`)
- a route that uses `export default` and returns a `Response`. Vercel discards
  the return value, waits for a Node-style response that never arrives, and
  the invocation dies with `FUNCTION_INVOCATION_TIMEOUT`. Every route exports a
  named HTTP method instead.

Live targets are listed in [`challenges/deployments.md`](northwind-lab/challenges/deployments.md).

---

## How the machinery works

The talk leans on this section, because the exploits only make sense once the
mechanism is clear.

### Base64url, and why a JWT is not encryption

A JWT is three base64url-encoded segments joined by dots:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 . eyJzdWIiOiJ3aWVuZXIifQ . 7Vm1...
└──────── header ─────────┘   └──── payload ────┘   └─ signature ─┘
```

base64url is ordinary base64 with `+` and `/` replaced by `-` and `_` and the
padding `=` stripped, so a token survives being placed in a URL or a cookie.
Decoding is **not** decryption: anyone holding the token can read the payload.
The confidentiality of a session comes from TLS in transit and nothing else.

### HS256, and how the signature is formed

`HS256` is HMAC using SHA-256. HMAC is a message authentication code: it takes
a key and a message and produces a fixed-length tag that changes completely if
either changes.

The signing input is the ASCII text of the first two segments, joined by a dot:

```
signing_input = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ3aWVuZXIifQ"
signature     = base64url( HMAC-SHA256( key, signing_input ) )
```

Verification recomputes that value with the server's key and compares it in
constant time. Three properties follow directly, and each is a real-world bug:

1. **The key is the entire security.** A leaked or guessable key lets anyone
   mint any token. `hashcat -a 0 -m 16500 <jwt> <wordlist>` cracks weak keys
   entirely offline, because the attacker never has to talk to the server.
2. **The algorithm must be chosen by the server.** If the verifier reads `alg`
   from the token, the attacker picks the verification routine. Challenge 01
   does exactly this, and `alg: none` selects a branch that returns the payload
   without checking anything.
3. **The comparison must be on raw bytes.** A subtle trap, hit during
   development here: `Buffer.from(sig, 'base64url')` *decodes* to 32 bytes, so
   comparing it against `Buffer.from(sigB64urlText)` compares 32 bytes to a
   43-byte ASCII string and never matches. Getting this wrong rejects every
   valid token.

### RS256, and algorithm confusion

`RS256` is asymmetric: the server signs with a private key and verifies with
the matching public key. Because the public key is public, anyone can verify
tokens but not forge them — provided the verifier never signs.

Algorithm confusion occurs when a server holds both key types and decides
which to use by reading `alg` from the token. An attacker presents an `HS256`
token and supplies the *public* key as the HMAC secret. The server signs its
own verification step with the attacker's chosen secret and concludes the
attacker's token is authentic. The fix is to pin the algorithm server-side.

### SQL, and how the statement is built

An ordinary filtered query binds its input:

```sql
SELECT ... FROM products WHERE category = ? AND classification = 'public'
```

The `?` is a placeholder. The driver sends the statement and the value
separately, so the database never parses the value as SQL. Concatenation
removes that separation:

```sql
WHERE category = 'Gifts' AND classification = 'public'
```

With `category` set to `Gifts' OR 1=1--`, the server produces:

```sql
WHERE category = 'Gifts' OR 1=1--' AND classification = 'public'
```

The trailing quote closes the literal, `OR 1=1` makes the predicate
permanently true, and `--` comments out the rest of the line — including the
clearance filter. Two details matter and both bit during development:

- **`--` ends at the newline.** Had the two predicates been on separate lines,
  the clearance filter would have survived and the attack would have failed.
- **A `UNION` needs matching column counts**, or SQLite refuses the statement.

### HTML, and why a string becomes code

A browser receives a byte stream and parses it into a document. When a template
writes user input directly into that stream, the parser has no way to know
which characters were meant as text and which as markup — it simply finds a
`<script>` element and executes it.

Output encoding is the boundary that restores the distinction: replacing `<`,
`>`, `&`, `"` and `'` with entities makes the angle brackets text. Encoding is
context-specific: the correct encoding for HTML text is not the one for a
JavaScript string, an attribute value, or a URL.

`HttpOnly` on the session cookie is worth demonstrating separately here: it
prevents `document.cookie` from reading the token, but it does **not** stop the
script from acting as the user. Challenge 03's flag is reachable only by script
execution, so the browser — not the attacker's terminal — has to ask for it.

### Key identifiers, and path traversal

`kid` exists so a server holding several keys can say which one signed a
token. Challenge 04 concatenates it into a filesystem path with no
normalisation and no confinement:

```js
readFileSync(process.env.KEY_DIR + kid)
```

`kid` of `../../../../dev/null` reads an empty file, which makes the HMAC key
the empty string. An HMAC over known input under a known key is computable by
anyone, so the token verifies. The general rule: identifiers from untrusted
input may select from an allow-list, never from a namespace the attacker can
address.

---

## The programmer's path

This is the part the challenges exist for.

1. Run the attack. `solution/solve.sh` in each challenge directory does it and
   prints the flag.
2. Read the line marked `VULNERABLE (challenge NN)`. There is exactly one per
   challenge, and `challenges/build.py` enforces that the shared library is
   copied with a single marked substitution.
3. Apply the fix named in the comment next to that line.
4. Run `bash verify-fixes.sh`. The same attack now fails, and the script
   reports eight passing checks: four attacks succeeding, four failing after
   the fix.

The fixes are one line each:

| Challenge | The fix |
|---|---|
| 01 | delete the branch that honours the token's `alg`, keeping the pinned `HS256` check |
| 02 | replace the concatenated statement with a `?` placeholder and bind the value |
| 03 | pass the query through `escapeHtml()` before it reaches the document |
| 04 | stop using `kid` for key lookup; use the configured secret |

---

## Repository layout

```
challenges/
  _shared/lib.js          correct reference implementation
  _shared/serve.mjs       local harness; mounts the same handlers Vercel mounts
  _shared/tools/          forge.py (token forgery), http.sh (client resolution)
  _shared/dev-up.sh       start all four
  build.py                copies the reference library, applies one defect each
  build-check.sh          deployment gate
  deploy-all.sh           deploys all four and sets their flags as secrets
  verify-fixes.sh         attack succeeds, then fails after the fix
  01-jwt-forgery/         challenge + solution/
  02-sqli/
  03-xss/
  04-jwt-kid-injection/
```

Each challenge directory is self-contained: it carries its own `api/`,
`vercel.json`, `package.json` and `solution/`, so one can be handed out alone.

---

## Notes from the build

Recorded because they cost real time and will recur.

- **SQLite on Vercel works** via `node:sqlite` (built into Node 22.5+), which
  avoids compiling `better-sqlite3` for the serverless runtime. The database
  lives in `/tmp` and is reseeded per cold start; set `DB_PATH` for a durable
  one. Each storefront seeds 15 catalogue lines, 3 accounts and 2 settlement
  records, with the flag held in a withheld line that no legitimate query
  returns.
- **`jwt-tool` 2.3.0 is broken on Python 3.14.** Its `createConfig()` writes
  dictionary keys that are sentences containing `:`, which Python 3.14's
  `configparser` rejects mid-write, leaving a truncated config and every later
  run failing with `KeyError: 'argvals'`. Upstream is unfixed. The one-line
  repair is to construct the parser with `delimiters=('=',)`. The challenges
  deliberately do not depend on it: `forge.py` is dependency-free, which also
  makes the mechanism visible on a projector.
- **`pkill -f` matched its own command line** during development and killed the
  shell issuing it. `dev-up.sh`/`dev-down.sh` use a PID file instead.

---

## Authorised use only

These targets exist to be attacked, and they contain three deliberate defects.
Use them on your own deployments, on systems you own, or with written
permission. The production deployments linked in `deployments.md` are publicly
reachable by design so a live demonstration works; they hold no real data, but
they should be removed once the talk is done. Do not point these techniques at
systems you have no authorisation to test.