#!/usr/bin/env bash
# Start all four challenges in the background for local demonstration.
#
# Each server binds to loopback only. The script returns immediately; use
# dev-down.sh to stop them.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"

# A .env is generated with fresh random flag values when absent, so a fresh
# clone runs unattended and no published value ends up in version control.
if [ ! -f .env ]; then
  sed -e "s/set_a_unique_value_per_deployment/$(head -c3 /dev/urandom | od -An -tx1 | tr -d ' \n')/g" \
      -e "s/set-a-long-random-value-per-deployment/$(head -c24 /dev/urandom | od -An -tx1 | tr -d ' \n')/" \
      flags.env.example > .env
  echo "generated .env with random flag values"
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

declare -A PORTS=(
  [01-jwt-forgery]=8801
  [02-sqli]=8802
  [03-xss]=8803
  [04-jwt-kid-injection]=8804
)

mkdir -p .run

for challenge in "${!PORTS[@]}"; do
  port="${PORTS[$challenge]}"
  keydir="$here/$challenge/keys/"
  mkdir -p "$keydir"

  setsid env \
    FLAG_JWT="$FLAG_JWT" \
    FLAG_SQLI="$FLAG_SQLI" \
    FLAG_XSS="$FLAG_XSS" \
    FLAG_KID="$FLAG_KID" \
    JWT_SECRET="$JWT_SECRET" \
    KEY_DIR="$keydir" \
    KEY_ID="${KEY_ID:-key-2026-01.key}" \
    CHALLENGE="$challenge" \
    PORT="$port" \
    node "$here/_shared/serve.mjs" \
    > "$here/.run/$challenge.log" 2>&1 < /dev/null &

  echo $! > "$here/.run/$challenge.pid"
done

exit 0