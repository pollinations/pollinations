#!/usr/bin/env bash
# Detects the community-monitor screen session sitting idle with unsubmitted
# input (the recurring post-/compact stall: the follow-up prompt gets typed
# but never receives its carriage return) and resumes it. Run from cron every
# 15 minutes -- same cadence as the monitor's own cycle, so a stall costs at
# most one missed cycle -- alongside watchdog.sh (every 5 min, handles the
# session dying outright; this handles it staying alive but stuck).
#
# Why retype-then-enter, not a bare \r: a bare `screen -X stuff $'\r'` does
# NOT reliably register as "submit" in Claude Code's TUI right after a
# /compact -- confirmed live (2026-07-12): the box sat stuck on "continue
# with the cycle duties now" through multiple real cron-fired bare-\r
# attempts, and was only unstuck by retyping the exact text and THEN sending
# \r. This matches how the *other* proven injection path in this codebase
# works too -- self-compact's auto-continue.sh uses `it2 send-text <text>`
# followed by a separate `send-key enter`, never a bare Enter alone. Content
# must accompany the Enter for the TUI to treat it as a real submit rather
# than a no-op keypress.
#
# Why detect at all (not just always retype+enter): with nothing stuck,
# there's no text to retype -- the earlier bare-\r version relied on \r being
# a safe no-op when idle, which doesn't hold if \r has to be paired with a
# retype. So detection is back, now correctly anchored to only the LAST
# matching prompt-box line (bottom of the buffer) rather than the first, since
# `hardcopy` includes scrollback and older slash-commands in the same session
# echo with the same leading glyph -- an earlier version of this detector
# matched the first such line and mistook stale scrollback for a live stuck
# prompt, "resubmitting" a dead command for 36+ hours while the session was
# actually idle with no /loop armed at all.
#
# A THIRD stuck state, separate from both of the above: an open tool-permission
# dialog ("Do you want to proceed? 1. Yes ..."). CYCLE.md now tells the agent to
# never wait on one of these, but that instruction only helps once the agent
# reads it -- a dialog raised before that (e.g. mid-cycle, before the file is
# re-read) still stalls the loop for real. Confirmed live (2026-07-13): the
# monitor sat on a `discord_get_server_info` approval prompt for over an hour,
# and this script's retype-text path never fired because a permission dialog
# doesn't match the "stuck prompt-box text" shape at all (no leading "o" glyph
# line) -- it needs its own detection and its own remedy (send "1" then Enter
# to pick "Yes", not retype text into an already-closed input box).
set -u
LOG=/home/ubuntu/monitor/nudge.log
DUMP=/tmp/community-monitor-nudge-dump.txt

if ! screen -list 2>/dev/null | grep -q '\.community-monitor\b'; then
    exit 0
fi

screen -S community-monitor -X hardcopy "$DUMP" 2>/dev/null
sleep 0.5

if grep -q "Do you want to proceed?" "$DUMP" 2>/dev/null; then
    echo "$(date -u +%FT%TZ) detected stuck permission dialog, approving (option 1)" >> "$LOG"
    screen -S community-monitor -X stuff "1"
    sleep 0.5
    screen -S community-monitor -X stuff $'\r'
    sleep 2
    screen -S community-monitor -X hardcopy "$DUMP" 2>/dev/null
    sleep 0.5
    if grep -q "Do you want to proceed?" "$DUMP" 2>/dev/null; then
        echo "$(date -u +%FT%TZ) WARNING: permission dialog still present after approving -- may need manual intervention" >> "$LOG"
    fi
    exit 0
fi

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
# Take the LAST such line, not the first -- hardcopy dumps the whole
# scrollback, and earlier slash-commands typed in the session echo with the
# same leading glyph higher up in the buffer. Match on `l.startswith("o")`
# alone (not `len(l) > 1`) -- a bare "o" line MUST still count as a match so
# it can overwrite `stuck` back to None; excluding it let an earlier stale
# match from higher in the scrollback survive even when the real, bottom
# prompt was genuinely idle (found via direct trace, 2026-07-12).
found_bare_prompt = False
stuck = None
for l in lines:
    if l.startswith("o"):
        rest = l[1:].lstrip("�﻿ \t")
        stuck = rest.strip() or None
        found_bare_prompt = True
if found_bare_prompt and stuck:
    print(stuck)
    sys.exit(0)
sys.exit(1)
PY
)

if [ -z "$STUCK_LINE" ]; then
    exit 0
fi

echo "$(date -u +%FT%TZ) detected idle+stuck input, retyping+submitting: ${STUCK_LINE:0:100}" >> "$LOG"

# Retype the exact stuck text, then Enter as a SEPARATE stuff call with a
# brief pause between -- mirrors the it2 send-text + send-key enter pattern
# that's the only mechanism proven to reliably submit in this TUI.
screen -S community-monitor -X stuff "$STUCK_LINE"
sleep 0.5
screen -S community-monitor -X stuff $'\r'
sleep 2

# Re-check: if the same line is still sitting there after retype+enter, log
# it clearly rather than silently retrying forever -- something deeper is
# wrong (e.g. text containing characters that don't round-trip through
# `stuff` cleanly) and a human should look.
screen -S community-monitor -X hardcopy "$DUMP" 2>/dev/null
sleep 0.5
if grep -qF "${STUCK_LINE:0:60}" "$DUMP" 2>/dev/null; then
    echo "$(date -u +%FT%TZ) WARNING: stuck line still present after retype+enter -- may need manual intervention: ${STUCK_LINE:0:100}" >> "$LOG"
fi
