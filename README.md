# Northwind Supply Co.: four deliberately vulnerable web applications

A storefront used as a live teaching target. Four independent Next.js
applications, each built around one mechanism, each deployed as its own
project.

The aim is not flag collection. Each application is designed to be broken,
read, **fixed**, and then broken again by the same attack to prove the fix
holds.

---

## The one idea

Every application is the same mistake in a different place: **the server
trusts something it never verified.**

| Application | What is trusted without verification |
|---|---|
| 01 session-forge | the algorithm named inside the token |
| 02 clearance | whether input is data or statement text |
| 03 reflector | whether input is text or markup |
| 04 keyring | the verification key carried by the token itself |

Once that framing is in place the exploits stop being four tricks and become
one repeated lesson.

Each application is named for its role rather than its vulnerability, so a
reader finds the defect instead of being handed it.

---

## Running them locally

Requires Node 22.5 or later, for `node:sqlite`. No containers.

```bash
npm install
cd apps/01-session-forge
FLAG_JWT='G24{something}' npm run dev      # http://127.0.0.1:3000
```

The other three run on 3001 to 3003.

---

## Deploying

Each application is its own Vercel project, scoped by root directory to its own
folder.

```bash
FLAG_JWT=... FLAG_SQLI=... FLAG_XSS=... FLAG_KID=... JWT_SECRET=... \
  bash apps/deploy.sh
```

Two settings are required for that scoping to hold, and both were arrived at by
breaking them first:

- A project created **before** its root directory is set is classified as a
  static site, and the later build then fails looking for a `public` output
  directory that a Next.js application never produces. Framework and root
  directory must be set together.
- The Vercel CLI records the project link in the **working directory**.
  Deploying from the repository root leaves one `.vercel` there, and every later
  iteration silently reuses the first project, so all four applications publish
  under one name. Each iteration starts from a clean link.

Live targets: [`apps/deployments.md`](apps/deployments.md).

---

## Verifying

```bash
bash apps/solve/verify.sh        # the four public targets, 13 checks
```

It confirms each application serves, that the storefront renders, that each
attack returns its flag through the intended path only, and that the deployed
builds are the vulnerable ones.

---

## How the machinery works

### Base64url, and why a JWT is not encryption

```
eyJhbGciOiJIUzI1NiJ9 . eyJzdWIiOiJ3aWVuZXIifQ . 7Vm1...
└──── header ────┘   └──── payload ────┘   └─ signature ─┘
```

base64url is base64 with `+` and `/` replaced by `-` and `_` and padding
stripped, so a token survives a URL or a cookie. Decoding is **not**
decryption: anyone holding the token can read the payload.

### HS256, and how the signature is formed

```
signing_input = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ3aWVuZXIifQ"
signature     = base64url( HMAC-SHA256( key, signing_input ) )
```

Three properties follow, and each is a real bug somewhere:

1. **The key is the entire security.** Weak keys are cracked offline with
   `hashcat -a 0 -m 16500 <jwt> <wordlist>`, and no requests to the server.
2. **The algorithm must be chosen by the server.** If the verifier reads `alg`
   from the token, the attacker picks the verification routine.
3. **Compare raw bytes.** `Buffer.from(sig, 'base64url')` *decodes* to 32 bytes,
   so comparing it against the base64url text compares 32 bytes to 43 and never
   matches. That mistake was made and caught during this build.

### RS256 and algorithm confusion

Asymmetric: sign with the private key, verify with the public one. Unless the
server reads `alg` from the token, in which case an attacker presents an
`HS256` token and supplies the *public* key as the HMAC secret. The server
verifies with a key the attacker chose.

### SQL, and how the statement is built

Bound input sends statement and value separately, so the database never parses
the value as SQL. Concatenation removes that separation. With `category` set to
`Home' OR 1=1--`:

```sql
WHERE category = 'Home' OR 1=1--' AND classification = 'public'
```

