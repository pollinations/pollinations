#!/usr/bin/env bash
# Writes a structured health snapshot for the community-monitor loop to
# /home/ubuntu/monitor/health-status.json. Does NOT post to Discord itself --
# alerting is done by an external reader that consumes this file and only
# pings a human when something looks wrong.
#
# Run from cron hourly. systemd owns process supervision; this independently
# checks that the service is alive and state.json is still progressing.
set -u
STATE=/home/ubuntu/monitor/state.json
OUT=/home/ubuntu/monitor/health-status.json

now=$(date -u +%s)

service_state=$(systemctl show community-monitor --property=ActiveState --value 2>/dev/null || echo unknown)
service_healthy=false
case "$service_state" in
    active|activating) service_healthy=true ;;
esac

state_mtime=0
if [ -f "$STATE" ]; then
    state_mtime=$(stat -c '%Y' "$STATE" 2>/dev/null || echo 0)
fi
state_age_seconds=$(( now - state_mtime ))

# A fresh process starts 15 minutes after the previous cycle completes. Some
# full-catalog probes take longer than usual, so allow one hour without a state
# write before declaring a running service stalled.
stalled=false
if [ "$service_healthy" = false ] || [ "$state_mtime" -eq 0 ] || [ "$state_age_seconds" -gt 3600 ]; then
    stalled=true
fi

python3 - "$OUT" "$service_state" "$service_healthy" "$state_age_seconds" "$stalled" "$now" <<'PY'
import json, sys
out, service_state, service_healthy, state_age, stalled, now = sys.argv[1:7]
data = {
    "checked_at_unix": int(now),
    "service_state": service_state,
    "service_healthy": service_healthy == "true",
    "state_age_seconds": int(state_age),
    "stalled": stalled == "true",
}
with open(out, "w") as f:
    json.dump(data, f, indent=2)
PY

echo "$(date -u +%FT%TZ) healthcheck: service_state=$service_state state_age_seconds=$state_age_seconds stalled=$stalled" >> /home/ubuntu/monitor/healthcheck.log
