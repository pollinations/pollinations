#!/bin/bash

if [ $# -ne 2 ]; then
  echo "Usage: $0 <image_link> <title>"
  echo "Example: $0 'https://example.com/image.jpg' 'My Post Title'"
  exit 1
fi

IMAGE_LINK="$1"
TITLE="$2"

cd /root/reddit_post_automation || exit 1

NPX="/usr/bin/npx"
NODE="/usr/bin/node"

cleanup() {
  local exit_code=$?
  echo ""
  echo "🧹 Cleaning up processes..."
  rm -f /root/reddit_post_automation/src/postConfig.json
  
  if [ ! -z "$PLAYTEST_PID" ] && kill -0 $PLAYTEST_PID 2>/dev/null; then
    kill -9 $PLAYTEST_PID 2>/dev/null
    wait $PLAYTEST_PID 2>/dev/null
  fi
  
  pkill -9 -f "devvit playtest" 2>/dev/null || true
  lsof -ti:5678 2>/dev/null | xargs kill -9 2>/dev/null || true
  sleep 1
  
  echo "📤 Committing and pushing changes to GitHub..."
  git add . 2>/dev/null || true
  git commit -m "Deploy post to Reddit with image and title" 2>/dev/null || true
  git push origin main 2>/dev/null || true
  
  echo "✓ Cleanup complete"
  exit $exit_code
}

trap cleanup EXIT INT TERM

SUBREDDIT="pollinations_ai"

echo "🚀 Starting direct deployment to Reddit..."
echo "📤 Image Link: $IMAGE_LINK"
echo "📝 Title: $TITLE"

echo ""
echo "📦 Updating Devvit CLI..."
npm install -g devvit@latest 2>&1 | tail -n 3

echo ""
echo "🔐 Verifying Devvit authentication..."
$NPX devvit whoami
if [ $? -ne 0 ]; then
  echo "❌ Devvit authentication check failed"
  exit 1
fi

echo ""
echo "📤 Updating the devvit app on reddit..."
$NPX devvit upload
UPDATE_EXIT_CODE=$?

if [ $UPDATE_EXIT_CODE -ne 0 ]; then
  echo "❌ Devvit update failed"
  exit 1
fi

echo "✓ Devvit app updated successfully"
echo ""

echo "⏳ Waiting 10 seconds before proceeding..."
sleep 10
echo ""

cat > /root/reddit_post_automation/src/link.ts << 'EOF'
const LINK = "$IMAGE_LINK";
const TITLE = "$TITLE";
export {LINK, TITLE};
EOF

pkill -f "devvit playtest" 2>/dev/null || true
pkill -f "node.*devvit" 2>/dev/null || true
sleep 5

PLAYTEST_LOG="/tmp/playtest.log"
rm -f "$PLAYTEST_LOG"

echo "📤 Step 2: Starting playtest mode..."
$NPX devvit playtest "$SUBREDDIT" > "$PLAYTEST_LOG" 2>&1 &
PLAYTEST_PID=$!

echo "⏳ Waiting for playtest to fully initialize..."
for i in {1..15}; do
  if grep -q "✓ Playtest ready" "$PLAYTEST_LOG" 2>/dev/null; then
    echo "✓ Playtest fully initialized"
    break
  fi
  sleep 1
done

tail -n 10 "$PLAYTEST_LOG"
echo ""

echo "⏳ Waiting additional 5 seconds before triggering update..."
sleep 5

echo "📝 Step 3: Triggering update (modify main.ts)..."
echo "" >> /root/reddit_post_automation/src/main.ts

echo ""
echo "📊 Step 4: Waiting for image post (monitoring logs)..."
sleep 2
tail -n 15 "$PLAYTEST_LOG"
echo ""

echo "⏱️  Keeping process alive for 30s"
sleep 30

echo ""
echo "📋 Final playtest logs:"
tail -n 20 "$PLAYTEST_LOG"
echo ""
echo "✅ Deployment complete. Shutting down..."
exit 0
