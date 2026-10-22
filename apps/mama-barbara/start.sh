#!/bin/bash
# Start or restart Mama in tmux session `mama`, restarting her whenever she
# exits. deploy.ts runs this in her sandbox after each update.
#
#   bash start.sh            # (re)start
#   tmux attach -t mama      # watch her
#
# Needs ~/.mamabarbarabot.env with TELEGRAM_BOT_TOKEN.
set -euo pipefail
cd "$(dirname "$0")"
[ -x "$HOME/.bun/bin/bun" ] || curl -fsSL https://bun.sh/install | bash
tmux kill-session -t mama 2>/dev/null || true
tmux new-session -d -s mama -c "$PWD" \
  "while true; do $HOME/.bun/bin/bun --env-file $HOME/.mamabarbarabot.env mama.ts; sleep 5; done"
for _ in $(seq 30); do
  if tmux capture-pane -p -t mama | grep -q "Mama Barbara is listening"; then
    echo "Mama is running (tmux attach -t mama)"
    exit 0
  fi
  sleep 1
done
tmux capture-pane -p -t mama >&2
exit 1
