#!/bin/bash

echo "🧪 Testing Unified Usage Headers (Issue #4638)"
echo "================================================"
echo ""

# Test 1: Image Service
echo "📸 Test 1: Image Service Headers"
echo "curl -I https://image.pollinations.ai/prompt/test?model=flux"
curl -I "https://image.pollinations.ai/prompt/test?model=flux" 2>&1 | grep -E "x-model-used|x-usage-"
echo ""

# Test 2: Text Service (Non-streaming)
echo "📝 Test 2: Text Service Headers (Non-streaming)"
echo "curl -i -X POST http://localhost:16385/v1/chat/completions"
curl -i -X POST "http://localhost:16385/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai","messages":[{"role":"user","content":"Hi"}]}' 2>&1 | grep -E "x-model-used|x-usage-"
echo ""

# Test 3: Text Service (Streaming with trailers)
echo "🌊 Test 3: Text Service Trailers (Streaming)"
echo "curl --raw -X POST http://localhost:16385/v1/chat/completions (with stream:true)"
curl --raw -X POST "http://localhost:16385/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai","messages":[{"role":"user","content":"Hi"}],"stream":true,"stream_options":{"include_usage":true}}' 2>&1 | tail -20
echo ""

echo "✅ Tests complete!"
echo ""
echo "Expected headers:"
echo "  x-model-used: <model-name>"
echo "  x-usage-prompt-text-tokens: <number>"
echo "  x-usage-completion-text-tokens: <number>"
echo "  x-usage-total-tokens: <number>"
