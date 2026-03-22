#!/bin/bash
source .env
mkdir -p logs

CONFIG=bots.json
GLOBAL_CHANNELS=$(node -e "console.log(require('./$CONFIG').channels.join(','))")
BOT_COUNT=$(node -e "console.log(require('./$CONFIG').bots.length)")

echo "🚀 Starting $BOT_COUNT bots..."

for i in $(seq 0 $((BOT_COUNT - 1))); do
  MODEL=$(node -e "console.log(require('./$CONFIG').bots[$i].model)")
  BOT_CHANNELS=$(node -e "
    const c = require('./$CONFIG');
    const extra = c.bots[$i].channels || [];
    console.log([...c.channels, ...extra].join(','));
  ")
  TOKEN_VAR="BOT_TOKEN_$((i + 1))"
  TOKEN="${!TOKEN_VAR}"

  if [ -z "$TOKEN" ]; then
    echo "⚠️  No token for bot $((i + 1)) ($MODEL), skipping"
    continue
  fi

  echo "Starting $MODEL..."
  DEBUG=app:* npx ts-node src-functional/cli.ts "$MODEL" "$TOKEN" --channels "$BOT_CHANNELS" \
    2>&1 | tee "logs/$MODEL.log" &
  sleep 2
done

echo "✅ All bots started! Logs in logs/"
echo "Press Ctrl+C to stop"
wait
