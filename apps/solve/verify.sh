#!/usr/bin/env bash
# Verify the four public production targets.
#
# Run this immediately before the talk. It confirms that each application is
# serving, that the storefront renders, and that the reference attack still
# works against the public URL. Rehearsing against localhost proves nothing
# about the host the audience will see.
#
# It also asserts the deployed applications are the VULNERABLE ones: if a
# patched copy were deployed by mistake the attacks would stop succeeding and
# this script would say so.
#
# Usage: bash apps/solve/verify.sh
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"
# shellcheck source=./http.sh
source "$here/http.sh"

declare -A URLS=(
  [01-session-forge]="https://northwind-01-session-forge.vercel.app"
  [02-clearance]="https://northwind-02-clearance.vercel.app"
  [03-reflector]="https://northwind-03-reflector.vercel.app"
  [04-keyring]="https://northwind-04-keyring.vercel.app"
)

declare -A SOLVER=(
  [01-session-forge]=solve-01.sh
  [02-clearance]=solve-02.sh
  [04-keyring]=solve-04.sh
)

pass=0
fail=0
ok()  { printf '  %-44s ok  %s\n' "$1" "${2:-}"; pass=$((pass + 1)); }
bad() { printf '  %-44s FAIL  %s\n' "$1" "${2:-}"; fail=$((fail + 1)); }

echo "== reachability and storefront =="
for app in "${!URLS[@]}"; do
  url="${URLS[$app]}"

  code=$("${HTTP[@]}" -s -m 60 -o /tmp/nw-health.json -w '%{http_code}' "$url/api/health" 2>/dev/null)
  if [ "$code" = "200" ] && grep -q "\"application\": \"$app\"" /tmp/nw-health.json; then
    ok "$app  /api/health"
  else
    bad "$app  /api/health" "HTTP $code"
  fi

  code=$("${HTTP[@]}" -s -m 60 -o /tmp/nw-home.html -w '%{http_code}' "$url/" 2>/dev/null)
  if grep -q '<h1>' /tmp/nw-home.html 2>/dev/null; then
    ok "$app  storefront renders" "HTTP $code"
  else
    bad "$app  storefront renders" "HTTP $code"
  fi
done

echo
echo "== attack paths against the public targets =="
for app in 01-session-forge 02-clearance 04-keyring; do
  url="${URLS[$app]}"
  found=$(BASE="$url" timeout 180 bash "$here/${SOLVER[$app]}" 2>&1 | grep -oE 'G24\{[^}]+\}' | head -1)
  if printf '%s' "$found" | grep -qE '^G24\{[A-Za-z0-9_]+\}$'; then
    ok "$app  attack returns a flag" "$found"
  else
    bad "$app  attack returns a flag" "got '${found:-nothing}'"
  fi
done

# 03 needs a real browser: the flag is only readable by executing script in an
# administrator's session.
found=$(BASE="${URLS[03-reflector]}" timeout 180 python3 "$here/solve-03.py" 2>&1 \
        | grep -oE 'G24\{[^}]+\}' | head -1)
if printf '%s' "$found" | grep -qE '^G24\{[A-Za-z0-9_]+\}$'; then
  ok "03-reflector  attack returns a flag" "$found"
else
  bad "03-reflector  attack returns a flag" "got '${found:-nothing}'"
fi

echo
echo "== the deployed applications must be the vulnerable ones =="
output=$(BASE="${URLS[01-session-forge]}" bash "$here/solve-01.sh" 2>&1)
if printf '%s' "$output" | grep -q 'HTTP 403'; then
  ok "01  a genuine low-privilege token is refused"
else
  bad "01  a genuine low-privilege token is refused" "no 403 observed"
fi

echo
echo "-------------------------------------------------------------"
printf 'public targets: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1