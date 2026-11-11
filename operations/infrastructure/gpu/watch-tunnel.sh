#!/bin/bash
# Restart a live connector that stays disconnected; its screen loop relaunches it.
metrics_address="${1:?metrics address required}"
log_file="${2:?log file required}"
min_connections="${3:-1}"
connector_pattern="^([^ ]*/)?cloudflared tunnel .*--metrics ${metrics_address//./[.]} .*run( |$)"
low_checks=0

while true; do
    sleep 10
    connections=$(curl -fsS --max-time 2 "http://$metrics_address/metrics" 2>/dev/null |
        awk '$1 == "cloudflared_tunnel_ha_connections" { print int($2); exit }')
    if [ "${connections:-0}" -lt "$min_connections" ]; then
        low_checks=$((low_checks + 1))
    else
        low_checks=0
    fi
    if [ "$low_checks" -ge 3 ]; then
        if pkill -TERM -f "$connector_pattern"; then
            echo "$(date -u +%FT%TZ) Restarting cloudflared: fewer than $min_connections HA connections for 30 seconds" >> "$log_file"
        fi
        low_checks=0
        sleep 10
    fi
done
