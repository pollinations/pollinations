/** Polly's knowledge base — everything an AI agent needs to know about Pollinations */
export const POLLINATIONS_KNOWLEDGE = `# Pollinations.AI Platform Reference

## Architecture
gen.pollinations.ai → enter.pollinations.ai (auth/billing) → text.|image.pollinations.ai (backends)
Repo: pollinations/pollinations (main branch) | Discord: guild 885844321461485618
Docs: https://enter.pollinations.ai/api/docs

## API — gen.pollinations.ai (the ONLY public endpoint)

All requests require an API key via Authorization: Bearer <key> or ?key=<key>
Get keys at: https://enter.pollinations.ai

### Endpoints
- POST /v1/chat/completions — OpenAI-compatible text generation (RECOMMENDED)
- GET /text/{prompt} — Simple text generation
- GET /image/{prompt} — Image generation
- GET /audio/{text} — Text-to-speech
- GET /v1/models — List text models
- GET /image/models — List image models (with pricing)
- GET /text/models — List text models (with pricing)

### Account Endpoints (auth required)
- GET /account/balance — Pollen balance
- GET /account/profile — User profile
- GET /account/usage — Usage history

## Models

### Text (default: openai)
openai, openai-fast, openai-large, claude-fast, claude, claude-large, gemini-fast, gemini, gemini-large, deepseek, grok, mistral, qwen-coder, kimi, glm, minimax, perplexity-fast, perplexity-reasoning, openai-audio, nova-fast, gemini-search

### Image (default: flux)
flux, zimage, gptimage, gptimage-large, klein, imagen-4, grok-imagine, kontext, nanobanana, nanobanana-pro, seedream5

### Video
seedance, seedance-pro, veo, wan, ltx-2, grok-video

### Audio
TTS voices: alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse (OpenAI-compat)
ElevenLabs: rachel, domi, bella, adam, antoni, josh, sam, daniel, charlie

## Tiers (must progress in order)
Microbe → Spore → Seed → Flower → Nectar → Router
Pollen amounts and cadence change — use \`polli tier roadmap\` or fetch live from:
https://raw.githubusercontent.com/pollinations/pollinations/main/enter.pollinations.ai/src/tier-config.ts
- Spore: log in at enter.pollinations.ai
- Seed: auto (age + activity + commits)
- Flower: submit app OR merged PR (requires Seed)
- Nectar: significant contributions (requires Flower)

## Auth & Keys
- pk_ (publishable, 16ch): client-side, rate-limited
- sk_ (secret, 32ch): server-only, no rate limits
- Per-key features: model restrictions, pollen budget cap, expiry

## Pricing
$1 = 1 Pollen | BETA: 2x on Stripe ($5=10 pollen)
Cached responses: FREE (x-cache: HIT header)

## SDK & MCP
- SDK: npm i @pollinations_ai/sdk
- MCP: npx @pollinations_ai/mcp
- CLI: npx @pollinations_ai/cli

## BYOP (Bring Your Own Pollen)
App redirects user to: enter.pollinations.ai/authorize?redirect_url=<url>&models=<csv>&budget=<n>&expiry=<days>
User auths with GitHub → redirect back with #api_key=sk_... in URL fragment. Developer pays $0.

## Image Params
width, height (default 1024), seed, model, enhance, negative_prompt, safe, quality, image (ref URL), transparent, guidance_scale, nofeed/private

## Monorepo Structure
enter.pollinations.ai/ (CF Worker gateway)
text.pollinations.ai/ (Express+Portkey)
image.pollinations.ai/ (Node+GPU)
packages/sdk/, packages/mcp/
shared/registry/ (model source of truth)
pollinations.ai/ (React frontend)
apps/ (community apps)
`;
