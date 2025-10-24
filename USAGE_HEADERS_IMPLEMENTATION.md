# Unified Token Usage Headers - Implementation Summary

**GitHub Issue:** #4638 - Add pollen usage (token) in the response header  
**Status:** ✅ Implemented  
**Date:** 2025-10-24

---

## 🎯 What Was Implemented

Unified token usage reporting across text and image services using HTTP headers, with a DRY shared utility.

### Key Features

1. **Shared Utility** - `/shared/registry/usage-headers.ts`
   - Single source of truth for header format
   - Type-safe with existing `TokenUsage` type
   - Iterates over token types (no boilerplate)

2. **Image Service** - Headers on all responses
   - Uses shared utility via `buildUsageHeaders()`
   - Backward compatible (same header names)

3. **Text Service** - Headers on all responses
   - **Non-streaming:** Headers sent immediately
   - **Streaming:** Headers sent as HTTP trailers after stream completes
   - Uses shared utility for consistency

---

## 📁 Files Modified

### Created
- `/shared/registry/usage-headers.ts` - Shared utility (new)
- `/test-usage-headers.sh` - Test script (new)

### Modified
- `/image.pollinations.ai/src/utils/trackingHeaders.ts` - Use shared utility
- `/text.pollinations.ai/server.js` - Add headers to all response types

---

## 🔧 Technical Implementation

### Header Format

All headers use `x-usage-{token-type}` format (kebab-case):

```
x-model-used: gpt-5-nano-2025-08-07
x-usage-prompt-text-tokens: 29
x-usage-prompt-cached-tokens: 5
x-usage-completion-text-tokens: 11
x-usage-total-tokens: 45
```

### Token Types Supported

All 8 token types from `TokenUsage`:
- `promptTextTokens`
- `promptCachedTokens`
- `promptAudioTokens`
- `promptImageTokens`
- `completionTextTokens`
- `completionReasoningTokens`
- `completionAudioTokens`
- `completionImageTokens`

### Streaming Implementation

For streaming responses, usage headers are sent as **HTTP trailers**:

1. Declare trailers in `Trailer` header upfront
2. Capture usage from SSE chunks via Transform stream
3. Add trailers using `res.addTrailers()` when stream ends

**Why trailers?**
- Usage data only available at end of stream
- Standard HTTP/1.1 feature
- Works for backend-to-backend (no browser support needed)

---

## 🧪 Testing

Run the test script:

```bash
./test-usage-headers.sh
```

### Manual Tests

**Image Service:**
```bash
curl -I https://image.pollinations.ai/prompt/test?model=flux
```

**Text Service (Non-streaming):**
```bash
curl -i -X POST http://localhost:16385/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"openai","messages":[{"role":"user","content":"Hi"}]}'
```

**Text Service (Streaming):**
```bash
curl --raw -X POST http://localhost:16385/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"openai","messages":[{"role":"user","content":"Hi"}],"stream":true,"stream_options":{"include_usage":true}}'
```

---

## 🎨 Code Architecture

### Elegant Solutions

1. **Iteration over token types** - No boilerplate, uses `USAGE_TYPE_TO_HEADER` mapping
2. **Transform stream for trailers** - Captures usage without blocking
3. **Shared utility** - Single implementation for both services
4. **Type-safe** - Uses existing `TokenUsage` and `UsageType` types

### Key Functions

**Shared Utility:**
```typescript
buildUsageHeaders(modelUsed, usage) // Build headers from TokenUsage
openaiUsageToTokenUsage(openaiUsage) // Convert OpenAI format
parseUsageHeaders(headers) // Parse headers back to TokenUsage
createImageTokenUsage(tokens) // Helper for image services
```

**Text Service:**
```javascript
createUsageCaptureTransform(res) // Transform stream for trailers
```

---

## ✅ Backward Compatibility

- **Image Service:** Headers unchanged (`x-model-used`, `x-usage-completion-image-tokens`)
- **Text Service:** Usage still in response body (headers are additional)
- **Enter Service:** Can read from headers OR body (fallback)

---

## 🚀 Benefits

1. **Unified Format** - Same headers across all services
2. **DRY** - Single shared utility, no duplication
3. **Type-Safe** - Leverages existing TypeScript types
4. **Future-Proof** - New token types automatically included
5. **Backend-Optimized** - HTTP trailers for streaming (no browser complexity)

---

## 📊 Next Steps

1. **Deploy to staging** - Test with real traffic
2. **Update enter service** - Read headers (optional enhancement)
3. **Monitor** - Verify headers appear in logs
4. **Document** - Update API docs with header format

---

## 🔗 References

- **GitHub Issue:** #4638
- **Related:** #4170 (Image service tracking headers)
- **Shared Types:** `/shared/registry/registry.ts`
- **Test Script:** `/test-usage-headers.sh`
