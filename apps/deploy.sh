#!/usr/bin/env bash
# Deploy the four Next.js applications, each as its own Vercel project.
#
# Each project is pointed at its own application directory, so a push to the
# repository builds all four independently and none of them can overwrite
# another's production alias.
#
# Flags are read from the environment and never committed.
#
# Usage: FLAG_JWT=... FLAG_SQLI=... FLAG_XSS=... FLAG_KID=... \
#        JWT_SECRET=... bash apps/deploy.sh
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"
cd "$repo"

: "${FLAG_JWT:?FLAG_JWT is not set}"
: "${FLAG_SQLI:?FLAG_SQLI is not set}"
: "${FLAG_XSS:?FLAG_XSS is not set}"
: "${FLAG_KID:?FLAG_KID is not set}"
: "${JWT_SECRET:?JWT_SECRET is not set}"

declare -A APPS=(
  [01-session-forge]=FLAG_JWT
  [02-clearance]=FLAG_SQLI
  [03-reflector]=FLAG_XSS
  [04-keyring]=FLAG_KID
)

declare -A PROJECT=(
  [01-session-forge]=northwind-01-session-forge
  [02-clearance]=northwind-02-clearance
  [03-reflector]=northwind-03-reflector
  [04-keyring]=northwind-04-keyring
)

for app in 01-session-forge 02-clearance 03-reflector 04-keyring; do
  flagvar="${APPS[$app]}"
  name="${PROJECT[$app]}"
  echo "### $app  ($name)"

  # The CLI records the project link in the working directory. Deploying from
  # the repository root therefore leaves one .vercel there, and the next
  # iteration would silently reuse the previous project. Each iteration starts
  # from a clean link, then keeps its own beside the application.
  rm -rf "$repo/.vercel"

  vercel deploy --prod --yes --name "$name" 2>&1 | grep -E 'Production|Error' | tail -1

  mkdir -p "$here/$app/.vercel"
  cp "$repo/.vercel/project.json" "$here/$app/.vercel/project.json"
  link="$here/$app/.vercel/project.json"
  if [ -f "$link" ]; then
    org_id=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['orgId'])" "$link")
    project_id=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['projectId'])" "$link")
    export VERCEL_ORG_ID="$org_id" VERCEL_PROJECT_ID="$project_id"

    # Scope the Git integration to this application directory. Without it every
    # push builds the repository root, which contains no application, and that
    # build takes over the production alias.
    APP_SLUG="$app" PROJECT_NAME="$name" ROOT_DIR="apps/$app" \
      node "$here/../apps/_shared/set-root-directory.mjs" 2>&1 | tail -1

    var="$flagvar"
    printf '%s' "${!var}" | vercel env add "$flagvar" production --yes >/dev/null 2>&1 \
      || echo "   ($flagvar already set)"
    printf '%s' "$JWT_SECRET" | vercel env add JWT_SECRET production --yes >/dev/null 2>&1 \
      || echo "   (JWT_SECRET already set)"

    vercel deploy --prod --yes 2>&1 | grep -E 'Production|Error' | tail -1
  fi
  unset VERCEL_ORG_ID VERCEL_PROJECT_ID
done

rm -rf "$repo/.vercel"