# Web Security Fundamentals

Source, demonstrations and lab applications for a talk on the fundamentals of
web security. Four deliberately vulnerable web applications, one per concept,
plus the material to present them and to fix them.

This repository is the whole thing. Clone it and everything in the talk is
reproducible.

---

## The four applications

Each is a separate Next.js application and a separate deployment. Each has one
defect, described in its own write-up beside its code.

| | Application | Defect | Where |
|---|---|---|---|
| 01 | [session-forge](apps/01-session-forge/) | the server reads the signing algorithm out of the token it is verifying | `lib/store.js` |
| 02 | [clearance](apps/02-clearance/) | a filter value is concatenated into the SQL statement | `app/catalogue/route.js` |
| 03 | [reflector](apps/03-reflector/) | a search term is written into the page without encoding | `app/search/route.js` |
| 04 | [keyring](apps/04-keyring/) | a token that includes a key is verified with that key | `lib/store.js` |

All four are the same mistake in a different place: the server uses a value it
did not create, and did not check.

| Application | The value it should not have trusted |
|---|---|
| session-forge | `alg` in the token header |
| clearance | the `category` query parameter |
| reflector | the `q` query parameter |
| keyring | the `jwk` header parameter |

These are authorisation failures, not authentication failures. No password is
obtained in any of them. A valid account signs in normally, or none at all in
the case of application 02, and then gets past a check that should have
refused it.

---

## Live targets

| Application | URL |
|---|---|
| 01 session-forge | <https://northwind-01-session-forge.vercel.app> |
| 02 clearance | <https://northwind-02-clearance.vercel.app> |
| 03 reflector | <https://northwind-03-reflector.vercel.app> |
| 04 keyring | <https://northwind-04-keyring.vercel.app> |

Public and unauthenticated, because a demonstration needs an audience. They
contain real defects and no real data.

Remove them when you are finished:

```bash
vercel project remove northwind-01-session-forge
```

---

## The talk

`presentation.md`, 45 slides. Every term is defined before it is used, then
each application is demonstrated from the terminal, then the fix.

| File | |
|---|---|
| `dist/presentation.html` | present from this. Interactive, press `s` for speaker notes |
| `dist/Web-Security-Fundamentals.pdf` | 39 pages, clickable links, for sharing |
| `presentation.md` | the source |

Regenerating the PDF needs a Chromium binary:

```bash
export CHROME_PATH="$HOME/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome"
marp presentation.md --pdf -o dist/Web-Security-Fundamentals.pdf
```

---

## Write-ups

Each application has one beside its code:

- [session-forge](apps/01-session-forge/WRITEUP.md)
- [clearance](apps/02-clearance/WRITEUP.md)
- [reflector](apps/03-reflector/WRITEUP.md)
- [keyring](apps/04-keyring/WRITEUP.md)

Each covers what the application does, what the defect is, the commands to
reproduce it, the fix, and what does not work against it.

[apps/CHALLENGES.md](apps/CHALLENGES.md) collects all four with the shared
mechanisms in one place: how a JWT signature is formed, how algorithm
confusion works, how an SQL statement is built, how a browser turns bytes into
a document.

---

## Reproducing it

```bash
npm install

cd apps/01-session-forge
FLAG_JWT='G24{something}' npm run dev      # http://127.0.0.1:3000
```

The other three run on 3001 to 3003. Storage is SQLite through `node:sqlite`,
so there is nothing to install and no database to configure.

Against the live deployments:

```bash
bash apps/solve/verify.sh
```

Thirteen checks: each application answers its health endpoint and renders, each
attack returns its flag through the intended path only, and the deployed
builds are the vulnerable ones rather than a patched copy.

The last check matters. Without it a passing run could mean the opposite of
what it appears to mean.

---

## Deploying

```bash
FLAG_JWT=… FLAG_SQLI=… FLAG_XSS=… FLAG_KID=… JWT_SECRET=… bash apps/deploy.sh
```

Two settings decide whether four projects stay four projects. Both were
arrived at by breaking them first:

- A project created before its root directory is set is classified as a static
  site, and the build then fails looking for a `public` directory that a
  Next.js application never produces. Framework and root directory go
  together.
- The Vercel CLI writes the project link to the working directory. Deploying
  from the repository root leaves one `.vercel` there, and the next iteration
  reuses the first project. Each iteration starts from a clean link.

Flags are read from the environment and never committed. `flags.env.example`
holds placeholders, because these deployments are public.

---

## Fixing them

Each defect is one line, and the fix is written next to it in the source as a
comment starting `FIX`.

| Application | Fix |
|---|---|
| session-forge | delete the branch that reads `alg` from the token; pin the algorithm |
| clearance | bind the value with `?` instead of concatenating it |
| reflector | `escapeHtml()` at the point of output |
| keyring | verify only with the server's own key |

The ratio is the argument for review. These defects are too small for pattern
matching and exactly the size of a mistake a second reader catches.

`apps/build.mjs` regenerates all four applications from `apps/_shared/`, with
exactly one marked substitution each, so the difference between the working
implementation and the broken one stays reviewable.

---

## Authorised use only

These applications exist to be attacked. Use them on your own systems or with
written permission. Do not use these techniques against systems you have no
authorisation to test.