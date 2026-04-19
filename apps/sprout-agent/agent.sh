#!/usr/bin/env bash
# Pure pipe agent: llm -> bash -> llm -> bash ...
#   ./agent.sh "goal sentence"
set -u

system="$(cat "$(dirname "$0")/PROMPT.md")"
history="# GOAL: ${1:-say hello}"

for i in $(seq 1 "${TURNS:-5}"); do
  cmd=$(printf '%s' "$history" | polli gen text --model "${MODEL:-glm}" --no-stream --system "$system" 2>/dev/null)
  [ -z "$cmd" ] && { echo "[empty reply from model — stopping]"; break; }

  printf '\n--- turn %d ---\n$ %s\n' "$i" "$cmd"
  buf=$(bash -c "$cmd" 2>&1)
  printf '%s\n' "$buf"

  history="$history
\$ $cmd
$buf"
done
