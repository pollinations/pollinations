#!/usr/bin/env bash
# One fresh Claude process per monitor cycle. systemd waits 15 minutes after
# this process exits before starting the next one.
set -euo pipefail
cd /home/ubuntu/monitor
set -a
source /home/ubuntu/monitor/.env
set +a

LOG=/home/ubuntu/monitor/loop.log

echo "=== cycle start $(date -u +%FT%TZ) ===" | tee -a "$LOG"
claude -p "$(cat CYCLE.md)" \
    --model claude-opus-4-8 --effort medium \
    --dangerously-skip-permissions \
    --allowedTools "Bash,Read,Write,mcp__discord__discord_read_messages,mcp__discord__discord_send" \
    2>&1 | tee -a "$LOG"
echo "=== cycle end $(date -u +%FT%TZ) ===" | tee -a "$LOG"
