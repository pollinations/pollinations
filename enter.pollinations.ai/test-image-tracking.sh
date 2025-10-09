#!/bin/bash

# Manual test script for PR #4282 - Image Model Cost Tracking
# This script tests that the enter service correctly reads tracking headers from image service

set -e

echo "🧪 Testing Image Model Cost Tracking (PR #4282)"
echo "================================================"
echo ""

# Test 1: Nanobanana model (should have ~1290 tokens)
echo "Test 1: Nanobanana model (high token count)"
echo "-------------------------------------------"
curl -s "https://enter.pollinations.ai/image/prompt/a%20cute%20cat?model=nanobanana" \
  -H "Accept: application/json" \
  -D - \
  | grep -E "(x-completion-image-tokens|x-model-used|x-user-tier)" || echo "Headers not found"
echo ""

# Test 2: Flux model (should have 1 token)
echo "Test 2: Flux model (default, 1 token)"
echo "--------------------------------------"
curl -s "https://enter.pollinations.ai/image/prompt/a%20cute%20dog?model=flux" \
  -H "Accept: application/json" \
  -D - \
  | grep -E "(x-completion-image-tokens|x-model-used|x-user-tier)" || echo "Headers not found"
echo ""

# Test 3: Seedream model (should have 1 token)
echo "Test 3: Seedream model (1 token)"
echo "---------------------------------"
curl -s "https://enter.pollinations.ai/image/prompt/a%20robot?model=seedream" \
  -H "Accept: application/json" \
  -D - \
  | grep -E "(x-completion-image-tokens|x-model-used|x-user-tier)" || echo "Headers not found"
echo ""

echo "✅ Manual test complete!"
echo ""
echo "Expected results:"
echo "- Nanobanana: x-completion-image-tokens: ~1290"
echo "- Flux: x-completion-image-tokens: 1"
echo "- Seedream: x-completion-image-tokens: 1"
echo "- All: x-model-used should match requested model"
echo "- All: x-user-tier should show user's tier (or anonymous)"
