#!/bin/bash

cleanup() {
  local exit_code=$?
  echo ""
  echo "🧹 Cleaning up processes..."
  
  echo "📤 Committing and pushing changes to GitHub..."
  git add .
  git commit -m "Deploy updated link.ts and main.ts" 2>/dev/null || true
  git push origin main 2>/dev/null || true
  
  if [ ! -z "$PLAYTEST_PID" ] && kill -0 $PLAYTEST_PID 2>/dev/null; then
    kill -TERM $PLAYTEST_PID 2>/dev/null
    sleep 1
    kill -KILL $PLAYTEST_PID 2>/dev/null
  fi
  
  pkill -f "devvit playtest" 2>/dev/null || true
  pkill -f "node.*devvit" 2>/dev/null || true
  pkill -f "^node$" 2>/dev/null || true
  
  lsof -ti:5678 2>/dev/null | xargs kill -9 2>/dev/null || true
  
  zombies=$(ps aux | grep -c " <defunct>")
  if [ $zombies -gt 1 ]; then
    echo "⚠️  Found zombie processes, cleaning up..."
    ps aux | grep " <defunct>" | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true
  fi
  
  sleep 1
  
  echo "✓ Cleanup complete"
  exit $exit_code
}

trap cleanup EXIT INT TERM

SUBREDDIT="pollinations_ai"
timeout=120
elapsed=0
interval=2

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

pkill -f "devvit playtest" 2>/dev/null || true
pkill -f "node.*devvit" 2>/dev/null || true
sleep 2

echo "📤 Step 2: Starting playtest mode..."
npx devvit playtest "$SUBREDDIT" &
PLAYTEST_PID=$!
sleep 3

echo "📝 Step 3: Triggering update (modify main.ts)..."
echo "" >> src/main.ts

echo "📊 Step 4: Watching for successful image post..."
echo ""

echo "⏱️  Keeping process alive for 2 minutes..."
sleep 120

echo ""
echo "✅ 2 minutes elapsed. Shutting down..."
exit 0
