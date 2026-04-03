#!/bin/bash
# Start all discord bots from bots.json
# Used by launchd to auto-start on boot

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Load env
set -a
source .env
set +a

export DEBUG=app:*
export PATH="/Users/thomash/.nvm/versions/node/v23.0.0/bin:$PATH"

# Global channels from bots.json
GLOBAL_CHANNELS="1370368057641533440,1123617013433110578"

# Bot definitions: model:token_env:convo_channels
BOTS=(
  "kimi:BOT_TOKEN_KIMI:1485374528564760858"
  "gemini-search:BOT_TOKEN_GEMINI_SEARCH:1485374325077971135"
  "perplexity-fast:BOT_TOKEN_PERPLEXITY_FAST:1485374426659684495"
  "deepseek:BOT_TOKEN_DEEPSEEK:1485374269973204992"
  "minimax:BOT_TOKEN_MINIMAX:1485376399211499643"
)

for bot_def in "${BOTS[@]}"; do
  IFS=: read -r model token_var channels <<< "$bot_def"
  token="${!token_var}"
  if [ -z "$token" ]; then
    echo "SKIP $model: no token ($token_var)"
    continue
  fi
  echo "Starting $model..."
  (while true; do
    tsx src-functional/cli.ts "$model" "$token" \
      --channels "$channels" \
      --global-channels "$GLOBAL_CHANNELS" \
      >> "/tmp/discord-bot-$model.log" 2>&1
    echo "[$(date)] $model crashed, restarting in 5s..." >> "/tmp/discord-bot-$model.log"
    sleep 5
  done) &
  echo "  PID $! → /tmp/discord-bot-$model.log"
done

# CatGPT bot (auto-restart on crash)
if [ -n "$BOT_TOKEN_CATGPT" ]; then
  echo "Starting catgpt..."
  (while true; do
    cd "$DIR/../catgpt-bot"
    tsx bot.ts >> /tmp/discord-bot-catgpt.log 2>&1
    echo "[$(date)] catgpt crashed, restarting in 5s..." >> /tmp/discord-bot-catgpt.log
    sleep 5
  done) &
  echo "  PID $! → /tmp/discord-bot-catgpt.log"
fi

# Opposite prompt bot (auto-restart on crash)
if [ -n "$BOT_TOKEN_OPPOSITE_PROMPT" ]; then
  echo "Starting opposite-prompt..."
  (while true; do
    cd "$DIR/../opposite-prompt-bot"
    tsx bot.ts >> /tmp/discord-bot-opposite-prompt.log 2>&1
    echo "[$(date)] opposite-prompt crashed, restarting in 5s..." >> /tmp/discord-bot-opposite-prompt.log
    sleep 5
  done) &
  echo "  PID $! → /tmp/discord-bot-opposite-prompt.log"
fi

echo "All bots launched. Waiting..."
wait
