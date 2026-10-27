#!/usr/bin/env bash
# One fresh Claude process per monitor cycle. systemd waits 30 minutes after
# this process exits before starting the next one.
set -euo pipefail
cd /home/ubuntu/monitor
set -a
source /home/ubuntu/monitor/.env
set +a

LOG=/home/ubuntu/monitor/loop.log

# Cycle output, transcripts and MCP logs can quote Discord messages, which we
# don't store. Keep only the cycle times and exit status.
echo "=== cycle start $(date -u +%FT%TZ) ===" | tee -a "$LOG"
status=0
# The cycle reads untrusted text (Discord messages, model output), so its shell
# commands run in the sandbox from .claude/settings.json: no secret files, no
# writes to this runtime's code, and network only to the hosts it needs.
# dontAsk refuses anything outside that instead of prompting.
claude -p "$(cat CYCLE.md)" \
    --model claude-opus-5-5 --effort medium \
    --no-session-persistence \
    --permission-mode dontAsk \
    --allowedTools "Bash,Read,Write,mcp__discord__discord_read_messages,mcp__discord__discord_send" \
    >/dev/null 2>&1 || status=$?
rm -rf /home/ubuntu/.cache/claude-cli-nodejs/-home-ubuntu-monitor/mcp-logs-discord
echo "=== cycle end $(date -u +%FT%TZ) exit=$status ===" | tee -a "$LOG"
exit "$status"
