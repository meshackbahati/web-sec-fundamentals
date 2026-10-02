#!/usr/bin/env bash
# Deployment gate for the Northwind challenges.
#
# Verifies that each challenge would build and boot on Vercel: every route
# module parses and imports cleanly, the manifests are valid JSON, the routes
# the reference solutions call actually exist, and no flag value is committed
# to the source tree.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"
fail=0

note() { printf '  %-46s %s\n' "$1" "$2"; }
bad()  { printf '  %-46s FAIL\n' "$1"; fail=1; }

echo "== manifests =="
for c in 01-jwt-forgery 02-sqli 03-xss 04-jwt-kid-injection; do
  python3 -c "import json,sys; json.load(open('$c/vercel.json')); json.load(open('$c/package.json'))" 2>/dev/null \
    && note "$c vercel.json + package.json" ok || bad "$c manifests"
done

echo
echo "== vercel.json runtime values are legal =="
# Vercel rejects a bare \"nodejs24.x\" as a functions runtime; the Node runtime is
# derived from package.json engines instead. Catching it here beats a failed
# production build.
python3 - <<'EOF'
import json, glob, sys
bad = []
for path in sorted(glob.glob('*/vercel.json')):
    for pattern, cfg in json.load(open(path)).get('functions', {}).items():
        rt = cfg.get('runtime')
        if rt and '@' not in rt:
            bad.append(f"{path}: runtime {rt!r} is not a valid identifier")
for b in bad:
    print("   ", b)
sys.exit(1 if bad else 0)
EOF
[ $? -eq 0 ] && note "function runtimes valid" ok || bad "invalid function runtime"

echo
echo "== route modules parse =="
for f in */api/*.js _shared/*.js _shared/tools/*.py; do
  case "$f" in *.py) continue;; esac
  node --check "$f" 2>/dev/null && note "$f" ok || bad "$f does not parse"
done

echo
echo "== route modules import (catches bad import paths and syntax) =="
for c in 01-jwt-forgery 02-sqli 03-xss 04-jwt-kid-injection; do
  out=$(cd "$c" && KEY_DIR="$here/$c/keys/" node -e "
    const {readdirSync}=require('node:fs');
    Promise.all(readdirSync('api').filter(f=>f.endsWith('.js')).map(f=>import('./api/'+f)))
      .then(()=>console.log('ok')).catch(e=>{console.error(e.message);process.exit(1)});
  " 2>&1)
  [ "$out" = "ok" ] && note "$c imports" ok || bad "$c imports: $out"
done

echo
echo "== routes export named HTTP methods (Vercel requirement) =="
# A default export returning a Response is discarded by the Vercel runtime,
# which then waits for a Node response that never arrives and the invocation
# times out with FUNCTION_INVOCATION_TIMEOUT. Each route must export GET/POST.
for f in */api/*.js; do
  case "$f" in */_lib.js) continue;; esac
  if grep -qE '^export (async )?function (GET|POST|PUT|DELETE|PATCH)\(' "$f"; then
    note "$f" ok
  else
    bad "$f exports no named HTTP method"
  fi
done

echo
echo "== routes the reference solutions depend on =="
check_route() { [ -f "$1/api/$2.js" ] && note "$1 /$2" ok || bad "$1 /$2 missing"; }
check_route 01-jwt-forgery login;  check_route 01-jwt-forgery admin
check_route 02-sqli catalogue;     check_route 02-sqli health
check_route 03-xss login;         check_route 03-xss search; check_route 03-xss console
check_route 04-jwt-kid-injection login; check_route 04-jwt-kid-injection admin

echo
echo "== no flag value is committed to source =="
if grep -rInE 'G24\{[A-Za-z0-9_]+\}' --include='*.js' --include='*.json' --include='*.mjs' . 2>/dev/null \
   | grep -vE 'flags\.env\.example|solve\.sh|solve\.py|README'; then
  bad "flag literal present in a source file"
else
  note "no G24{} literals in app source" ok
fi

echo
[ "$fail" -eq 0 ] && echo "BUILD CHECK PASSED" || echo "BUILD CHECK FAILED"
exit "$fail"
