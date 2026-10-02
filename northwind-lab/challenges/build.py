#!/usr/bin/env python3
"""
Generate each challenge's api/_lib.js from the correct reference.

Every challenge is deployed to Vercel as its own project, so each one must
carry its own copy of the shared library rather than importing across
directories. Generating the copies keeps the single-defect guarantee
mechanical: the generator applies exactly one marked substitution, and the
test suite fails if a challenge's library ever drifts further than that.

Run from the challenges directory:  python3 build.py
"""

import pathlib
import re
import sys

SHARED = pathlib.Path("_shared/lib.js")

# The line every correct verifier uses to pin the algorithm.
ALG_PIN = "  if (header.alg !== ACCEPTED_ALGORITHM) return null;"

# Challenge 1 accepts an unsigned token because it dispatches on the
# algorithm named inside the token.
JWT_FORGERY_DEFECT = """  // VULNERABLE (challenge 01). The server reads the algorithm from the token
  // and honours it, so an attacker chooses the verification branch by editing
  // the header. FIX: delete the block below and keep the pinned check.
  if (header.alg === 'none') {
    const unsignedExpiry = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < unsignedExpiry) return null;
    return { ...payload, _verified: false };
  }

""" + ALG_PIN

# Challenge 4 resolves the verification key from the filesystem using a
# value the token itself supplies.
KID_INJECTION_DEFECT = """  // VULNERABLE (challenge 04). The verification key is located by a path the
  // token supplies, so the attacker chooses which file is read.
  // FIX: ignore `kid` for key lookup and use the configured secret only.
  if (header.alg !== ACCEPTED_ALGORITHM) return null;

  let key;
  try {
    const kid = String(header.kid ?? '');
    // The concatenation is the defect: no normalisation, no confinement to a
    // key directory, and the traversal reaches an arbitrary file.
    key = readFileSync(KEY_ROOT + kid, 'utf8');
  } catch {
    return null;
  }

  const expected = createHmac(HMAC_ALGORITHM, key)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const provided = Buffer.from(encodedSignature, 'base64url');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) return null;
  return { ...payload, _verified: true };
}

function verifyTokenUnusedReference() {
  if (header.alg !== ACCEPTED_ALGORITHM) return null;"""


# The issuer must use the same key material the verifier reads, otherwise no
# token the platform issues would ever validate.
KID_ISSUE_SIGNATURE_OLD = (
    "  const signature = createHmac(HMAC_ALGORITHM, signingSecret())"
    ".update(input).digest('base64url');"
)
KID_ISSUE_SIGNATURE_NEW = """  // The signing key is located the same way the verifier locates it: by the
  // `kid` recorded in the header. Both halves trusting `kid` is the defect.
  ensureDefaultKey();
  const key = readFileSync(KEY_ROOT + String(header.kid ?? ''), 'utf8');
  const signature = createHmac(HMAC_ALGORITHM, key).update(input).digest('base64url');"""

KID_ISSUE_HEADER_OLD = (
    "  const header = kid ? { alg: ACCEPTED_ALGORITHM, typ: 'JWT', kid }"
    " : { alg: ACCEPTED_ALGORITHM, typ: 'JWT' };"
)
KID_ISSUE_HEADER_NEW = "  const header = { alg: ACCEPTED_ALGORITHM, typ: 'JWT', kid: kid ?? DEFAULT_KEY_ID };"

