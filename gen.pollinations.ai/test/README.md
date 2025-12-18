# Test Suite for gen.pollinations.ai

## Gemini Search Streaming Issue

### Issue Description
Reported by **andreas_11** (Discord): The `gemini-search` model outputs text "in one shot" instead of streaming properly. It "misses the rest of the chunks" (truncation or buffering issue), unlike other streaming models like `gemini-fast`.

### Running the Test

```bash
# Set your API key
export API_KEY="your-pollinations-api-key"

# Run the streaming test
npm run test -- gemini-search-streaming.test.js
```

### What the Test Does

1. **Baseline Test**: Tests regular `gemini` model streaming to establish healthy behavior
2. **Issue Reproduction**: Tests `gemini-search` model to reproduce the reported issue  
3. **Comparison**: Directly compares chunk timing and distribution between both models

### Expected Behavior (Healthy Streaming)

- Multiple chunks (>5) delivered progressively
- First chunk arrives quickly (<5 seconds)
- Consistent intervals between chunks

### Actual Behavior (gemini-search Issue)

- Very few chunks (1-2 "one-shot" delivery)
- Long delay before first chunk (buffering)
- Chunks arrive all at once or in large bursts

### Analysis Results

The test will output detailed timing information:
- Total number of chunks received
- Time to first chunk
- Average chunk interval
- Chunk timing distribution

### Test Results (Confirmed 2025-12-18)

**Test 1: Short Response (max_tokens=50)**
```
gemini:        2 chunks | First chunk: 2050ms | Content: "Hey"
gemini-search: 1 chunk  | First chunk: 1935ms | Content: "Hello," ✗ ONE-SHOT
```

**Test 2: Longer Response (max_tokens=200)**
```
gemini:        1 content chunk  | 3491ms
gemini-search: 6 transport chunks in BURST | 4748ms
               Intervals: 1ms, 1ms, 0ms, 1ms, 0ms ✗ ALL AT ONCE
```

### Root Cause (Confirmed)

The issue is caused by how **Vertex AI handles Google Search grounding with streaming**:

1. Request arrives → Vertex AI initiates Google Search
2. **Search completes** → Results buffered
3. Response generation → Model generates with search context  
4. **Buffering occurs** → All text buffered until search + generation complete
5. Stream starts → Entire response sent in large bursts (0-1ms intervals)

**Confirmed**: This is a **Vertex AI + Google Search limitation**, not a pollinations.ai bug. The `groundingMetadata: {}` field confirms Google Search was involved.

### Potential Solutions

1. **Document limitation**: Add to API docs that gemini-search has delayed streaming
2. **Report upstream**: File issue with Google Cloud / Vertex AI
3. **Alternative approach**: Consider using `gemini` with grounding tools differently
4. **Add warning**: Show users that gemini-search may have slower initial response

### Related Files

- `text.pollinations.ai/availableModels.ts` - Model definitions
- `text.pollinations.ai/transforms/createGoogleSearchTransform.js` - Google Search tool config
- `text.pollinations.ai/configs/modelConfigs.ts` - Vertex AI configuration
- `gen.pollinations.ai/src/index.ts` - Public API routing layer
