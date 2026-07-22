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
# A permission dialog ("Do you want to proceed? 1. Yes ...") used to be a
# THIRD stuck state this script had to detect+recover separately (it doesn't
# match the "stuck prompt-box text" shape at all, so the retype-text path
# below never caught it -- confirmed live 2026-07-13, a `discord_get_server_info`
# approval prompt stalled the monitor over an hour). That's now handled at
# the source instead: watchdog.sh launches the session with
# `--dangerously-skip-permissions`, so approval dialogs never appear in the
# first place. Verified live (2026-07-13) across a full real cycle -- bash,
# curl, and Discord MCP tool calls all ran with zero prompts.
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
    # No stuck TEXT in the prompt box -- but an empty, non-busy prompt can
    # ALSO be a stall: confirmed live (2026-07-14) that the /compact the
    # loop runs every 20 cycles sometimes leaves the prompt box completely
    # empty afterward (not holding "continue the cycle" like the text-stuck
    # case above), with no self-recovery -- sat idle 20+ minutes twice in one
    # session until manually typing the continuation text from scratch. The
    # text-retype path above can't catch this since there's nothing to
    # retype. Guard against treating normal between-cycle gaps as stuck by
    # requiring state.json to also be stale past the cycle cadence --
    # healthcheck.sh uses 1800s for the same "genuinely stalled" judgment.
    STATE=/home/ubuntu/monitor/state.json
    if [ -f "$STATE" ]; then
        state_age=$(( $(date -u +%s) - $(stat -c '%Y' "$STATE" 2>/dev/null || echo 0) ))
        if [ "$state_age" -gt 1200 ]; then
            echo "$(date -u +%FT%TZ) detected idle empty prompt with stale state.json (${state_age}s) -- typing continuation" >> "$LOG"
            screen -S community-monitor -X stuff 'continue the cycle'
            sleep 0.5
            screen -S community-monitor -X stuff $'\r'
        fi
    fi
    exit 0
fi

echo "$(date -u +%FT%TZ) detected idle+stuck input, retyping+submitting: ${STUCK_LINE:0:100}" >> "$LOG"

# Re-check helper: is the LIVE prompt box (last "o"-prefixed line in the
# dump, not just anywhere in scrollback) still showing stuck text? A plain
# `grep -qF` against the whole dump is WRONG here -- once text is typed it's
# echoed into scrollback whether or not Enter actually submitted it, so a
# whole-buffer substring search matches on success just as often as on
# failure and can never tell the two apart. This is the exact same bug
# watchdog.sh had and fixed (2026-07-13) via the last-matching-line
# technique -- confirmed live there that a whole-buffer grep produces a
# false-positive "still stuck" on a run that actually succeeded. Applying
# the identical fix here: only the last "o"-line reflects current state.
still_stuck() {
    screen -S community-monitor -X hardcopy "$DUMP" 2>/dev/null
    sleep 0.5
    python3 - "$DUMP" <<'PY'
import sys
with open(sys.argv[1], encoding="utf-8", errors="replace") as f:
    lines = [l.rstrip("\n") for l in f]
stuck = None
for l in lines:
    if l.startswith("o"):
        rest = l[1:].lstrip("�﻿ \t")
        stuck = rest.strip() or None
sys.exit(0 if stuck else 1)
PY
}

# Retype the exact stuck text, then Enter as a SEPARATE stuff call with a
# brief pause between -- mirrors the it2 send-text + send-key enter pattern
# that's the only mechanism proven to reliably submit in this TUI. Retry up
# to 3 times within this single cron run (not just once) -- a single miss
# left stalls sitting for up to a full 15-minute cron interval before the
# next attempt, confirmed live (2026-07-13/14): the same "continue the
# cycle" stall recurred 6 times across one session, each time needing a
# human-triggered health check to catch it because the next scheduled
# nudge.sh run was itself the thing failing to unstick it.
resolved=false
for attempt in 1 2 3; do
    screen -S community-monitor -X stuff "$STUCK_LINE"
    sleep 0.5
    screen -S community-monitor -X stuff $'\r'
    sleep 2
    if ! still_stuck; then
        resolved=true
        break
    fi
    sleep 3
done

if [ "$resolved" = false ]; then
    echo "$(date -u +%FT%TZ) WARNING: stuck line still present after 3 retype+enter attempts -- may need manual intervention: ${STUCK_LINE:0:100}" >> "$LOG"
fi
