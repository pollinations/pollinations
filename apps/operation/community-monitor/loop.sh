#!/usr/bin/env bash
# Community model monitor loop — runs inside screen session "community-monitor".
# Each cycle: probe all community models, then one headless Claude Code pass
# (health flagging + Discord check/respond), then sleep 30 minutes.
#
# NOTE: this fresh-process-per-cycle design is not the one currently deployed
# on the EC2 box (which instead runs a single long-lived `claude
# --remote-control` session that self-schedules via /loop -- see
# watchdog.sh). Kept here as the systemd-supervised alternative / fast-follow.
set -u
cd /home/ubuntu/monitor
set -a
source /home/ubuntu/monitor/.env
set +a

LOG=/home/ubuntu/monitor/loop.log

while true; do
    echo "=== cycle start $(date -u +%FT%TZ) ===" | tee -a "$LOG"
    node probe.mjs 2>&1 | tee -a "$LOG"
    claude -p "$(cat CYCLE.md)" \
        --model sonnet --effort low \
        --allowedTools "Bash,Read,Write,mcp__discord__discord_read_messages,mcp__discord__discord_send" \
        2>&1 | tee -a "$LOG"
    echo "=== cycle end $(date -u +%FT%TZ) — sleeping 30m ===" | tee -a "$LOG"
    sleep 1800
done
