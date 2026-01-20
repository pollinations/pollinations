# 🎨 Pollinations API Cheatsheet

> 🔧 **Internal testing only** — For production API usage, use [`gen.pollinations.ai`](https://gen.pollinations.ai). This cheatsheet tests the Enter gateway directly for debugging purposes.

> Quick reference for testing image and text models via **enter.pollinations.ai**

> ⚠️ **Note**: The current endpoint structure (`/api/generate/image/*`, `/api/generate/v1/*`, `/api/generate/text/*`) is transitional and will be simplified in future releases.

---

## 📍 Quick Reference

### Endpoints

- **Image:** `GET /api/generate/image/{prompt}?model=flux`
- **Text (OpenAI):** `POST /api/generate/v1/chat/completions` with JSON body
- **Text (Simple):** `GET /api/generate/text/{prompt}?model=openai`

### Authentication

- Header: `Authorization: Bearer YOUR_API_KEY`
- Query: `?key=YOUR_API_KEY`

### Model Discovery

- **Image models:** `/api/generate/image/models`
- **Text models:** `/api/generate/v1/models`

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
curl "$BASE_URL/generate/image/test5?model=gptimage&width=1024&height=1024&seed=123&quality=high&enhance=true&nologo=true&private=true&guidance_scale=7.5" \
  -H "Authorization: Bearer $TOKEN"

# Image-to-image (with reference image URL)
curl "$BASE_URL/generate/image/test6?model=flux&image=https://example.com/image.jpg" \
  -H "Authorization: Bearer $TOKEN"

# Transparent background
curl "$BASE_URL/generate/image/test7?model=flux&transparent=true&nologo=true" \
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
- `enhance`: Enhance prompt with AI (default: false)
- `negative_prompt`: What to avoid (default: "worst quality, blurry")
- `guidance_scale`: How closely to follow prompt (number)
- `nologo`: Remove watermark (default: false)
- `private`: Don't show in public feed (default: false)
- `nofeed`: Don't add to feed (default: false)
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

> **Note**: The Sandbox webhook URL must be `https://enter.pollinations.ai/api/webhooks/stripe` (with `/api` prefix) for this to work correctly.

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

## 🔐 OAuth Authorization Flow

Third-party apps can redirect users to the authorize page to get an API key with pre-selected permissions.

### Base URL

```
https://enter.pollinations.ai/authorize?redirect_url=YOUR_APP_URL
```

### Optional Preselection Parameters

| Param | Description | Example |
|-------|-------------|---------|
| `models` | Comma-separated allowed models | `flux,openai,gptimage` |
| `budget` | Pollen budget limit | `10` |
| `expiry` | Expiry in days (default: 30) | `7` |
| `permissions` | Account permissions | `profile,balance,usage` |

### Account Permissions

- `profile`: Read user's name, email, GitHub username
- `balance`: Read pollen balance
- `usage`: Read usage history

### Example

```
https://enter.pollinations.ai/authorize?redirect_url=https://myapp.com/callback&permissions=profile,balance&expiry=7&models=flux,openai
```

After authorization, the user is redirected back with the API key in the URL fragment:
```
https://myapp.com/callback#api_key=pk_xxxxx
```

---

## 🎫 User Tier Management

> Claude skill available: `.claude/skills/tier-management/SKILL.md`

### Tier Levels

| Tier   | Emoji | Pollen/Day | Criteria                 |
| ------ | ----- | ---------- | ------------------------ |
| spore  | 🍄    | 5          | Default (new accounts)   |
| seed   | 🌱    | 10         | GitHub engagement        |
| flower | 🌸    | 15         | Contributed code/project |
| nectar | 🍯    | 20         | Strategic partners       |
| router | 🔌    | 100        | Infrastructure partners  |

### Quick Tier Update

```bash
cd enter.pollinations.ai

# 1. Find user
npx wrangler d1 execute DB --remote --env production \
  --command "SELECT github_username, email, tier FROM user WHERE LOWER(github_username) LIKE '%USERNAME%';"

# 2. Update DB tier
npx wrangler d1 execute DB --remote --env production \
  --command "UPDATE user SET tier='flower' WHERE github_username='USERNAME';"

# 3. Update Polar subscription
export POLAR_ACCESS_TOKEN=$(sops -d secrets/prod.vars.json | grep POLAR_ACCESS_TOKEN | cut -d'"' -f4)
npx tsx scripts/manage-polar.ts user update-tier --email USER@EMAIL.COM --tier flower
```

### Evaluate User for Upgrade

**Flower tier** (any ONE qualifies):

- Has commits: `gh api 'search/commits?q=repo:pollinations/pollinations+author:USERNAME' --jq '.total_count'`
- Has project: `grep -ri "author.*USERNAME" pollinations.ai/src/config/projects/`

**Seed tier** (any ONE qualifies):

- Issue involvement: `gh api 'search/issues?q=repo:pollinations/pollinations+involves:USERNAME' --jq '.total_count'`
- Starred repo: `.claude/skills/tier-management/fetch-stargazers.sh USERNAME`

### Notes

- **DB tier** = what user CAN activate
- **Polar subscription** = what user HAS activated
- If no Polar subscription, user must click "Activate" at enter.pollinations.ai
