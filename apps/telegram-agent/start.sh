#!/bin/bash
# Start or restart the agent: Claude Code with the settings from
# `polli harness claude-code on`, in tmux session `agent`, with the Telegram
# bridge pasting each message into it.
#
#   bash start.sh            # (re)start
#   tmux attach -t agent     # watch it
#
# Needs .env in this folder:
#   TELEGRAM_BOT_TOKEN   from @BotFather
#   OWNER_IDS            Telegram user ids allowed to write to the bot, comma-separated
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$PWD
set -a; . ./.env; set +a
TG=$HOME/.claude/channels/telegram
mkdir -p "$ROOT/state" "$TG"
chmod 700 "$TG"
umask 077
printf 'TELEGRAM_BOT_TOKEN=%s\n' "$TELEGRAM_BOT_TOKEN" > "$TG/.env"
umask 022

python3 - "$ROOT" "$TG" "$OWNER_IDS" <<'EOF'
import json, os, sys
root, tg, owners = sys.argv[1:]
home = os.path.expanduser("~")

# Only the owners may write; anyone else is dropped silently.
access = os.path.join(tg, "access.json")
if not os.path.exists(access):
    ids = owners.replace(",", " ").split()
    json.dump({"dmPolicy": "allowlist", "allowFrom": ids, "groups": {}, "pending": {}},
              open(access, "w"), indent=1)

# Pollinations model ids aren't in Claude Code's catalog, so it assumes a 200k
# window. Tell it the real one (1M) and compact at 300k (it compacts 33k below
# the window it is given).
env = json.load(open(os.path.join(home, ".pollinations", "claude-code.json")))["env"]
env.update(CLAUDE_CODE_MAX_CONTEXT_TOKENS="1000000",
           CLAUDE_CODE_AUTO_COMPACT_WINDOW="333000")
settings = os.path.join(root, "state", "claude-settings.json")
json.dump({"env": env}, open(settings, "w"), indent=1)
os.chmod(settings, 0o600)

json.dump({"mcpServers": {"telegram": {
    "command": os.path.join(home, ".bun", "bin", "bun"),
    "args": [os.path.join(root, "telegram", "server.ts")],
    "env": {"TELEGRAM_STATE_DIR": tg, "BARBARA_INJECT": "tmux",
            "BARBARA_TMUX_TARGET": "agent:claude", "BARBARA_OWNER_IDS": owners}}}},
    open(os.path.join(root, "state", "mcp.json"), "w"), indent=1)

# No first-run dialogs: each one would swallow a pasted message.
p = os.path.join(home, ".claude.json")
d = json.load(open(p)) if os.path.exists(p) else {}
d["hasCompletedOnboarding"] = True
d.setdefault("projects", {}).setdefault(root, {})["hasTrustDialogAccepted"] = True
json.dump(d, open(p, "w"), indent=1)
u = os.path.join(home, ".claude", "settings.json")
os.makedirs(os.path.dirname(u), exist_ok=True)
s = json.load(open(u)) if os.path.exists(u) else {}
s["skipDangerousModePermissionPrompt"] = True
json.dump(s, open(u, "w"), indent=1)
EOF

# A restart mid-turn loses the reply, so wait for the turn to end.
if tmux has-session -t agent 2>/dev/null; then
  for _ in $(seq 60); do
    tmux capture-pane -p -t agent:claude | grep -q "esc to interrupt" || break
    echo "agent is busy, waiting for the turn to end"; sleep 5
  done
  tmux kill-session -t agent
fi
pkill -f "$ROOT/telegram/server.ts" || true
tmux new-session -d -s agent -n claude -x 200 -y 50 "bash $ROOT/loop.sh"

# Ready once the bridge runs and Claude Code takes input: it shows its
# permission mode under the prompt.
for _ in $(seq 60); do
  if pgrep -f "$ROOT/telegram/server.ts" >/dev/null &&
    tmux capture-pane -p -t agent:claude | grep -q "bypass permissions on"; then
    echo "agent is running (tmux attach -t agent)"; exit 0
  fi
  sleep 2
done
echo "agent did not start; tmux attach -t agent" >&2
exit 1
