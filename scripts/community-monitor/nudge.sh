#!/usr/bin/env bash
# Detects the community-monitor screen session sitting idle with unsubmitted
# input (the recurring post-/compact stall: the follow-up prompt gets typed
# but never receives its carriage return) and resumes it. Run from cron every
# 5 minutes, alongside watchdog.sh (which handles the session dying outright --
# this handles it staying alive but stuck).
#
# Idle+stuck signature: the screen buffer shows no busy indicator (no
# "esc to interrupt", no elapsed-timer spinner line) AND the input line has
# non-empty typed text sitting after the prompt glyph. A genuinely idle
# session with nothing queued has an EMPTY input line, so this only fires on
# the specific stuck case, not on ordinary idle-waiting-for-next-cycle.
set -u
LOG=/home/ubuntu/monitor/nudge.log
DUMP=/tmp/community-monitor-nudge-dump.txt

if ! screen -list 2>/dev/null | grep -q '\.community-monitor\b'; then
    exit 0
fi

screen -S community-monitor -X hardcopy "$DUMP" 2>/dev/null
sleep 0.5

STUCK_LINE=$(python3 - "$DUMP" <<'PY'
import re, sys
with open(sys.argv[1], encoding="utf-8", errors="replace") as f:
    lines = [l.rstrip("\n") for l in f]
buf = "\n".join(lines)

busy = (
    bool(re.search(r"\(\d+\s*m?\s*\d*s\b[^)]*tokens\)", buf))
    or "esc to interrupt" in buf.lower()
    or "shells still running" in buf.lower()
    or "shell still running" in buf.lower()
)
if busy:
    sys.exit(0)  # actively working (incl. background shells), nothing to do

# The prompt-box line is the one starting with the lone corner-glyph "o"
# (screen's hardcopy renders the box-drawing char as a stray byte, usually
# "o" or "o" + a mangled unicode continuation). An idle prompt with nothing
# queued is JUST that glyph on its own line; a stuck prompt has real text
# immediately after it -- e.g. "o\xef\xbf\xbdcontinue the monitor cycle...".
for l in lines:
    if l.startswith("o") and len(l) > 1:
        rest = l[1:].lstrip("�﻿ \t")
        if rest.strip():
            print(rest.strip())
            sys.exit(0)
sys.exit(1)
PY
)

if [ -z "$STUCK_LINE" ]; then
    exit 0
fi

echo "$(date -u +%FT%TZ) detected idle+stuck input, submitting: ${STUCK_LINE:0:100}" >> "$LOG"
screen -S community-monitor -X stuff $'\r'
sleep 2

# Re-check: if still idle with the SAME stuck text (stuff didn't submit
# anything because it wasn't actually unsent input, e.g. a false-positive
# match on static help text), don't loop forever -- just log and stop.
screen -S community-monitor -X hardcopy "$DUMP" 2>/dev/null
sleep 0.5
if grep -qF "${STUCK_LINE:0:60}" "$DUMP" 2>/dev/null; then
    echo "$(date -u +%FT%TZ) stuck line still present after stuff -- may be a false positive, not retrying" >> "$LOG"
fi
