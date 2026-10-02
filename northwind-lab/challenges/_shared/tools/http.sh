#!/usr/bin/env bash
# Resolve an HTTP client for the reference solutions.
#
# The ffcurl helper is preferred because it sends real Firefox headers, which
# some targets treat differently from curl's defaults. It is not required: on
# a machine without it the solutions fall back to curl so they remain portable
# to a venue laptop or a CI runner.
#
# Usage:  source "$(dirname "$0")/http.sh"   then   "${HTTP[@]}" <args...>

if [ -n "${FFCURL:-}" ] && [ -x "${FFCURL}" ]; then
  HTTP=("${FFCURL}")
elif [ -x "${HOME}/.config/opencode/bin/ffcurl" ]; then
  HTTP=("${HOME}/.config/opencode/bin/ffcurl")
else
  HTTP=(curl -sS)
fi