# Challenge 04 addresses its signing key by filename. The constant belongs to
# that challenge only, so it is introduced here rather than in the shared
# reference library where the other three challenges would carry it unused.
ALGO_CONST_ANCHOR = "const ACCEPTED_ALGORITHM = 'HS256';"
DEFAULT_KEY_ID_DEF = """

// The signing key is addressed by filename under KEY_DIR, which must end in a
// path separator because verifyToken concatenates it with `kid` directly.
const DEFAULT_KEY_ID = process.env.KEY_ID ?? 'key-2026-01.key';

// Deliberately unconfigured placeholder, seeded next to the key directory.
const PLACEHOLDER_KEY_ID = process.env.PLACEHOLDER_KEY_ID ?? 'key-2026-02.key';

// Resolved to an absolute path at import time so the key lookup behaves the
// same on a laptop and on a serverless runtime whose working directory
// differs. The concatenation in verifyToken remains the defect.
const KEY_ROOT = resolve(process.env.KEY_DIR ?? './keys') + '/';

// The default signing key is created on first use instead of shipped in the
// bundle, because a serverless deployment does not reliably include extra
// directories in the function bundle. The traversal defect below is
// unaffected: it does not depend on this key existing.
function ensureDefaultKey() {
  try {
    mkdirSync(KEY_ROOT, { recursive: true });
    if (!existsSync(KEY_ROOT + DEFAULT_KEY_ID)) {
      writeFileSync(KEY_ROOT + DEFAULT_KEY_ID, randomBytes(32).toString('hex'), { mode: 0o600 });
    }

    // The placeholder is provisioned independently of the real key. Seeding it
    // inside the branch above left it missing whenever /tmp was reused and the
    // real key already existed, so the traversal target disappeared on exactly
    // the instances that had been running a while.
    //
    // An unconfigured placeholder key sits one directory above the key
    // directory. The platform must never read it, but it exists, it is empty,
    // and a `kid` that climbs out of the key directory can reach it. Hosted
    // runtimes block reads outside their writable tree, so the traversal has
    // to stay within that tree to be demonstrable at all.
    const parent = KEY_ROOT.replace(/\\/keys\\/$/, '/');
    if (!existsSync(parent + PLACEHOLDER_KEY_ID)) {
      writeFileSync(parent + PLACEHOLDER_KEY_ID, '', { mode: 0o600 });
    }
  } catch {
    // A read-only filesystem is not fatal: any key already present still works.
  }
}"""


def build(challenge: str, defect: str | None, extra_import: str | None = None,
          substitutions: list[tuple[str, str]] | None = None) -> None:
    target = pathlib.Path(challenge) / "api" / "_lib.js"
    target.parent.mkdir(parents=True, exist_ok=True)

    source = SHARED.read_text()

    if extra_import:
        marker = "import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';"
        if marker not in source:
            sys.exit(f"{challenge}: crypto import marker not found")
        source = source.replace(marker, marker + "\n" + extra_import, 1)

    if defect is not None:
        if source.count(ALG_PIN) != 1:
            sys.exit(f"{challenge}: expected exactly one algorithm pin, found "
                     f"{source.count(ALG_PIN)}")
        source = source.replace(ALG_PIN, defect, 1)

    for old, new in substitutions or []:
        if source.count(old) != 1:
            sys.exit(f"{challenge}: substitution target not unique: {old[:60]!r}")
        source = source.replace(old, new, 1)

    target.write_text(source)
    print(f"wrote {target}")


def main() -> None:
    # 02 (SQL injection) and 03 (XSS) carry no library defect. Their
    # vulnerabilities are in the route handlers, so they receive an exact
    # copy of the correct library.
    build("01-jwt-forgery", JWT_FORGERY_DEFECT)
    build("02-sqli", None)
    build("03-xss", None)
    build(
        "04-jwt-kid-injection",
        KID_INJECTION_DEFECT,
        extra_import=(
            "import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';\n"
            "import { resolve } from 'node:path';"
        ),
        substitutions=[
            (KID_ISSUE_SIGNATURE_OLD, KID_ISSUE_SIGNATURE_NEW),
            (KID_ISSUE_HEADER_OLD, KID_ISSUE_HEADER_NEW),
            (ALGO_CONST_ANCHOR, ALGO_CONST_ANCHOR + DEFAULT_KEY_ID_DEF),
        ],
    )


if __name__ == "__main__":
    main()