#!/usr/bin/env bash
# Revives the community-monitor screen+claude session if it's gone, and
# fully re-arms it (bypass-permissions confirmation + /loop) so a restart
# needs no human. Run from cron every 5 minutes.
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
#
# Auto-arming /loop: previously this script deliberately did NOT re-inject
# /loop after a restart, logging a note for a human to SSH in and retype it
# -- meaning any crash/reboot silently took the whole monitor offline until
# someone noticed the gap and manually re-armed it. That's the same class of
# problem as the permission dialog: a step that only a human at the terminal
# can complete, on a box where nobody's watching the terminal. Fixed the same
# way -- poll the session buffer after launch (via `screen -X hardcopy`, same
# technique nudge.sh already uses) and drive it to a ready idle prompt before
# typing /loop.
#
# The bypass-permissions confirmation dialog is NOT guaranteed on every
# launch -- confirmed live (2026-07-13): it appeared on the first-ever launch
# with the new flag, but a second restart minutes later skipped it entirely
# and went straight to an idle prompt (the "I accept" choice appears to
# persist per-project/user, not per-session). An earlier version of this
# script hard-required seeing the dialog and treated its absence as a
# failure, which produced a false-negative WARNING on a perfectly healthy
# restart. Fixed by polling for EITHER condition each iteration: if the
# dialog is up, approve it and keep polling (don't assume ready immediately
# after); if no dialog and the prompt already looks idle/ready, proceed
# straight to /loop.
set -u
LOG=/home/ubuntu/monitor/watchdog.log
DUMP=/tmp/community-monitor-watchdog-dump.txt

if screen -list 2>/dev/null | grep -q '\.community-monitor\b'; then
    exit 0
fi

echo "$(date -u +%FT%TZ) session missing, restarting" >> "$LOG"
cd /home/ubuntu/monitor
screen -dmS community-monitor bash -lc 'cd /home/ubuntu/monitor && set -a && source .env && set +a && exec claude --remote-control community-monitor --model claude-opus-4-8 --effort medium --append-system-prompt "$(cat CYCLE.md)" --dangerously-skip-permissions'

ready=false
for _ in $(seq 1 20); do
    sleep 2
    screen -S community-monitor -X hardcopy "$DUMP" 2>/dev/null
    if grep -q "Bypass Permissions mode" "$DUMP" 2>/dev/null; then
        screen -S community-monitor -X stuff "2"
        sleep 0.5
        screen -S community-monitor -X stuff $'\r'
        sleep 1
        continue
    fi
    if grep -qE "for shortcuts|for agents" "$DUMP" 2>/dev/null && ! grep -qiE "esc to interrupt" "$DUMP" 2>/dev/null; then
        ready=true
        break
    fi
done
if [ "$ready" = false ]; then
    echo "$(date -u +%FT%TZ) WARNING: session never reached an idle, ready prompt within 40s -- /loop not armed, needs manual check" >> "$LOG"
    exit 1
fi

screen -S community-monitor -X stuff '/loop 15m continue with the cycle duties per CYCLE.md'
sleep 0.5
screen -S community-monitor -X stuff $'\r'
sleep 3

# Re-check /loop actually got submitted. Cannot just grep the dump for the
# literal text -- once submitted it stays visible in scrollback forever (the
# TUI echoes back what you typed), so a plain grep can never tell "still
# stuck in the live prompt box" apart from "already submitted, now just
# visible in history above" -- confirmed live (2026-07-13), this exact bug
# produced a false-positive WARNING on a run that had actually succeeded (the
# agent was already reading CYCLE.md and responding). Use the same
# last-matching-prompt-box-line technique nudge.sh already validated:
# `screen -X hardcopy` renders the live prompt box's leading corner glyph as
# a stray "o" byte, and only the LAST such line (bottom of buffer) reflects
# current state -- earlier occurrences are historical.
screen -S community-monitor -X hardcopy "$DUMP" 2>/dev/null
still_stuck=$(python3 - "$DUMP" <<'PY'
import sys
with open(sys.argv[1], encoding="utf-8", errors="replace") as f:
    lines = [l.rstrip("\n") for l in f]
stuck = None
for l in lines:
    if l.startswith("o"):
        rest = l[1:].lstrip("�﻿ \t")
        stuck = rest.strip() or None
print(stuck or "")
PY
)
if [ -n "$still_stuck" ]; then
    echo "$(date -u +%FT%TZ) WARNING: /loop command still sitting unsubmitted after restart (prompt box: ${still_stuck:0:80}) -- needs manual check" >> "$LOG"
    exit 1
fi

echo "$(date -u +%FT%TZ) restarted and /loop re-armed automatically" >> "$LOG"
