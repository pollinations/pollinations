#!/bin/bash

# DEPRECATED: this script used to hardcode OpenClaw's config and a fixed
# Pollinations model list directly in bash. That logic now lives in
# `polli harness openclaw`, which fetches the current model catalog instead
# of a list that goes stale (see CODING_HARNESSES.md). This script is kept
# only so the old
#   curl ... | bash -s -- YOUR_API_KEY
# one-liner keeps working; it forwards to the CLI and does nothing else.
#
# Prefer running directly:
#   npx @pollinations/cli harness openclaw on

set -e

if [ -n "$1" ]; then
    echo "Note: this script no longer uses the API key argument directly."
    echo "It stores it as your Polli account key, then mints a dedicated"
    echo "OpenClaw key from it (so OpenClaw never shares a key with anything else)."
    printf '%s' "$1" | npx -y @pollinations/cli@latest auth login --with-token
fi

exec npx -y @pollinations/cli@latest harness openclaw on "${@:2}"
