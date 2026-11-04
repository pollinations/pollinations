#!/bin/bash
# Runs in tmux window agent:claude. Keeps one Claude Code session alive with a
# fixed session id, so a crash or restart resumes the same conversation.
cd "$(dirname "$0")"
ROOT=$PWD
SID_FILE=state/session-id
[ -s "$SID_FILE" ] || python3 -c 'import uuid; print(uuid.uuid4())' > "$SID_FILE"
SID=$(cat "$SID_FILE")
TRANSCRIPT="$HOME/.claude/projects/$(echo "$ROOT" | sed 's#[/.]#-#g')/$SID.jsonl"
while true; do
  if [ -s "$TRANSCRIPT" ]; then FLAG=(--resume "$SID"); else FLAG=(--session-id "$SID"); fi
  claude --settings state/claude-settings.json --mcp-config state/mcp.json \
    --dangerously-skip-permissions \
    --disallowedTools AskUserQuestion EnterPlanMode ExitPlanMode \
    "${FLAG[@]}"
  echo "$(date) claude exited, restarting in 5 s" >> state/loop.log
  sleep 5
done
