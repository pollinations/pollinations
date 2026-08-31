#!/bin/bash

# Compatibility shim for the original OpenClaw setup URL.
# It forwards to the same adapter as the CLI; the adapter reuses or requests
# login credentials only when needed.
set -e

if [ "$#" -gt 0 ]; then
    echo "Warning: legacy setup arguments are ignored; use polli login to configure credentials." >&2
fi

if command -v polli >/dev/null 2>&1; then
    exec polli harness openclaw on --no-browser
else
    exec npx --yes @pollinations/cli harness openclaw on --no-browser
fi
