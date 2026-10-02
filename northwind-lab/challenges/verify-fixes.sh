#!/usr/bin/env bash
# The programmer's half of each exercise.
#
# The point of these challenges is not the flag. It is that a developer can
# break the target, read the one line that made it break, change it, and then
# watch the same attack fail. This script automates that loop so the exercise
# has a measurable outcome on both sides.
#
# For each challenge it:
#   1. runs the attack against the unpatched target and expects it to succeed
#   2. applies the documented one-line fix to a scratch copy
#   3. restarts a patched instance on a spare port
#   4. runs the identical attack against it and expects it to fail
#
# Usage: bash verify-fixes.sh
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"

set -a
# shellcheck disable=SC1091
[ -f .env ] && . ./.env || . ./flags.env.example
set +a

patch_dir="$(mktemp -d)"
scratch="$(mktemp)"
cleanup() {
  bash "$here/dev-down.sh" >/dev/null 2>&1
  rm -rf "$patch_dir" "$scratch"
}
trap cleanup EXIT

pass=0
fail=0

report() { # name expected_actual expected_substring
  local name="$1" output="$2" want="$3"
  if printf '%s' "$output" | grep -qF -- "$want"; then
    printf '  %-52s %s\n' "$name" "$2_expected_marker_seen"
    pass=$((pass + 1))
  else
    printf '  %-52s FAIL (expected %s)\n' "$name" "$want"
    fail=$((fail + 1))
  fi
}

# ---------------------------------------------------------------------------
# 01 JWT forgery
# ---------------------------------------------------------------------------
echo "== 01 JWT forgery =="
BASE=http://127.0.0.1:8801 bash "$here/01-jwt-forgery/solution/solve.sh" >"$scratch" 2>&1
report "unpatched: forged token reaches the admin area" "$(cat "$scratch")" "$FLAG_JWT"

cp -a 01-jwt-forgery "$patch_dir/01"
python3 - "$patch_dir/01/api/_lib.js" <<'PY'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1]); s = p.read_text()
# The fix is to delete the branch that trusts the token's own `alg`.
s2 = re.sub(r"  // VULNERABLE \(challenge 01\).*?\n\n", "", s, flags=re.S)
assert s2 != s, "no challenge-01 defect block found"
p.write_text(s2)
PY
( cd "$patch_dir/01" && setsid env FLAG_JWT="$FLAG_JWT" JWT_SECRET="$JWT_SECRET" \
    CHALLENGE=01-patched PORT=8811 node "$here/_shared/serve.mjs" \
    >"$patch_dir/01.log" 2>&1 < /dev/null & )
sleep 3
BASE=http://127.0.0.1:8811 bash "$here/01-jwt-forgery/solution/solve.sh" >"$scratch" 2>&1
if grep -qF "$FLAG_JWT" "$scratch"; then
  printf '  %-52s FAIL (still exploitable after fix)\n' "patched: forged token rejected"
  fail=$((fail + 1))
else
  printf '  %-52s ok\n' "patched: forged token rejected"
  pass=$((pass + 1))
fi

# ---------------------------------------------------------------------------
# 02 SQL injection
# ---------------------------------------------------------------------------
echo
echo "== 02 SQL injection =="
BASE=http://127.0.0.1:8802 bash "$here/02-sqli/solution/solve.sh" >"$scratch" 2>&1
report "unpatched: tautology discloses withheld lines" "$(cat "$scratch")" "$FLAG_SQLI"

cp -a 02-sqli "$patch_dir/02"
python3 - "$patch_dir/02/api/catalogue.js" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); s = p.read_text()
old = "const sql = `SELECT sku, name, category, price_cents, classification FROM products WHERE category = '${category}' AND classification = 'public' ORDER BY id`;"
new = ("const sql = `SELECT sku, name, category, price_cents, classification FROM products"
       " WHERE category = ? AND classification = 'public' ORDER BY id`;")
assert old in s, "vulnerable statement not found"
s = s.replace(old, new, 1)
s = s.replace("rows = db.prepare(sql).all();", "rows = db.prepare(sql).all(category);", 1)
p.write_text(s)
PY
( cd "$patch_dir/02" && setsid env FLAG_SQLI="$FLAG_SQLI" \
    CHALLENGE=02-patched PORT=8812 node "$here/_shared/serve.mjs" \
    >"$patch_dir/02.log" 2>&1 < /dev/null & )
