# gen.pollinations.ai

Simplified API gateway for Pollinations.AI, providing clean URLs via Cloudflare Workers service bindings.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Request → gen.pollinations.ai worker (pollinations-gen)        │
│              │                                                  │
│              │ Service Binding (zero latency, same thread)      │
│              ▼                                                  │
│           enter.pollinations.ai worker (pollinations-enter)     │
└─────────────────────────────────────────────────────────────────┘
```

## URL Mapping

| gen.pollinations.ai | → enter.pollinations.ai |
|---------------------|-------------------------|
| `/` | redirect → `/api/docs` |
| `/docs` | redirect → `/api/docs` |
| `/models` | → `/api/generate/text/models` |
| `/image/*` | → `/api/generate/image/*` |
| `/text/*` | → `/api/generate/text/*` |
| `/v1/*` | → `/api/generate/v1/*` |
| `/openai` | → `/api/generate/openai` |

## Development

```bash
# Install dependencies (first time only)
npm install -D wrangler typescript @cloudflare/workers-types

# Run locally (requires enter.pollinations.ai running on port 3000)
npm run dev

# Type check
npm run typecheck
```

### Local Development with Service Bindings

Run both workers simultaneously:

```bash
# Terminal 1: Run enter worker
cd ../enter.pollinations.ai && npm run dev

# Terminal 2: Run gen worker
cd ../gen.pollinations.ai && npm run dev

# Test
curl http://localhost:8788/models
```

## Deployment

```bash
# Deploy to staging
npm run deploy:staging

# Deploy to production (requires enter worker deployed first)
npm run deploy:production
```

**Note:** The target worker (`pollinations-enter`) must be deployed before `pollinations-gen`.

## Benefits

- **Zero latency** - Service bindings run in the same V8 isolate
- **Clean separation** - Independent deployments and codebases
- **Simple code** - Just path rewriting, no complex logic
- **No extra cost** - Service binding calls don't add to request costs
