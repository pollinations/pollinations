#!/usr/bin/env bash
# Unconditionally submits whatever is sitting in the community-monitor
# screen session's prompt box. Run from cron every 15 minutes -- same
# cadence as the monitor's own cycle, so a stall costs at most one missed
# cycle -- alongside watchdog.sh (every 5 min, handles the session dying
# outright; this handles it staying alive but stuck).
#
# Why blind, not detect-then-nudge: the recurring failure is the agent's own
# periodic /compact (CYCLE.md duty 0) leaving a follow-up "continue the
# cycle" prompt typed but never submitted, silently stalling the agent for
# hours. An earlier version of this script tried to detect that specific
# state by parsing `screen -X hardcopy` output (busy indicators, prompt-box
# glyph matching). That detection logic had a real bug -- it matched a stale
# historical /loop command sitting in scrollback instead of the live prompt
# -- which caused it to "handle" a session that was actually just idle with
# no /loop armed at all, masking a 36+ hour monitor outage instead of
# surfacing it (see git history for the incident this replaced).
#
# A bare carriage return is a no-op on a truly empty prompt and submits
# whatever text is sitting there otherwise. That makes detection unnecessary:
# there is no parsing logic left to have a bug in.
set -u

if ! screen -list 2>/dev/null | grep -q '\.community-monitor\b'; then
    exit 0
fi

screen -S community-monitor -X stuff $'\r'
