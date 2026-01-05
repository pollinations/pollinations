#!/bin/bash

SUBREDDIT="pollinations_ai"
APP_NAME="polli-ai"

echo "🚀 Starting Pollinations deployment pipeline..."
echo "📝 Step 1: Generating image prompt and updating link.ts..."
npx tsx src/pipeline.ts
PIPELINE_EXIT_CODE=$?

if [ $PIPELINE_EXIT_CODE -eq 0 ]; then
  echo "✓ Pipeline completed successfully"
  if ! [ -f src/link.ts ] || [ -z "$(grep -o 'const LINK' src/link.ts)" ]; then
    echo "ℹ️  No merged PRs found. Exiting with success."
    exit 0
  fi
else
  echo "❌ Pipeline failed"
  exit 1
fi

echo "✓ Pipeline completed, waiting 5 seconds for link.ts to update..."
sleep 5

echo "📤 Step 2: Starting playtest mode..."
npx devvit playtest "$SUBREDDIT" &
PLAYTEST_PID=$!

sleep 3

echo "📝 Step 3: Triggering update (modify main.ts)..."
echo "" >> src/main.ts

echo "📊 Step 4: Watching for successful image post..."
echo ""

timeout=120
elapsed=0
interval=2

while [ $elapsed -lt $timeout ]; do
  if npx devvit logs "$SUBREDDIT" 2>&1 | grep -q "being created asynchronously"; then
    echo ""
    echo "✅ Image post triggered successfully!"
    echo "Exiting safely..."
    kill $PLAYTEST_PID 2>/dev/null
    wait $PLAYTEST_PID 2>/dev/null
    exit 0
  fi
  
  sleep $interval
  elapsed=$((elapsed + interval))
done

echo "❌ Timeout waiting for image post"
kill $PLAYTEST_PID 2>/dev/null
exit 1