#!/bin/bash

if [ $# -ne 2 ]; then
  echo "Usage: $0 <image_link> <title>"
  echo "Example: $0 'https://example.com/image.jpg' 'My Post Title'"
  exit 1
fi

IMAGE_LINK="$1"
TITLE="$2"

NPX="/usr/bin/npx"
NODE="/usr/bin/node"
TSX="$NODE $($NPX which tsx)"

cleanup() {
  local exit_code=$?
  echo ""
  echo "🧹 Cleaning up processes..."
  
  rm -f src/postConfig.json
  
  echo "📤 Committing and pushing changes to GitHub..."
  git add .
  git commit -m "Deploy post to Reddit with image and title" 2>/dev/null || true
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

echo "🚀 Starting direct deployment to Reddit..."
echo "📤 Image Link: $IMAGE_LINK"
echo "📝 Title: $TITLE"

cat > src/postConfig.json << EOF
{
  "imageLink": "$IMAGE_LINK",
  "title": "$TITLE"
}
EOF

pkill -f "devvit playtest" 2>/dev/null || true
pkill -f "node.*devvit" 2>/dev/null || true
sleep 2

echo "📤 Step 1: Starting playtest mode..."
$NPX devvit playtest "$SUBREDDIT" &
PLAYTEST_PID=$!
sleep 3

echo "📝 Step 2: Triggering update (modify main.ts)..."
echo "" >> src/main.ts

echo "📊 Step 3: Posting image to Reddit..."
echo ""

echo "⏱️  Keeping process alive for 2 minutes..."
sleep 120

echo ""
echo "✅ 2 minutes elapsed. Shutting down..."
exit 0
