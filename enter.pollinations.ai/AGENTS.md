# 🎨 Pollinations API Cheatsheet

> 🔧 **Internal testing only** — For production API usage, use [`gen.pollinations.ai`](https://gen.pollinations.ai). This cheatsheet tests the Enter gateway directly for debugging purposes.

> Quick reference for testing image and text models via **gen.pollinations.ai**. Enter keeps the dashboard and internal `/api/*` control-plane routes.

> ⚠️ **Note**: Generation routes now live on gen without an internal `/api/generate` prefix.

---

## 📍 Quick Reference

### Endpoints

- **Image:** `GET /image/{prompt}?model=flux`
- **Text (OpenAI):** `POST /v1/chat/completions` with JSON body
- **Text (Simple):** `GET /text/{prompt}?model=openai`

### Authentication

- Header: `Authorization: Bearer YOUR_API_KEY`
- Query: `?key=YOUR_API_KEY`

### Model Discovery

- **Image models:** `/image/models`
- **Text models:** `/v1/models`

---

## 🔑 Setup

### API Key Types

**Two types of API keys available:**

1. **🌐 Publishable Key** (starts with `pk_`) - ⚠️ **Beta: Not yet ready for production use**
   - Always visible in dashboard
   - For client-side apps (React, Vue, etc.)
   - IP rate-limited: 1 pollen per IP per hour
   - **Consumes Pollen from your balance** - exposing in public code will drain your wallet if your app gets traffic
2. **🔒 Secret Key** (starts with `sk_`)
   - Only shown once - copy immediately!
   - For server-side apps only
   - Never expose publicly
   - No rate limits
   - **Consumes Pollen from your balance**

**For testing, use Secret Keys** for better rate limits and pollen spending.

```bash
# Get your API key from: https://enter.pollinations.ai
export TOKEN="your_secret_key_here"  # sk_...

# Set base URL
export BASE_URL="https://enter.pollinations.ai/api"
```

---

## 🖼️ Image Generation

> **All models require authentication.** Image models have NO tier requirements - only pollen balance matters.

**Flux** (Default Model)

```bash
# Basic - returns the image (defaults: 1024x1024, seed=42)
curl "$BASE_URL/generate/image/test1?model=flux" \
  -H "Authorization: Bearer $TOKEN"

# With custom size and seed
curl "$BASE_URL/generate/image/test2?model=flux&width=512&height=512&seed=123" \
  -H "Authorization: Bearer $TOKEN"

# Alternative: Use query parameter for auth
curl "$BASE_URL/generate/image/test3?model=flux&key=$TOKEN"
```

**GPT Image**

```bash
curl "$BASE_URL/generate/image/test1?model=gptimage&width=512&height=512" \
  -H "Authorization: Bearer $TOKEN"
```

**Turbo**

```bash
curl "$BASE_URL/generate/image/test2?model=turbo&width=1024&height=1024" \
  -H "Authorization: Bearer $TOKEN"
```

**Kontext**

```bash
curl "$BASE_URL/generate/image/test3?model=kontext&width=512&height=512" \
  -H "Authorization: Bearer $TOKEN"
```

**Seedream** ⚠️ _Requires minimum 960x960 pixels_

```bash
curl "$BASE_URL/generate/image/test4?model=seedream&width=1024&height=1024" \
  -H "Authorization: Bearer $TOKEN"
```

### ⚙️ Advanced Options

```bash
# All parameters
curl "$BASE_URL/generate/image/test5?model=gptimage&width=1024&height=1024&seed=123&quality=high&guidance_scale=7.5" \
  -H "Authorization: Bearer $TOKEN"

# Image-to-image (with reference image URL)
curl "$BASE_URL/generate/image/test6?model=flux&image=https://example.com/image.jpg" \
  -H "Authorization: Bearer $TOKEN"

# Transparent background
curl "$BASE_URL/generate/image/test7?model=flux&transparent=true" \
  -H "Authorization: Bearer $TOKEN"

# Save to file
curl "$BASE_URL/generate/image/test8?model=gptimage" \
  -H "Authorization: Bearer $TOKEN" \
  -o my_image.jpg
```

### 🚀 Parallel Requests

Test multiple images simultaneously (useful for load testing):

```bash
# Generate 5 images in parallel
for i in {1..5}; do
  {
    curl "$BASE_URL/generate/image/test$i?model=flux&width=256&height=256&seed=$i" \
      -H "Authorization: Bearer $TOKEN" \
      -o "image_$i.jpg" &
  }
done

# Wait for all to complete
wait
echo "All images generated!"
```

> **Note**: Parallel requests complete faster but may hit rate limits. Use sequential requests with delays for safer testing.

### Available Parameters

- `model`: flux (default), gptimage, turbo, kontext, seedream
- `width`, `height`: Image dimensions (default: 1024)
  - **seedream**: Minimum 960x960 (921600 pixels required)
- `seed`: Random seed (default: 42)
- `quality`: low, medium (default), high, hd
- `guidance_scale`: How closely to follow prompt (number)
- `safe`: Enable safety filters (default: false)
- `image`: Reference image URL for image-to-image
- `transparent`: Generate with transparent background (default: false)

---

## 💬 Text Generation

### 📋 List Available Models

```bash
curl "$BASE_URL/generate/v1/models" \
  -H "Authorization: Bearer $TOKEN"
```

### 🚀 Basic Request (OpenAI-compatible)

```bash
curl "$BASE_URL/generate/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ]
  }'
```

### ⚡ Simple Text Endpoint

```bash
# Quick text generation from prompt
curl "$BASE_URL/generate/text/test1" \
  -H "Authorization: Bearer $TOKEN"

# Or with query parameter auth
curl "$BASE_URL/generate/text/test2?key=$TOKEN"
```

### 🌊 Streaming Response

```bash
curl "$BASE_URL/generate/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [
      {"role": "user", "content": "Write a short poem"}
    ],
    "stream": true
  }' \
  --no-buffer
```

### 🎯 Testing Different Models

> ⚠️ **Important**: Always check available models first using the discovery endpoint before testing. Only use models that appear in the list.

```bash
# Step 1: Get list of available models
curl "$BASE_URL/generate/v1/models" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[].id'

# Step 2: Test a specific model (use model names from Step 1)
curl "$BASE_URL/generate/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "MODEL_NAME", "messages": [{"role": "user", "content": "Test"}]}'
```

**Example with validated models:**

```bash
# OpenAI (default)
curl "$BASE_URL/generate/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai", "messages": [{"role": "user", "content": "Test"}]}'

# OpenAI Fast
curl "$BASE_URL/generate/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai-fast", "messages": [{"role": "user", "content": "Test"}]}'

# Mistral
curl "$BASE_URL/generate/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "mistral", "messages": [{"role": "user", "content": "Test"}]}'

# Qwen Coder
curl "$BASE_URL/generate/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen-coder", "messages": [{"role": "user", "content": "Write Python code"}]}'
```

### 🚀 Parallel Text Requests

Test multiple text generations simultaneously:

```bash
# Generate 5 responses in parallel
for i in {1..5}; do
  {
    curl "$BASE_URL/generate/v1/chat/completions" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"model\": \"openai-fast\", \"messages\": [{\"role\": \"user\", \"content\": \"Test $i\"}]}" \
      > "response_$i.json" &
  }
done

# Wait for all to complete
wait
echo "All responses generated!"
```

> **Note**: Parallel requests complete in ~2-3 seconds vs 10+ seconds sequential. May hit rate limits with many requests.

### 🎤 Audio Models

**OpenAI Audio** (requires modalities parameter)

```bash
# Audio output (text-to-speech)
curl "$BASE_URL/generate/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai-audio",
    "messages": [{"role": "user", "content": "Say hello"}],
    "modalities": ["text", "audio"],
    "audio": {
      "voice": "alloy",
      "format": "wav"
    }
  }'

# Available voices: alloy, echo, fable, onyx, nova, shimmer
```

> ⚠️ **Important**: `openai-audio` requires `modalities: ["text", "audio"]` parameter. Without it, you'll get a 400 error.

---

## 🔧 Testing & Debugging

### Check Authentication

```bash
# Test if your token works
curl "$BASE_URL/generate/image/test?model=flux&width=256&height=256" \
  -H "Authorization: Bearer $TOKEN" \
  -w "\nHTTP Status: %{http_code}\n" \
  -o /dev/null

# List available models (requires auth)
curl "$BASE_URL/generate/image/models" \
  -H "Authorization: Bearer $TOKEN"
```

### View Response Headers

```bash
curl -I "$BASE_URL/generate/image/test?model=flux" \
  -H "Authorization: Bearer $TOKEN"
```

### Full Response with Error Details

```bash
curl -v "$BASE_URL/generate/image/test?model=gptimage" \
  -H "Authorization: Bearer $TOKEN" \
  2>&1 | less
```

### Test Specific Error Cases

```bash
# No auth (should fail - all models require auth)
curl "$BASE_URL/generate/image/test?model=flux" -w "\nHTTP: %{http_code}\n"

# Invalid model
curl "$BASE_URL/generate/image/test?model=invalid" \
  -H "Authorization: Bearer $TOKEN" \
  -w "\nHTTP: %{http_code}\n"

# Invalid token
curl "$BASE_URL/generate/image/test?model=flux" \
  -H "Authorization: Bearer invalid_token" \
  -w "\nHTTP: %{http_code}\n"
```

---

## 💳 Local Stripe Webhook Testing

To test Stripe pack purchases locally, you need to forward webhooks to your local dev server.

### One-Time Setup

1. **Install Stripe CLI**: https://stripe.com/docs/stripe-cli

2. **Login to the correct Stripe account**:
   ```bash
   stripe login
   ```
   Authenticate with the **Myceli.AI OÜ** test account (`acct_1SrYSy6O03AauPe8`)

3. **Decrypt secrets**:
   ```bash
   npm run decrypt-vars
   ```

### Running Local Webhook Testing

```bash
# Start webhook forwarding (uses permanent secret from Stripe Dashboard)
stripe listen --forward-to localhost:3000 --load-from-webhooks-api
```

> **CRITICAL**: Do NOT add `/api/webhooks/stripe` to the `--forward-to` URL! The `--load-from-webhooks-api` flag already includes the path from Stripe Dashboard. Adding it manually causes path duplication (`/api/webhooks/stripe/api/webhooks/stripe`) and 404 errors.

Then in another terminal:
```bash
npm run dev
```

### Testing a Purchase

1. Go to `http://localhost:3000`
2. Click a pack purchase button (e.g., "+ $10")
3. Complete checkout with test card: `4242 4242 4242 4242`
4. Watch terminal for: `Stripe: Credited X pollen to user...`

### Troubleshooting

- **Wrong account**: If `--load-from-webhooks-api` fails, run `stripe login` again
- **Webhook secret mismatch**: Ensure `.dev.vars` has the correct `STRIPE_WEBHOOK_SECRET`
- **Async crypto error**: The code uses `constructEventAsync` for Cloudflare Workers compatibility

---

## Batch Testing

### Generate Multiple Images

```bash
# Test 10 unique images
# NOTE: Add delays between requests to avoid backend rate limiting
for i in {1..10}; do
  curl "$BASE_URL/generate/image/test${i}?model=gptimage&width=256&height=256&seed=$i" \
    -H "Authorization: Bearer $TOKEN" \
    -o "test_${i}.jpg" \
    -w "Image $i: HTTP %{http_code}\n"
  sleep 2  # Important: 2s delay to avoid 500 errors
done
```

### Test Different Models

```bash
for model in flux gptimage turbo; do
  echo "Testing $model..."
  curl "$BASE_URL/generate/image/test_${model}?model=${model}&width=256&height=256" \
    -H "Authorization: Bearer $TOKEN" \
    -o "${model}_test.jpg" \
    -w "${model}: HTTP %{http_code}\n"
done
```

---

## Quick Test Script

```bash
#!/bin/bash
# quick-test.sh - Test enter service

# Note: You can store your token in a .env.local file and extract it like this:
# TOKEN=$(grep "^YOUR_TOKEN_VAR=" /path/to/.env.local | cut -d= -f2)
# Or set it directly:
TOKEN="your_secret_key_here"  # sk_...
BASE_URL="https://enter.pollinations.ai/api"

echo "🧪 Testing Enter Service"
echo "========================"

# Test included model (no additional pollen)
echo "1. Testing INCLUDED model (flux)..."
curl -s "$BASE_URL/generate/image/test_included?model=flux&width=256&height=256" \
  -w "   HTTP: %{http_code}\n" -o /dev/null

# Test paid model (requires pollen)
echo "2. Testing PAID model (gptimage)..."
curl -s "$BASE_URL/generate/image/test_paid?model=gptimage&width=256&height=256" \
  -H "Authorization: Bearer $TOKEN" \
  -w "   HTTP: %{http_code}\n" -o /dev/null

# Test text model
echo "3. Testing TEXT model..."
curl -s "$BASE_URL/generate/text" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai", "messages": [{"role": "user", "content": "Say hi"}]}' \
  -w "   HTTP: %{http_code}\n" | head -1

echo "✅ Done!"
```

---

## Common Issues

### 401 Unauthorized

- **All models require authentication** - no anonymous access
- Check your token is correct (starts with `pk_` or `sk_`)
- Verify token exists in database
- Ensure you're using `Authorization: Bearer $TOKEN` header
- For paid models, ensure you're using a **Secret Key** (`sk_`), not Publishable Key

### 403 Forbidden

- **Insufficient pollen balance** - paid models require pollen
  - Check your pollen balance at https://enter.pollinations.ai
  - Add pollen to your account to use paid models
- **Text models may have tier requirements** - check the error message
- Note: Image models have NO tier requirements, only pollen balance

### 500 Internal Server Error

- **Most common**: Too many requests too quickly - add delays between requests
- Backend image service might be temporarily overloaded
- Try single requests first, then batch with 2+ second delays
- Check model name is correct
- If persistent, backend service might be down

### Empty Response

- Model might be rate-limited
- Cache might have returned empty result
- Check response headers with `-I` flag

---

## 📚 Model Discovery

> ⚠️ **Critical**: ALWAYS use these endpoints to discover available models before testing. Never assume a model exists without checking first.

### List Available Models

```bash
# Get all available image models
curl "$BASE_URL/generate/image/models" \
  -H "Authorization: Bearer $TOKEN"

# Get all available text models (returns model IDs)
curl "$BASE_URL/generate/v1/models" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[].id'
```

### Testing Workflow

```bash
# 1. Discover available models
MODELS=$(curl -s "$BASE_URL/generate/v1/models" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[].id')

# 2. Pick a model from the list
echo "$MODELS"

# 3. Test the model
curl "$BASE_URL/generate/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "MODEL_FROM_LIST", "messages": [{"role": "user", "content": "Test"}]}'
```

**Important Notes:**

- ⚠️ **Only test models that appear in the discovery endpoint**
- **Image models**: NO tier requirements, only pollen balance matters for paid models
- **Text models**: May have tier requirements, check model details
- Default image model: `flux` (free, 1024x1024)
- Default text model: `openai` (GPT-4o)
- **Seedream**: Requires minimum 960x960 pixels (921600 total pixels)

---

## 💡 Tips

### Testing Best Practices

- ⚠️ **ALWAYS validate models first**: Use the discovery endpoint (`/generate/v1/models` or `/generate/image/models`) before testing any model
- ❌ **Never test undocumented models**: Only use model names that appear in the discovery endpoint response
- ✅ **Workflow**: List models → Pick from list → Test

### Authentication

- **Use Secret Keys (`sk_`) for testing**: Better rate limits and can spend pollen
- **Publishable Keys (`pk_`)**: Only for client-side apps, IP rate limited (1 pollen per IP per hour)

### Performance

- **Always use unique prompts** to avoid cache hits when testing billing
- **Simple prompts work best**: Use `test1`, `test2` instead of `test_image_1_timestamp`
- **Avoid special characters** in prompts (underscores can cause issues)
- **Add delays for batch requests**: 2+ seconds between requests to avoid 500 errors
- **Test single requests first** before running batch tests
- **Check response headers** for cache status: `x-cache: HIT` or `MISS`
- **Use small images** (256x256) for quick tests
- **Monitor your balance** at https://enter.pollinations.ai after tests

---

## 🔐 BYOP Authorization Flow

Third-party apps redirect users to authorize a scoped user key. New web integrations should use OAuth authorization-code + PKCE; the old `#api_key=` fragment flow remains supported for legacy clients. With `client_id`/`app_key`, the consent screen shows app name + developer GitHub.

### Base URL

```
https://enter.pollinations.ai/authorize?response_type=code&redirect_uri=YOUR_CALLBACK&client_id=pk_yourkey&state=STATE&code_challenge=CHALLENGE&code_challenge_method=S256
```

### Parameters

| Param | Description | Example |
|-------|-------------|---------|
| `client_id` | Publishable key (shows app name + author); `app_key` is legacy alias | `pk_abc123` |
| `redirect_uri` | Registered callback URL; `redirect_url` is legacy alias | `https://myapp.com/callback` |
| `response_type` | `code` for OAuth code flow; omit for legacy fragment flow | `code` |
| `code_challenge` | PKCE S256 challenge for code flow | `abc...` |
| `code_challenge_method` | Must be `S256` for code flow | `S256` |
| `models` | Comma-separated allowed models | `flux,openai,gptimage` |
| `budget` | Pollen budget limit | `10` |
| `expiry` | Expiry in days (default: 7) | `7` |
| `scope` | Account permissions; `permissions` is legacy alias | `profile usage` |

### Account Permissions

- `profile`: Read user's name, email, GitHub username
- `usage`: Read usage history and pollen balance

### App Registration

Register a `pk_` key at enter.pollinations.ai with at least one **Redirect URI** + **BYOP** toggle enabled. The key name becomes the app display name on the consent screen.

### Example

```
https://enter.pollinations.ai/authorize?response_type=code&redirect_uri=https://myapp.com/callback&client_id=pk_abc123&scope=profile%20usage&expiry=7&state=random&code_challenge=...&code_challenge_method=S256
```

After authorization, the user is redirected back with a short-lived code:
```
https://myapp.com/callback?code=oauth_code&state=random
```

Exchange it at `POST /api/oauth/token` with form-encoded `grant_type=authorization_code`, `code`, `client_id`, `redirect_uri`, and `code_verifier`. Response:
```
{ "access_token": "sk_xxxxx", "token_type": "bearer" }
```

### App Lookup Endpoint

`GET /api/app-lookup` — resolves app attribution (no auth required):
- `?app_key=pk_xxx` (or `?client_id=pk_xxx`) — direct key lookup; returns `{ found: false }` if absent

URL-based identity lookup was removed — identity is derived from `client_id` only, never from the redirect URL. When `client_id` is present, the requested `redirect_uri` must exactly match one registered redirect URI. See PR #10447.

---

## 🎫 Wallet & Balance Lookups

> Claude skill available: `.claude/skills/tier-management/SKILL.md`

Pollen is earned by completing **Quests**. The `tier`, `tier_balance`, and `pack_balance` columns remain in D1 as the active wallet data model — do not treat the `tier` column as a runtime product level or mutate it to "upgrade" a user. The `tier_balance` bucket is shown to users as the **Quest Pollen** balance; `pack_balance` is the **Paid** balance. The old account-level upgrade/downgrade paths (Spore→Seed, app→Flower, admin tier-update) are removed.

### Lookups (read-only)

```bash
# Look up a user's balance
.claude/skills/tier-management/scripts/check-user-balance.sh USERNAME_OR_EMAIL

# Or query D1 directly
cd enter.pollinations.ai
npx wrangler d1 execute DB --remote --env production \
  --command "SELECT github_username, email, tier, tier_balance FROM user WHERE LOWER(github_username) LIKE '%USERNAME%';"
```

---

## API Documentation Pipeline

The API reference at `gen.pollinations.ai/docs` is auto-generated from source code. **Never edit `APIDOCS.md` directly** — it gets overwritten by CI.

### How It Works

```
Source files (routes + Zod schemas)
        │
        ▼
hono-openapi introspects describeRoute() + validators
        │
        ▼
OpenAPI 3.x JSON served at /docs/open-api/generate-schema
        │
        ├──► Scalar UI at gen.pollinations.ai/docs (interactive, runtime)
        ├──► /docs/llm.txt (compact plain text for AI agents)
        └──► gen.pollinations.ai/scripts/generate-apidocs.ts → APIDOCS.md (offline, via CI)
```

### Source Files (what you edit)

| File | What it controls |
|------|-----------------|
| `src/routes/proxy.ts` | Endpoint descriptions, summaries, response schemas, error codes |
| `src/routes/account.ts` | Account endpoint descriptions |
| `src/routes/docs.ts` | OpenAPI info/intro text, tag descriptions, code samples, LLM doc, schema transformations |
| `src/schemas/image.ts` | Image/video query param definitions (auto-become OpenAPI params) |
| `src/schemas/text.ts` | Text query param definitions |
| `src/schemas/openai.ts` | OpenAI-compatible request/response schemas |
| `src/utils/api-docs.ts` | `errorResponseDescriptions()` helper |
| `src/error.ts` | Known error status codes list |

### Key Concepts

- **`describeRoute()`** — each route declares its tags, summary, description, and response schemas inline
- **Zod schemas with `.meta()`** — query/body params become OpenAPI parameters automatically (types, defaults, descriptions, enums)
- **`transformOpenAPISchema()`** in `docs.ts` does three things:
  1. Strips `/generate/` prefix from paths (internal mount point → public API paths)
  2. `filterAliases()` removes model aliases from enums (only primary IDs shown)
  3. Injects `x-codeSamples` (curl, Python, JS examples) from the `CODE_SAMPLES` object
- **`generateLLMDoc()`** in `docs.ts` — hand-written compact text doc served at `/docs/llm.txt`, separate from OpenAPI
- **Hidden endpoints** — routes with `hide: true` in `describeRoute()` are excluded from production docs (e.g. `/customer/balance`, `/api-keys`)

### Three Output Surfaces

1. **Scalar UI** (`gen.pollinations.ai/docs`) — interactive docs page, fetches OpenAPI JSON client-side at runtime
2. **LLM text** (`/docs/llm.txt`) — compact plain text for AI agents, generated from `generateLLMDoc()` at startup
3. **APIDOCS.md** — markdown version, generated offline by `gen.pollinations.ai/scripts/generate-apidocs.ts` using `@scalar/openapi-to-markdown`

### Regenerating APIDOCS.md

- **Automatic**: CI workflow `.github/workflows/docs-regenerate-apidocs.yml` runs after a successful production deploy (`Deploy gen.pollinations.ai` workflow on the `production` branch). If APIDOCS.md drifts, it opens or updates a single `docs/apidocs-sync` PR against `main`.
- **Manual**: `npm run docs:generate --prefix gen.pollinations.ai` (fetches from production `gen.pollinations.ai`, so changes must be deployed first)

### Where to Make Changes

| Want to change... | Edit this |
|-------------------|----------|
| Endpoint description or summary | `describeRoute()` in the route file (`proxy.ts`, `account.ts`) |
| Query/body parameters | Zod schema in `src/schemas/` |
| Error response codes shown | `errorResponseDescriptions()` call in the route |
| Tag descriptions (sidebar categories) | `tags` array in `docs.ts` OpenAPI config |
| Code samples (curl/Python/JS tabs) | `CODE_SAMPLES` object in `docs.ts` |
| API intro text (Quick Start, Auth, Errors) | `documentation.info.description` in `docs.ts` |
| LLM doc content | `generateLLMDoc()` in `docs.ts` |
| Model lists in enums | Model registries in `shared/registry/` (auto-picked up) |
