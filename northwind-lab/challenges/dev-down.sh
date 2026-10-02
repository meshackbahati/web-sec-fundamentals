#!/usr/bin/env bash
# Stop the local demonstration servers started by dev-up.sh.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
shopt -s nullglob
for pidfile in "$here"/.run/*.pid; do
  kill "$(cat "$pidfile")" 2>/dev/null || true
  rm -f "$pidfile"
done
exit 0
