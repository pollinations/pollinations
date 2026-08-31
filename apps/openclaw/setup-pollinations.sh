#!/bin/bash

# Configure OpenClaw to use Pollinations.ai models.
# Works on: macOS, Linux, Windows (WSL/Git Bash/MSYS2)
#
# This is a thin shim over the polli CLI's integrated `openclaw` harness, so
# the model catalog, provider config, and default model all come from the same
# live source of truth used by `polli harness` everywhere. It is intentionally
# not a second, hand-maintained setup path.

set -e

if ! command -v openclaw >/dev/null 2>&1; then
    echo "OpenClaw not found. Install it first:"
    echo "  curl -fsSL https://openclaw.ai/install.sh | bash"
    echo "Then run this script again."
    exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
    echo "npx (Node.js) not found. Install Node.js 20+, then run this script again."
    exit 1
fi

echo "Using the polli CLI to configure OpenClaw (provider, live models, skill)..."
npx --yes @pollinations/cli@latest harness openclaw on "$@"

echo ""
echo "Restarting the OpenClaw gateway so the config loads..."
if command -v openclaw >/dev/null 2>&1; then
    openclaw gateway restart >/dev/null 2>&1 || true
fi

echo ""
echo "Done! OpenClaw is ready to use Pollinations."
echo "Switch models with:  /model pollinations/<id>   (see: polli models)"
echo "Manage later with:   polli harness openclaw status|off"
