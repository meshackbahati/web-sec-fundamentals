# Deployment record

Produced by `deploy-all.sh`. Each challenge is an independent Vercel project.

## Production targets

| Challenge | Production URL |
|---|---|
| 01 JWT forgery | https://northwind-01-jwt-forgery.vercel.app |
| 02 SQL injection | https://northwind-02-sqli.vercel.app |
| 03 Cross-site scripting | https://northwind-03-xss.vercel.app |
| 04 Key-path traversal | https://northwind-04-jwt-kid-injection.vercel.app |

## Verified state

All four were checked after deployment: `GET /api/health` returns
`{"status":"ok"}` and `GET /` returns the storefront. Builds pass.

## Exposure

The four production URLs above are **publicly reachable and unauthenticated**.
Vercel Deployment Protection covers the hashed per-deployment URLs but not
these aliases, which was confirmed by an unauthenticated request receiving an
application response rather than a sign-in page.

That is deliberate for a live demonstration, and it has two consequences worth
stating plainly:

- They run three real defects on the public internet. Remove them when the
  event is over (`vercel rm <project> --yes`), or place them behind Vercel
  Deployment Protection if the demonstration does not need public reach.
- The flags are secrets in the Vercel environment and are not in the source
  tree. `flags.env.example` deliberately contains placeholders rather than the
  deployed values, because a flag committed to this repository would be a flag
  published to anyone who clones it.

## Credentials used in the demonstrations

| Account | Username | Password | Clearance |
|---|---|---|---|
| Low privilege | `wiener` | `peter` | standard |
| Administrator | `administrator` | `admin` | full |

These are fixtures seeded by `challenges/_shared/lib.js` for every challenge.