The quote closes, `OR 1=1` is permanently true, and `--` comments out the rest,
including the clearance filter. Two details bit during the build and are worth
stating: **`--` ends at the newline**, so a predicate on its own line survives
the comment and the attack silently returns public rows only; and a `UNION`
needs matching column counts or SQLite refuses the statement.

### HTML, and why a string becomes code

A browser parses bytes into a document and cannot tell which characters were
meant as text and which as markup. Output encoding restores the distinction,
and it is **context-specific**: the correct encoding for HTML text is not the
one for a JavaScript string, an attribute, or a URL.

`HttpOnly` prevents `document.cookie` reading the token. It does **not** stop
the script acting as the user, which is why Reflector's flag is reachable only
by executing script in an administrator's browser.

### Key identifiers, and trust in the token

A token may nominate the key that verifies it, either as a JWK it carries or as
an identifier that addresses a key store. Either way the server is trusting a
claim it never verified. The general rule: identifiers from untrusted input may
select from an allow-list, never from a namespace the attacker can address.

> An earlier version of application 04 exploited `kid` path traversal to read
> `/dev/null` and sign with the resulting empty key. That works on a laptop and
> cannot work on a serverless platform, whose sandbox refuses traversal reads
> outside its writable tree. `jwk` injection replaced it because it is pure
> logic and behaves identically everywhere. The lesson is unchanged.

---

## The programmer's path

1. Run the attack: `apps/solve/solve-01.sh` and its siblings.
2. Read the line marked `VULNERABLE (application NN)`. There is exactly one per
   application, and `apps/build.mjs` enforces that the shared library is copied
   with a single marked substitution.
3. Apply the fix named in the comment beside that line.
4. Replay the same attack and watch it fail.

| Application | The fix |
|---|---|
| 01 | delete the branch that honours the token's `alg`, keeping the pinned check |
| 02 | replace the concatenated statement with a `?` placeholder and bind the value |
| 03 | pass the query through `escapeHtml()` before it reaches the document |
| 04 | verify only with the server's own key, never one the token carries |

---

## Write-up

**[`apps/CHALLENGES.md`](apps/CHALLENGES.md)** covers all four applications:
the mechanism behind each defect, the attack, the fix, and the unintended paths
that were closed. The presentation is `presentation.md`.

---

## Layout

```
apps/
  build.mjs                     regenerates all four from _shared
  deploy.sh                     deploys all four and sets their flags
  _shared/ui.js                 design system
  _shared/store.js              correct reference implementation
  _shared/set-root-directory.mjs
  01-session-forge/  02-clearance/  03-reflector/  04-keyring/
  solve/                      forge.py, solve-01..04, verify.sh
```

Pages are route handlers returning complete documents, chosen over React server
components because these applications must answer 403 with a real status code
and must set session cookies on the paths the demonstrations use. Both Next.js
and Vercel's functions runtime dispatch on **named HTTP method exports**; a
`default` export is silently not routed.

---

## Notes from the build

- **SQLite on Vercel works** via `node:sqlite` (Node 22.5+), with no native
  module to compile, which is the usual reason it does not.
- **`jwt-tool` 2.3.0 is broken on Python 3.14.** Its config writer emits keys
  containing `:`, which 3.14's `configparser` rejects mid-write, leaving a
  truncated file and `KeyError: 'argvals'` on every later run. Upstream is
  unfixed. The challenges use a dependency-free forge instead.
- **`pkill -f` matched its own command line** and killed the shell issuing it.
  The scripts use process lists that cannot match themselves.
- **`apps/build.mjs` deletes and recreates each application directory**, so do
  not run it while a development server is inside one: the server loses its
  working directory.

---

## Authorised use only

These targets exist to be attacked and contain real defects. Use them on your
own deployments, on systems you own, or with written permission. The
deployments are publicly reachable so a live demonstration works; they hold no
real data and should be removed once the event is over.