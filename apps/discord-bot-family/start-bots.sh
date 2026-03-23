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
  REQUIRES_AUTH=$(node -e "console.log(require('./$CONFIG').bots[$i].requiresAuth ? 'true' : '')")
  FREE_MODEL=$(node -e "console.log(require('./$CONFIG').bots[$i].freeModel || '')")
  PAID_MODEL=$(node -e "console.log(require('./$CONFIG').bots[$i].paidModel || '')")
  TOKEN_VAR="BOT_TOKEN_$(echo "$MODEL" | tr '[:lower:]-' '[:upper:]_')"
  TOKEN="${!TOKEN_VAR}"

  SKIP=$(node -e "console.log(require('./$CONFIG').bots[$i].skip ? 'true' : '')")
  if [ -n "$SKIP" ]; then
    echo "⏭️  Skipping bot $((i + 1)) ($MODEL) — marked as skip"
    continue
  fi

  if [ -z "$TOKEN" ]; then
    echo "⚠️  No token for $MODEL (expected $TOKEN_VAR), skipping"
    continue
  fi

  AUTH_FLAG=""
  if [ -n "$REQUIRES_AUTH" ]; then
    AUTH_FLAG="--requires-auth"
  fi
  MODEL_FLAGS=""
  if [ -n "$FREE_MODEL" ]; then
    MODEL_FLAGS="$MODEL_FLAGS --free-model $FREE_MODEL"
  fi
  if [ -n "$PAID_MODEL" ]; then
    MODEL_FLAGS="$MODEL_FLAGS --paid-model $PAID_MODEL"
  fi

  echo "Starting $MODEL..."
  DEBUG=app:* npx ts-node src-functional/cli.ts "$MODEL" "$TOKEN" --channels "$BOT_CHANNELS" --global-channels "$GLOBAL_CHANNELS" $AUTH_FLAG $MODEL_FLAGS \
    2>&1 | tee "logs/$MODEL.log" &
  sleep 2
done

echo "✅ All bots started! Logs in logs/"
echo "Press Ctrl+C to stop"
wait
