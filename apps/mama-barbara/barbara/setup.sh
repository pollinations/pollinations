#!/bin/bash
# One-time setup inside a polli sandbox (template pollinations or
# pollinations-large): Claude Code on Pollinations, the Pollinations and
# Connectors MCP servers, and bun for the Telegram bridge.
#
#   bash setup.sh [model]     # default anthropic/claude-sonnet-5.5
#
# Change the model later with `polli harness claude-code --model <id>`, then
# `bash start.sh`.
set -euo pipefail
cd "$(dirname "$0")"
[ -x "$HOME/.bun/bin/bun" ] || curl -fsSL https://bun.sh/install | bash
polli update
polli harness claude-code --model "${1:-anthropic/claude-sonnet-5.5}" --no-browser
polli mcp install claude-code pollinations composio --no-browser
(cd telegram && "$HOME/.bun/bin/bun" install --no-summary)
mkdir -p notes "$HOME/work"
