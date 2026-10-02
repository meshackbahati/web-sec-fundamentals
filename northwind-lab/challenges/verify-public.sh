#!/usr/bin/env bash
# Verify the four public production targets.
#
# Run this immediately before the talk. It confirms that each deployment is
# serving, that the storefront renders, and that the reference attack still
# works against the public URL — which is the thing that actually matters on
# the day, since a rehearsed attack against localhost proves nothing about
# the host the audience will see.
#
# It also asserts the deployed targets are the VULNERABLE builds. If a patched
# copy were ever deployed by mistake, the attacks would stop succeeding and
# this script would say so.
#
# Usage: bash verify-public.sh
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"

# Prefer the ffcurl helper (real Firefox headers); fall back to curl so the
# script also runs on a machine that does not have it.
if [ -n "${FFCURL:-}" ] && [ -x "${FFCURL}" ]; then
  HTTP=("${FFCURL}")
elif [ -x "${HOME}/.config/opencode/bin/ffcurl" ]; then
  HTTP=("${HOME}/.config/opencode/bin/ffcurl")
else
  HTTP=(curl -sS)
fi

declare -A URLS=(
  [01-jwt-forgery]="https://northwind-01-jwt-forgery.vercel.app"
  [02-sqli]="https://northwind-02-sqli.vercel.app"
  [03-xss]="https://northwind-03-xss.vercel.app"
  [04-jwt-kid-injection]="https://northwind-04-jwt-kid-injection.vercel.app"
)

pass=0
fail=0
ok()   { printf '  %-46s %s\n' "$1" "ok"; pass=$((pass + 1)); }
bad()  { printf '  %-46s FAIL  %s\n' "$1" "${2:-}"; fail=$((fail + 1)); }

echo "== reachability and storefront =="
for challenge in 01-jwt-forgery 02-sqli 03-xss 04-jwt-kid-injection; do
  url="${URLS[$challenge]}"
  code=$("${HTTP[@]}" -s -m 60 -o /dev/null -w '%{http_code}' "$url/api/health" 2>/dev/null)
  if [ "$code" = "200" ]; then ok "$challenge  /api/health"; else bad "$challenge  /api/health" "HTTP $code"; fi

  code=$("${HTTP[@]}" -s -m 60 -o /tmp/nw-public.html -w '%{http_code}' "$url/" 2>/dev/null)
  if grep -q '<title>Home — Northwind Supply Co.</title>' /tmp/nw-public.html 2>/dev/null; then
    ok "$challenge  storefront renders"
  else
    bad "$challenge  storefront renders" "HTTP $code"
  fi
done

echo
echo "== attack paths against the public targets =="
for challenge in 01-jwt-forgery 02-sqli 04-jwt-kid-injection; do
  url="${URLS[$challenge]}"
  found=$(BASE="$url" bash "$challenge/solution/solve.sh" 2>&1 | grep -oE 'G24\{[^}]+\}' | head -1)
  if printf '%s' "$found" | grep -qE '^G24\{[A-Za-z0-9_]+\}$'; then
    ok "$challenge  attack returns a flag" "$found"
  else
    bad "$challenge  attack returns a flag" "got '${found:-nothing}'"
  fi
done

# 03 needs a real browser, because the flag is only readable by executing
# script in an administrator's session.
found=$(BASE="${URLS[03-xss]}" timeout 120 python3 03-xss/solution/solve.py 2>&1 \
        | grep -oE 'G24\{[^}]+\}' | head -1)
if printf '%s' "$found" | grep -qE '^G24\{[A-Za-z0-9_]+\}$'; then
  ok "03-xss  attack returns a flag" "$found"
else
  bad "03-xss  attack returns a flag" "got '${found:-nothing}'"
fi

echo
echo "== the deployed builds must be the vulnerable ones =="
grep_out=$(BASE="${URLS[01-jwt-forgery]}" bash 01-jwt-forgery/solution/solve.sh 2>&1)
if printf '%s' "$grep_out" | grep -q 'HTTP 403'; then
  ok "01  a genuine low-privilege token is refused"
else
  bad "01  a genuine low-privilege token is refused" "no 403 observed"
fi

echo
echo "-------------------------------------------------------------"
printf 'public targets: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1