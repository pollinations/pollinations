#!/usr/bin/env bash
# Revives the community-monitor screen+claude session if it's gone.
# Run from cron every 5 minutes. Does NOT re-inject /loop -- if it has to
# restart the session, it logs that fact so a human knows to re-arm /loop.
#
# --dangerously-skip-permissions: this box runs unattended, with nobody
# watching the terminal between cycles -- a tool-permission dialog ("Do you
# want to proceed?") just stalls the whole loop until a human happens to SSH
# in, which took over an hour once (2026-07-13). All human-facing interaction
# for this agent goes through Discord (per CYCLE.md), never the terminal --
# so the terminal itself should never need anyone to type into it. This box
# is single-purpose (community model monitoring only) and CYCLE.md already
# grants it full autonomy over the actions it takes (D1 writes, Discord
# posts), so skipping the interactive approval layer matches its actual
# trust level rather than leaving a dialog that nothing will ever answer.
set -u
LOG=/home/ubuntu/monitor/watchdog.log

if screen -list 2>/dev/null | grep -q '\.community-monitor\b'; then
    exit 0
fi

echo "$(date -u +%FT%TZ) session missing, restarting" >> "$LOG"
cd /home/ubuntu/monitor
screen -dmS community-monitor bash -lc 'cd /home/ubuntu/monitor && set -a && source .env && set +a && exec claude --remote-control community-monitor --model sonnet --effort low --dangerously-skip-permissions'
echo "$(date -u +%FT%TZ) restarted -- NOTE: /loop must be re-armed manually (ssh in, screen -r community-monitor, retype /loop 15m ...)" >> "$LOG"
