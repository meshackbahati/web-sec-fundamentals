#!/usr/bin/env bash
# Deploy every challenge to Vercel and set its flag as a runtime secret.
#
# Each challenge is its own Vercel project, because each is an independently
# solvable target rather than one deployment with three routes. Flags are set
# as environment variables and never appear in the uploaded source.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"

if [ -f .env ]; then set -a; . ./.env; set +a; fi

declare -A FLAGS=(
  [01-jwt-forgery]=FLAG_JWT
  [02-sqli]=FLAG_SQLI
  [03-xss]=FLAG_XSS
  [04-jwt-kid-injection]=FLAG_KID
)

# Flag values are never written into this repository. They are read from the
# deployment environment (.env or the surrounding shell), because the targets
# are publicly reachable and a flag committed here is a published flag.
: "${FLAG_JWT:?FLAG_JWT is not set; copy .env and set the deployment flags}"
: "${FLAG_SQLI:?FLAG_SQLI is not set}"
: "${FLAG_XSS:?FLAG_XSS is not set}"
: "${FLAG_KID:?FLAG_KID is not set}"
: "${JWT_SECRET:?JWT_SECRET is not set}"

for challenge in 01-jwt-forgery 02-sqli 03-xss 04-jwt-kid-injection; do
  echo "### $challenge"
  cd "$here/$challenge"

  # First deployment establishes the project so environment variables can be
  # attached to it.
  vercel deploy --prod --yes --name "northwind-$challenge" 2>&1 | grep -E 'Production|Error' | tail -1

  var="${FLAGS[$challenge]}"
  printf '%s' "${!var}" \
    | vercel env add "${FLAGS[$challenge]}" production --yes 2>&1 | grep -qiE 'error' \
    && echo "   (flag variable already present)"
  printf '%s' "${JWT_SECRET}" \
    | vercel env add JWT_SECRET production --yes 2>&1 | grep -qiE 'error' \
    && echo "   (JWT_SECRET already present)"

  # Challenge 04 resolves signing keys from KEY_DIR at runtime.
  if [ "$challenge" = "04-jwt-kid-injection" ]; then
    printf '%s' "./keys/" | vercel env add KEY_DIR production --yes 2>&1 >/dev/null || true
    printf '%s' "key-2026-01.key" | vercel env add KEY_ID production --yes 2>&1 >/dev/null || true
  fi

  vercel deploy --prod --yes 2>&1 | grep -E 'Production|Error' | tail -1
  cd "$here"
done