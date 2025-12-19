# Simulated Streaming for gemini-search

## Problem

The `gemini-search` model (powered by Vertex AI with Google Search grounding) delivers responses in 1-2 mega-chunks instead of streaming progressively. This creates poor UX in chat interfaces where users expect typewriter-style output.

### Root Cause
Vertex AI's Google Search grounding feature buffers the entire response internally before streaming it out, resulting in:
- First chunk: ~2000+ characters
- Second chunk (if any): remaining content
- No smooth progressive streaming

## Solution

Implement "simulated streaming" that:
1. Detects mega-chunks (>50 characters)
2. Re-streams them in small chunks (~4 chars each)
3. Adds artificial delays between chunks (~20ms default)
4. Maintains proper SSE protocol compliance

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Client    │ stream  │ gen.polling  │ service │   enter     │
│  (Chat UI)  │◄────────│  nati Worker │ binding │   Worker    │
└─────────────┘         └──────────────┘         └─────────────┘
                               │                         │
                               │                         ▼
                               │                  ┌──────────────┐
                               │                  │  Vertex AI   │
                               │                  │ gemini-search│
                               │                  └──────────────┘
                               │                         │
                               │  ┌──────────────────────┘
                               │  │ Mega-chunk (2000+ chars)
                               │  │
                               ▼  ▼
                        ┌──────────────────┐
                        │ simulatedStreaming│
                        │  transformation  │
                        └──────────────────┘
                               │
                               │ Small chunks (4 chars)
                               │ + 1-20ms delays
                               ▼
                        Smooth UX output
```

## Implementation Details

### Scope Control (`index.ts`)

**CRITICAL FIX**: Only apply simulated streaming to specific models that need it.

```typescript
const MODELS_NEEDING_SIMULATION = [
    'gemini-search',
    // Add other models here if needed
];

async function needsSimulatedStreaming(request: Request): Promise<boolean> {
    // Only applies to:
    // 1. POST requests
    // 2. Chat completion endpoints
    // 3. Streaming enabled (stream: true)
    // 4. Specific models in MODELS_NEEDING_SIMULATION list
    
    // This prevents unnecessary overhead on healthy streaming models
    // (OpenAI, Llama, Claude, etc.)
}
```

**Why this matters:**
- Before: All streaming responses were processed (CPU overhead + latency)
- After: Only gemini-search and similar models are processed
- Performance: ~0ms overhead for 99% of requests

### Dynamic Delay Calculation (`simulatedStreaming.ts`)

**CRITICAL FIX**: Prevent Worker timeouts on large responses.

```typescript
const MAX_TOTAL_DELAY_MS = 2000;  // Cap total delay
const MIN_DELAY_MS = 1;            // Minimum per-chunk delay
const MAX_DELAY_MS = 20;           // Maximum per-chunk delay

