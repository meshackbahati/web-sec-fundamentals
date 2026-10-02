# The four applications

Each directory is a standalone Next.js application and a separate deployment.
They share one design system and one implementation, so a fix applied to any of
them is the same fix, and the difference between them is a single marked
defect rather than four divergent code bases.

| Application | Identity | The one defect |
|---|---|---|
| `01-session-forge` | Workforce identity | `verifyToken` honours the `alg` named inside the token, so `alg: none` skips verification |
| `02-clearance` | Trade pricing | The catalogue filter is concatenated into the statement instead of bound |
| `03-reflector` | Catalogue search | The query is written into the document without output encoding |
| `04-keyring` | Token signing | A token carrying an embedded JWK is verified with that key rather than the server's |

Each application is named after its role, not after its vulnerability, so the
defect is something a reader finds rather than something a label announces.

## Write-ups

Each application carries its own write-up beside its code, so the explanation
of a defect lives where the defect is:

- [`01-session-forge/WRITEUP.md`](01-session-forge/WRITEUP.md)
- [`02-clearance/WRITEUP.md`](02-clearance/WRITEUP.md)
- [`03-reflector/WRITEUP.md`](03-reflector/WRITEUP.md)
- [`04-keyring/WRITEUP.md`](04-keyring/WRITEUP.md)

Each covers the statement, the commands used to solve it, the running source
of the defect, the fix, and the unintended paths that were closed. A combined
version, with the shared mechanisms gathered in one place, is in
[`CHALLENGES.md`](CHALLENGES.md).

## Working on them

```bash
node apps/build.mjs          # regenerate all four from apps/_shared
cd apps/01-session-forge
FLAG_JWT='G24{something}' npm run dev
```

`apps/build.mjs` deletes and recreates each directory, so do not run it while a
development server is inside one of them: the server loses its working
directory.

## A note on challenge 04

An earlier version exploited `kid` path traversal to read `/dev/null` and sign
with the resulting empty key. That works on a laptop and cannot work on a
serverless platform, whose sandbox refuses traversal reads outside its writable
tree. The mechanism is unchanged in spirit, and the lesson is identical: the
token selects the key that verifies it. `jwk` header injection is used instead
because it is pure logic and behaves the same everywhere.
