#!/usr/bin/env bash
# Revives the community-monitor screen+claude session if it's gone.
# Run from cron every 5 minutes. Does NOT re-inject /loop -- if it has to
# restart the session, it logs that fact so a human knows to re-arm /loop.
set -u
LOG=/home/ubuntu/monitor/watchdog.log

if screen -list 2>/dev/null | grep -q '\.community-monitor\b'; then
    exit 0
fi

echo "$(date -u +%FT%TZ) session missing, restarting" >> "$LOG"
cd /home/ubuntu/monitor
screen -dmS community-monitor bash -lc 'cd /home/ubuntu/monitor && set -a && source .env && set +a && exec claude --remote-control community-monitor --model sonnet --effort low'
echo "$(date -u +%FT%TZ) restarted -- NOTE: /loop must be re-armed manually (ssh in, screen -r community-monitor, retype /loop 15m ...)" >> "$LOG"
