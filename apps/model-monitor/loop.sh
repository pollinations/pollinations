#!/usr/bin/env bash
# One cycle of the community model health monitor: generate fresh probe
# traffic, then hand off to headless Claude Code to read the data, use
# judgment, and (outside dry-run) deactivate genuinely unstable models.
#
# Designed to be started by systemd with Restart=always: this script runs
# ONE cycle then exits 0. All looping/retry is systemd's job, not this
# script's — that way a crash mid-cycle just gets retried cleanly by
# systemd's RestartSec, instead of an in-process setInterval potentially
# wedging silently.
#
# Required env (see .env.example):
#   ENTER_API_TOKEN     - sk_ token for monitor.mjs to use to probe models
#   TINYBIRD_READ_TOKEN - prod read token for model_health / recent_server_errors
# Optional:
#   MONITOR_DRY_RUN=1        - default. Claude Code logs what it WOULD deactivate
#                               but is instructed not to run D1 updates.
#                               Set to 0 only after a soak period confirms good judgment.
#   CLOUDFLARE_API_TOKEN     - required only when MONITOR_DRY_RUN=0; token with
#                               D1 edit access for direct administration.
#   MONITOR_CYCLE_SECONDS=300 - only used for logging; actual cadence is set by
#                               the systemd timer/unit, not by this script sleeping.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

: "${ENTER_API_TOKEN:?ENTER_API_TOKEN is required}"
: "${TINYBIRD_READ_TOKEN:?TINYBIRD_READ_TOKEN is required}"
export MONITOR_DRY_RUN="${MONITOR_DRY_RUN:-1}"
if [[ "$MONITOR_DRY_RUN" == "0" ]]; then
    : "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required when MONITOR_DRY_RUN=0}"
else
    unset CLOUDFLARE_API_TOKEN
fi

echo "[loop] $(date -u +%FT%TZ) starting cycle (dry_run=${MONITOR_DRY_RUN})"

echo "[loop] generating fresh probe traffic (monitor.mjs --once)"
node monitor.mjs --once

echo "[loop] handing off to Claude Code for diagnosis + judgment"
claude -p "$(cat AGENT_INSTRUCTIONS.md)" \
    --allowedTools "Bash,Read" \
    --output-format text

echo "[loop] $(date -u +%FT%TZ) cycle complete"
