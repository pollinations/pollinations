# Known Issues & Limitations

## Cloudflare 524 Timeout for Long-Running Models

**Affected models:** `openai-large` with high `reasoning_effort` (e.g., `xhigh`)

**Issue:** Requests to reasoning models with high effort settings may fail with error 524 after ~100-130 seconds.

**Root cause:** Cloudflare's proxy layer has a hard 100-second timeout that cannot be configured on Workers plans. OpenAI reasoning models with high effort can take 2-5+ minutes to complete.

**Request flow:**
```
Client → Cloudflare CDN → gen.pollinations.ai → enter.pollinations.ai → text.pollinations.ai → Azure OpenAI
```

### Workaround

**Use streaming** (`stream: true`) for reasoning models. Streaming keeps the connection alive with incremental data:

```bash
curl 'https://gen.pollinations.ai/v1/chat/completions' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "openai-large",
    "messages": [{"role": "user", "content": "Your prompt"}],
    "stream": true,
    "reasoning_effort": "high"
  }' \
  --no-buffer
```

### Related

- Issue: [#7280](https://github.com/pollinations/pollinations/issues/7280)