sleep 3
BASE=http://127.0.0.1:8812 bash "$here/02-sqli/solution/solve.sh" >"$scratch" 2>&1
if grep -qF "$FLAG_SQLI" "$scratch"; then
  printf '  %-52s FAIL (still exploitable after fix)\n' "patched: tautology treated as data"
  fail=$((fail + 1))
else
  printf '  %-52s ok\n' "patched: tautology treated as data"
  pass=$((pass + 1))
fi

# ---------------------------------------------------------------------------
# 03 Cross-site scripting
# ---------------------------------------------------------------------------
echo
echo "== 03 Cross-site scripting =="
if BASE=http://127.0.0.1:8803 timeout 90 python3 "$here/03-xss/solution/solve.py" >"$scratch" 2>&1 \
   && grep -qF "$FLAG_XSS" "$scratch"; then
  printf '  %-52s ok\n' "unpatched: script reads the settlement key"
  pass=$((pass + 1))
else
  printf '  %-52s FAIL\n' "unpatched: script reads the settlement key"
  fail=$((fail + 1))
fi

cp -a 03-xss "$patch_dir/03"
python3 - "$patch_dir/03/api/search.js" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); s = p.read_text()
old = "${rows.length} result${rows.length === 1 ? '' : 's'} for &ldquo;${query}&rdquo;"
new = "${rows.length} result${rows.length === 1 ? '' : 's'} for &ldquo;${escapeHtml(query)}&rdquo;"
assert old in s, "unescaped reflection not found"
s = s.replace(old, new, 1)
s = s.replace("import { storefront, productGrid, page } from './_lib.js';",
              "import { storefront, productGrid, page, escapeHtml } from './_lib.js';", 1)
p.write_text(s)
PY
( cd "$patch_dir/03" && setsid env FLAG_XSS="$FLAG_XSS" JWT_SECRET="$JWT_SECRET" \
    CHALLENGE=03-patched PORT=8813 node "$here/_shared/serve.mjs" \
    >"$patch_dir/03.log" 2>&1 < /dev/null & )
sleep 3
if BASE=http://127.0.0.1:8813 timeout 90 python3 "$here/03-xss/solution/solve.py" >"$scratch" 2>&1 \
   && grep -qF "$FLAG_XSS" "$scratch"; then
  printf '  %-52s FAIL (still exploitable after fix)\n' "patched: reflection is encoded"
  fail=$((fail + 1))
else
  printf '  %-52s ok\n' "patched: reflection is encoded"
  pass=$((pass + 1))
fi

# ---------------------------------------------------------------------------
# 04 Key-path traversal
# ---------------------------------------------------------------------------
echo
echo "== 04 Key-path traversal =="
BASE=http://127.0.0.1:8804 bash "$here/04-jwt-kid-injection/solution/solve.sh" >"$scratch" 2>&1
report "unpatched: kid chooses the verification key" "$(cat "$scratch")" "$FLAG_KID"

cp -a 04-jwt-kid-injection "$patch_dir/04"
python3 - "$patch_dir/04/api/_lib.js" <<'PY'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1]); s = p.read_text()
old = re.search(r"  let key;\n  try \{.*?\n  \}\n", s, flags=re.S)
assert old, "kid-based key lookup not found"
# The fix: never let the token influence which key is used.
s = s.replace(old.group(0), "  const key = signingSecret();\n", 1)
s = s.replace(re.search(r"  // The signing key is located the same way.*?\n.*?\n", s).group(0), "", 1)
s = s.replace("  const header = { alg: ACCEPTED_ALGORITHM, typ: 'JWT', kid: kid ?? DEFAULT_KEY_ID };",
              "  const header = { alg: ACCEPTED_ALGORITHM, typ: 'JWT' };", 1)
p.write_text(s)
PY
( cd "$patch_dir/04" && setsid env FLAG_KID="$FLAG_KID" JWT_SECRET="$JWT_SECRET" \
    CHALLENGE=04-patched PORT=8814 node "$here/_shared/serve.mjs" \
    >"$patch_dir/04.log" 2>&1 < /dev/null & )
sleep 3
BASE=http://127.0.0.1:8814 bash "$here/04-jwt-kid-injection/solution/solve.sh" >"$scratch" 2>&1
if grep -qF "$FLAG_KID" "$scratch"; then
  printf '  %-52s FAIL (still exploitable after fix)\n' "patched: key is no longer attacker-chosen"
  fail=$((fail + 1))
else
  printf '  %-52s ok\n' "patched: key is no longer attacker-chosen"
  pass=$((pass + 1))
fi

echo
echo "-------------------------------------------------------------"
printf 'patched behaviour confirmed: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1