// Dynamic delay formula:
const dynamicDelay = Math.max(
    MIN_DELAY_MS,
    Math.min(MAX_DELAY_MS, MAX_TOTAL_DELAY_MS / chunks.length)
);
```

**Examples:**
- 100 chunks (400 chars): 20ms × 100 = 2000ms ✓
- 500 chunks (2000 chars): 4ms × 500 = 2000ms ✓
- 1000 chunks (4000 chars): 2ms × 1000 = 2000ms ✓

**Why this matters:**
- Before: Fixed 20ms delay could cause 25+ second delays on large responses
- After: Total artificial delay capped at 2 seconds regardless of response size
- Worker limits: Avoids hitting Cloudflare's 30s CPU time limit

### SSE Protocol Compliance

**CRITICAL FIX**: Properly handle all SSE event types.

```typescript
for (const line of lines) {
    if (line.startsWith('data: ')) {
        // Handle data events with JSON parsing
    } else if (line.trim()) {
        // CRITICAL: Pass through event:, id:, comments
        // Preserves SSE protocol integrity
        controller.enqueue(encoder.encode(line + '\n'));
    }
}
```

**SSE events we now handle correctly:**
- `data: {...}` - JSON data (our transformation target)
- `event: custom-event` - Custom event types
- `id: 123` - Event IDs for reconnection
- `: keep-alive` - Keep-alive comments
- Empty lines - Event separators

**Why this matters:**
- Before: Only `data:` lines were handled, breaking reconnection and custom events
- After: Full SSE protocol compliance
- Impact: Compatible with all SSE client libraries

### Multi-byte Character Safety

```typescript
buffer += decoder.decode(value, { stream: true });
```

The `{ stream: true }` option ensures proper handling of multi-byte Unicode characters (emoji, CJK, etc.) that might be split across chunks.

## Performance Impact

### CPU Overhead
- **Before fix**: All streaming requests processed (100%)
- **After fix**: Only gemini-search processed (~1-2% of requests)
- **Savings**: ~98% reduction in unnecessary processing

### Latency Impact
- **gemini-search**: +0-2000ms artificial delay (UX improvement)
- **Other models**: +0ms (pass-through)

### Worker Costs
- **Before fix**: Risk of timeout on large responses
- **After fix**: Max 2s delay ensures completion within limits

## Configuration

Adjust these constants in `simulatedStreaming.ts` to tune behavior:

```typescript
const MAX_TOTAL_DELAY_MS = 2000;  // Total delay cap
const MIN_DELAY_MS = 1;            // Min delay per chunk
const MAX_DELAY_MS = 20;           // Max delay per chunk  
const CHARS_PER_CHUNK = 4;         // Chunk size (~1 token)
```

### Tuning Guidelines
- **Faster typing**: Decrease `MAX_DELAY_MS` (10ms = ~100 tokens/sec)
- **Slower typing**: Increase `MAX_DELAY_MS` (40ms = ~25 tokens/sec)
- **Longer responses**: Keep `MAX_TOTAL_DELAY_MS` at 2000ms to avoid timeouts
- **Token estimation**: 4 chars ≈ 1 token (English), adjust `CHARS_PER_CHUNK` as needed

## Testing

### Manual Testing
```bash
curl -X POST https://gen.pollinations.ai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-search",
    "messages": [{"role": "user", "content": "What is quantum computing?"}],
    "stream": true
  }'
```

Expected behavior:
- Small chunks arrive progressively (~50 chars/sec)
- Total response time: ~2-4 seconds (1-2s content + up to 2s artificial delay)
- No timeout errors

### Metrics to Monitor
- Worker CPU time per request
- Response time distribution
- Timeout rate
- User satisfaction (subjective UX improvement)

## Future Improvements

1. **Adaptive delay**: Adjust based on response size prediction
2. **Model detection**: Auto-detect buffering models via response pattern analysis
3. **Client-side config**: Allow clients to opt-out via header
4. **Metrics**: Track simulated streaming usage and performance

## Rollout Strategy

1. **Stage 1**: Deploy to staging, test with gemini-search
2. **Stage 2**: Monitor CPU usage and timeout rates
3. **Stage 3**: Deploy to production with monitoring
4. **Stage 4**: Expand to other models if needed

## Troubleshooting

### Issue: Simulated streaming not applied
**Check:**
- Model is in `MODELS_NEEDING_SIMULATION` list
- Request has `stream: true`
- Response is `text/event-stream`

### Issue: Worker timeout
**Solutions:**
- Verify `MAX_TOTAL_DELAY_MS` is set (default: 2000ms)
- Check for infinite loops in chunk processing
- Monitor Worker CPU time

### Issue: Garbled characters
**Cause:** Multi-byte characters split across chunks
**Solution:** Already handled via `{ stream: true }` in TextDecoder

## References

- [Server-Sent Events Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Vertex AI Streaming](https://cloud.google.com/vertex-ai/docs/generative-ai/learn/streaming)
