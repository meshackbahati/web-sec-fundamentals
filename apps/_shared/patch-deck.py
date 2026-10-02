#!/usr/bin/env python3
"""Insert real application source into the presentation deck.

The deck quotes code the room can verify against the running applications,
rather than paraphrase. Every snippet below is copied from the corresponding
file under apps/.
"""

import pathlib

DECK = pathlib.Path(__file__).resolve().parents[2] / "presentation.md"

REPLACEMENTS = [
    # Demo 1: the real verifier and the shared authorisation boundary.
    (
        """Here is the entire verification function:

```js
if (header.alg === 'none') {
  return { ...payload, _verified: false };   // ← the bug
}
if (header.alg !== 'HS256') return null;
```

`alg` comes from the token. The attacker edits the header, so the attacker
chooses which branch runs, and picks the one that skips verification.""",
        """Here is the real verification function, from
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
skips verification.""",
    ),
    # What correct looks like, shown once before the first attack.
    (
        """---

# Demo 1: the attack""",
        """---

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

# Demo 1: the attack""",
    ),
    # Demo 2: the real statement.
    (
        """No login needed. The catalogue filter is the whole target.""",
        """No login needed. The catalogue filter is the whole target. Built in
`apps/02-clearance/app/catalogue/route.js`:

```js
// VULNERABLE (application 02)
const sql = `SELECT sku, name, category, price_cents, classification`
          + ` FROM products WHERE category = '${category}'`
          + ` AND classification = 'public' ORDER BY id`;

rows = db().prepare(sql).all();
```""",
    ),
    # Demo 3: both renderings of one value, from real source.
    (
        """The search box reflects your query into the results heading with no encoding.""",
        """`app/search/route.js` contains both renderings of the same value, some
lines apart:

```js
// correct: the search box
<input type="search" name="q" value="${escapeHtml(query)}" ...>

// VULNERABLE (application 03): the results heading
<h2>${rows.length} results for &ldquo;${query}&rdquo;</h2>
```

One is escaped. The other is not. The browser cannot tell which characters were
meant as text.""",
    ),
    # Demo 3: the two gates that make a terminal insufficient.
    (
        """The payload calls the settlement console, which refuses requests from a
terminal:""",
        """`app/console/route.js` has two gates:

```js
if (claims?.sub !== 'administrator') return json({ ... }, 403);
if (request.headers.get('x-requested-with') !== 'XMLHttpRequest') {
  return json({ ... }, 403);
}
```

The payload calls that console, and it refuses requests from a terminal:""",
    ),
    # Demo 4: the real embedded-key branch.
    (
        """```js
if (header.jwk && typeof header.jwk.k === 'string') {
  const embedded = createHmac('sha256', header.jwk.k).update(input).digest();
  /* compared against the token's signature */
}
```""",
        """From `apps/04-keyring/lib/store.js`:

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
```""",
    ),
]


def main() -> None:
    text = DECK.read_text()

    for old, new in REPLACEMENTS:
        if old not in text:
            print(f"NOT FOUND: {old.splitlines()[0][:64]!r}")
            continue
        text = text.replace(old, new, 1)

    DECK.write_text(text)
    print("em dashes:", text.count("—"))
    print("slides:", text.count("\n# "))


if __name__ == "__main__":
    main()