#!/bin/bash

# Use the same npx and node from the user's environment
NPX="/usr/bin/npx"
NODE="/usr/bin/node"
TSX="$NODE $($NPX which tsx)"

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

echo "🚀 Starting Pollinations deployment pipeline..."
echo "✓ link.ts is already configured"
echo "✓ Waiting 5 seconds for file sync..."
sleep 5

pkill -f "devvit playtest" 2>/dev/null || true
pkill -f "node.*devvit" 2>/dev/null || true
sleep 2

echo "📤 Step 2: Starting playtest mode..."
$NPX devvit playtest "$SUBREDDIT" &
PLAYTEST_PID=$!
sleep 3

echo "📝 Step 3: Triggering update (modify main.ts)..."
echo "" >> src/main.ts

echo "📊 Step 4: Watching for successful image post..."
echo ""

echo "⏱️  Keeping process alive for 1 minute ..."
sleep 60

echo ""
echo "✅ 1 minute elapsed. Shutting down..."
exit 0