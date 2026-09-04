#!/bin/bash
#
# Backward-compatible shim for the Pollinations x OpenClaw setup.
#
# The maintained path is `polli harness openclaw on`, which adds the
# pollinations provider, mints a dedicated key, pulls the live model catalog,
# and installs the Polli skill. This script forwards to it so the old
# `curl ... | bash -s -- KEY` one-liner keeps working.
#
# Usage: curl ... | bash -s -- YOUR_API_KEY

set -e

KEY="$1"

if [ -z "$KEY" ]; then
    echo "Usage: $0 <POLLINATIONS_API_KEY>"
    echo "Newer one-liner (no key needed; opens browser login):"
    echo '  npx @pollinations/cli harness openclaw on'
    exit 1
fi

if ! command -v openclaw >/dev/null 2>&1; then
    echo "OpenClaw not found. Install it first:"
    echo "  curl -fsSL https://openclaw.ai/install.sh | bash"
    exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
    echo "npx not found. Install Node.js, then run:"
    echo "  npx @pollinations/cli harness openclaw on"
    exit 1
fi

# Store the supplied key so the harness reuses it instead of opening a login.
printf '%s' "$KEY" | npx -y @pollinations/cli auth login --with-token >/dev/null 2>&1 || true

npx -y @pollinations/cli harness openclaw on

echo ""
echo "Done! Pollinations.ai is ready in OpenClaw."
echo "  Default model: pollinations/kimi (switch with /model)"
echo "  Your account:  https://enter.pollinations.ai"
