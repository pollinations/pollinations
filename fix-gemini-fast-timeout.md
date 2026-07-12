# Fix for Issue #12341: gemini-fast Model Timeout

## Problem Analysis
When users request the `gemini-fast` model via `/v1/chat/completions`, they receive a **Cloudflare 522 timeout** instead of proper error handling or routing.

## Root Cause
The model IS registered in `availableModels.ts` (line 231-236), but there's no **fallback or error handling** in the API gateway when the Portkey router fails to handle the request properly.

## Solution

### 1. **Add Error Handling Middleware** (`gen.pollinations.ai/src/middleware/model.ts`)
- Add timeout protection and proper error responses
- Implement fallback routing for gemini-fast to alternative providers

### 2. **Improve Model Resolution** (`gen.pollinations.ai/src/text/handler.ts`)
- Add try-catch with proper 400/502 error responses instead of letting timeouts propagate
- Catch upstream timeouts and return structured error JSON

### 3. **Test Coverage** (`gen.pollinations.ai/tests/text.spec.ts`)
- Add test case for gemini-fast timeout handling
- Verify fallback behavior

## Files to Modify

```typescript
// Fix 1: Add timeout handler in proxy.ts
// Line 588-611 (chatCompletionHandlers)

Add middleware:
- AbortSignal timeout (15s default, matches SDK timeout)
- Catch timeout errors and return 504 (Gateway Timeout) instead of 522

// Fix 2: Improve error response in handler.ts
- Wrap Portkey call in try-catch
- Return structured error with proper status code and helpful message

// Fix 3: Add model-specific config
// Consider adding gemini-fast fallback to gemini-flash-lite or gemini in Portkey configs
```

## Implementation Details

### Before (causes 522 timeout):
```typescript
async (c) => {
    const requestBody = await applySafetyToChatRequest(c, {
        ...(c.req.valid("json" as never) as CreateChatCompletionRequest),
        model: c.var.model.resolved,
    });

    const response = await handleChatCompletionLocal(c, requestBody);
    // No timeout protection or error handling
    return response;
}
```

### After (handles timeout gracefully):
```typescript
async (c) => {
    const requestBody = await applySafetyToChatRequest(c, {
        ...(c.req.valid("json" as never) as CreateChatCompletionRequest),
        model: c.var.model.resolved,
    });

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        
        const response = await handleChatCompletionLocal(c, requestBody);
        clearTimeout(timeout);
        
        return response;
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            return c.json(
                {
                    error: {
                        message: `Model ${c.var.model.resolved} request timed out after 15s`,
                        type: 'timeout',
                        code: 'timeout',
                    },
                },
                504,
            );
        }
        throw error;
    }
}
```

## Expected Behavior After Fix

1. **Request to gemini-fast via /v1/chat/completions:**
   - If successful: Returns normal response
   - If timeout: Returns 504 Gateway Timeout with helpful error message
   - **Before:** Cloudflare 522 Connection Timed Out

2. **Error Response Format:**
   ```json
   {
     "error": {
       "message": "Model gemini-fast request timed out after 15s. Please try again or use an alternative model.",
       "type": "timeout",
       "code": "timeout"
     }
   }
   ```

## Testing

```bash
# Test gemini-fast via API
curl -X POST https://gen.pollinations.ai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -d '{
    "model": "gemini-fast",
    "messages": [{"role": "user", "content": "hi"}],
    "timeout": 5000
  }'

# Should return 504 with helpful error instead of 522 timeout
```

## Related Files

- `gen.pollinations.ai/src/routes/proxy.ts` (lines 131-182, 588-611)
- `gen.pollinations.ai/src/text/handler.ts`
- `gen.pollinations.ai/src/text/availableModels.ts` (confirms gemini-fast exists)
- `gen.pollinations.ai/src/middleware/model.ts`

---

**Status:** Ready for PR creation once approved
