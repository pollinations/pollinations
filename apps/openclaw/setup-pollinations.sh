#!/usr/bin/env bash
# Preserve the published installer URL; setup is maintained in the npm CLI.
# New users: npx @pollinations/cli harness openclaw on
set -e

if [ -n "${1:-}" ]; then
    export POLLINATIONS_API_KEY="$1"
fi

exec npx -y @pollinations/cli harness openclaw on
