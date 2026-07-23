#!/usr/bin/env bash
# Writes a structured health snapshot for the community-monitor loop to
# /home/ubuntu/monitor/health-status.json. Does NOT post to Discord itself --
# this box has no standalone Discord credential (the agent posts via its own
# MCP session, not a reusable webhook/bot token), so alerting is done by an
# external reader (a scheduled job elsewhere with Discord access) that reads
# this file over SSH and only pings a human when something looks wrong.
#
# Run from cron hourly, alongside watchdog.sh (every 5 min, session-alive)
# and nudge.sh (every 15 min, unstick stalls) -- this is the higher-level
# "is the loop actually making progress" check neither of those provides.
set -u
STATE=/home/ubuntu/monitor/state.json
OUT=/home/ubuntu/monitor/health-status.json
NUDGE_LOG=/home/ubuntu/monitor/nudge.log
WATCHDOG_LOG=/home/ubuntu/monitor/watchdog.log

now=$(date -u +%s)

screen_alive=false
if screen -list 2>/dev/null | grep -q '\.community-monitor\b'; then
    screen_alive=true
fi

state_mtime=0
if [ -f "$STATE" ]; then
    state_mtime=$(stat -c '%Y' "$STATE" 2>/dev/null || echo 0)
fi
state_age_seconds=$(( now - state_mtime ))

# Cycles run every ~15 min; anything past 30 min without a state.json write
# means the loop has genuinely stalled, not just mid-cycle.
stalled=false
if [ "$state_mtime" -eq 0 ] || [ "$state_age_seconds" -gt 1800 ]; then
    stalled=true
fi

# Recent restarts (watchdog had to revive a dead session) and recent
# unresolved nudge warnings (a stuck prompt that retype+enter didn't clear)
# are both worth surfacing even if the loop looks alive right now.
recent_restarts=0
if [ -f "$WATCHDOG_LOG" ]; then
    recent_restarts=$(awk -v cutoff="$(date -u -d '-1 hour' +%FT%TZ 2>/dev/null || date -u +%FT%TZ)" '$0 >= cutoff' "$WATCHDOG_LOG" 2>/dev/null | grep -c 'session missing' || true)
fi

recent_nudge_warnings=0
if [ -f "$NUDGE_LOG" ]; then
    recent_nudge_warnings=$(tail -20 "$NUDGE_LOG" | grep -c 'WARNING' || true)
fi

python3 - "$OUT" "$screen_alive" "$state_age_seconds" "$stalled" "$recent_restarts" "$recent_nudge_warnings" "$now" <<'PY'
import json, sys
out, screen_alive, state_age, stalled, restarts, nudge_warnings, now = sys.argv[1:8]
data = {
    "checked_at_unix": int(now),
    "screen_alive": screen_alive == "true",
    "state_age_seconds": int(state_age),
    "stalled": stalled == "true",
    "restarts_last_hour": int(restarts),
    "recent_nudge_warnings": int(nudge_warnings),
}
with open(out, "w") as f:
    json.dump(data, f, indent=2)
PY

echo "$(date -u +%FT%TZ) healthcheck: screen_alive=$screen_alive state_age_seconds=$state_age_seconds stalled=$stalled restarts_last_hour=$recent_restarts nudge_warnings=$recent_nudge_warnings" >> /home/ubuntu/monitor/healthcheck.log
