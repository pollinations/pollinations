# Agent Guidelines for pollinations.ai

**pollinations.ai** — Open-source generative AI platform (Berlin) providing unified APIs for text, image, video, audio, and real-time voice. Serves ~2.2M requests/day to 40K+ users and 500+ community projects. Processes ~280M requests/month, with ~1,340 RPM for text and ~441 images/min for image/video.

---

## 🏗️ Monorepo Structure

```
pollinations/ # npm workspaces (root)
├── enter.pollinations.ai/ # API Gateway — auth, billing, D1 SQLite, TinyBird
│ ├── src/ # Hono + Cloudflare Worker + Vite SPA
│ ├── frontend/ # React SPA (Vite, TanStack Router)
│ ├── secrets/ # Encrypted SOPS+AGE (dev/staging/prod)
│ └── observability/ # TinyBird Pipes (ClickHouse)
├── gen.pollinations.ai/ # Edge Router — text, image, video, audio
│ ├── src/
│ │ ├── image/ # Handlers + dispatch to GPUs (Vast/io.net/Modal)
│ │ ├── text/ # Portkey multi-provider (25+ models)
│ │ │ └── configs/
│ │ │ ├── modelConfigs.ts # Text model configurations
│ │ │ └── providerConfigs.ts # Provider configurations
│ │ └── audio/ # TTS (ElevenLabs) and music (Suno)
│ └── scripts/ # Push secrets, seed, API docs generation
├── pollinations.ai/ # Main frontend (React 18 + Vite + Tailwind 3)
├── packages/
│ ├── sdk/ # @pollinations/sdk — JS client + React hooks
│ ├── ui/ # @pollinations/ui — Shared components
│ ├── mcp/ # @pollinations/mcp — MCP stdio server
│ └── polli-cli/ # @pollinations/cli — CLI (Commander + chalk + keytar)
├── shared/ # Shared code across services
│ ├── registry/ # Model registries (text, image, audio, embeddings, realtime)
│ │ ├── model-info.ts # Model metadata
│ │ ├── price-helpers.ts # Price helpers
│ │ ├── usage-headers.ts # Usage headers
│ │ └── registry.ts # Central registry
│ ├── db/ # Drizzle ORM schemas + better-auth
│ ├── auth/ # Authentication logic
│ └── ip-queue/ # Rate-limiting by IP (Durable Objects)
├── apps/ # Community apps + APPS.md (source of truth)
├── social/ # Discord/Reddit/GitHub automation
├── tools/ # Utilities (icons, SOPS scripts, rotation)
├── assets/ # Static assets (logos, images)
├── docs/ # Additional documentation
├── scripts/ # CI/extra scripts
├── media.pollinations.ai/ # Media storage (SHA-256, 10 MB max)
├── pollinations-myceli-proxy/ # Myceli proxy (experimental)
├── APIDOCS.md # OpenAPI 3.1 documentation (1496 lines)
├── DEVELOP.md # Development guide + architecture diagrams
├── CONTRIBUTING.md # Contribution guide
└── biome.jsonc # Biome config (indent 4, double quotes)
```

### Cloudflare Workers Services

| Service | Package | Port | Purpose |
|---|---|---|---|
| **enter** | `pollinations-enter` | 3000 | Gateway auth + billing + D1 + TinyBird |
| **gen** | `pollinations-gen` | 8788 | Edge router for text/image/video/audio |
| **media** | `pollinations-media` | - | SHA-256 upload (10 MB max) |
| **frontend** | `pollinations.ai` | - | React SPA (Vite + Cloudflare) |
| **portkey** | `portkey-gateway` | - | Text proxy via Portkey |

### Infrastructure

| Resource | Detail |
|---|---|
| **Cloudflare Workers** | CDN, WAF, DDoS — ~280M req/month |
| **D1 (SQLite)** | 40K users, auth, keys, balances |
| **KV** | Stats, deduplication |
| **R2** | 48 TB, 4 buckets (images, text, media, cache) |
| **Durable Objects** | `PollenRateLimiter` — 10K req/10s per IP |
| **TinyBird (ClickHouse)** | 10 tables, 18 API pipes |
| **Payments** | Stripe (packs), Polar (subscriptions), NOWPay (crypto) |
| **Secrets** | SOPS + AGE — 28 secrets in `**/secrets/*.json` |
| **CI/CD** | 29 GitHub Actions workflows (5 deploys, 7 crons) |

### GPU Self-Hosted

| Provider | Hardware | Models |
|---|---|---|
| **Vast.ai** | ~11× RTX 5090, 4 instances | Flux Schnell, Z-Image, Sana 0.6B |
| **io.net** | 8 workers, 5 VMs, 2 GPUs each | 4× Flux, 4× Z-Image |
| **Modal** | H200 serverless | Klein (Flux 4B), LTX-2 Video |

---

## 🔐 API Gateway

**Primary endpoint**: `https://gen.pollinations.ai` → routes to `enter.pollinations.ai` for auth/billing.

### Key Types

| Key | Prefix | Usage | Rate Limits | Status |
|---|---|---|---|---|
| Publishable | `pk_` | Client-side, demos, prototypes | 1 pollen/IP/hour | ⚠️ Beta |
| Secret | `sk_` | Server-side | No rate limits | Stable |

### Quick Endpoints

```bash
# Image
curl "https://gen.pollinations.ai/image/prompt" -H "Authorization: Bearer $KEY"

# Text (OpenAI-compatible)
curl -X POST "https://gen.pollinations.ai/v1/chat/completions" \
  -H "Authorization: Bearer $KEY" \
  -d '{"model":"openai","messages":[{"role":"user","content":"Hello"}]}'

# Simple text (GET)
curl "https://gen.pollinations.ai/text/Hello?key=$KEY"

# Audio TTS
curl "https://gen.pollinations.ai/audio/Hello?voice=nova&key=$KEY" -o speech.mp3

# Models (no auth)
curl "https://gen.pollinations.ai/v1/models"
curl "https://gen.pollinations.ai/image/models"
curl "https://gen.pollinations.ai/v1/models/status"

# Health check (cached 60s)
```

Full documentation: `APIDOCS.md` (~1500 lines, OpenAPI 3.1).

### Authentication

- Header: `Authorization: Bearer <key>`
- Query param (GET): `?key=<key>`
- Public endpoints: `GET /{hash}`, `GET /v1/models`, `GET /image/models`
- `401` = key missing/invalid
- `402` = budget exhausted

---

## 🚀 Local Development

### Prerequisites

- Node.js >= 20
- [SOPS](https://github.com/getsops/sops) + [age](https://github.com/FiloSottile/age)
- Wrangler (`npx wrangler`)
- `SOPS_AGE_KEY_FILE` pointing to `$HOME/.config/sops/age/keys.txt`

### Commands

```bash
# Install all
npm run install:all

# Decrypt env vars
cd enter.pollinations.ai && sops --output-type dotenv decrypt secrets/dev.vars.json > .dev.vars
cd gen.pollinations.ai && sops --output-type dotenv decrypt secrets/env.json > .env

# Concurrent development (enter:3000 + gen:8788)
npm run dev

# Individual services
npm run dev:enter  # → localhost:3000 (API at /api/*)
npm run dev:gen    # → localhost:8788

# Build SDK + UI (required before dev)
npm run build:sdk

# Testing
npm run test
# In each workspace
npx vitest run --testNamePattern="name"
npx vitest run test/file.test.ts

# Linting/Format
npx biome check --write <file>
npm run format:changed  # Only modified files vs origin/main
```

### Local API Tests

```bash
curl "http://localhost:8788/image/test?model=flux" -H "Authorization: Bearer $TOKEN"
curl "http://localhost:8788/v1/chat/completions" -H "Authorization: Bearer $TOKEN"
```

### Testing by Service

| Service | Command | Toolstack |
|---|---|---|
| `enter.pollinations.ai` | `npm run test` | Vitest + CF Workers pool + VCR snapshots |
| `gen.pollinations.ai` | `npm run test` | Vitest + CF Workers pool |
| `image.pollinations.ai` | `npm run test` | Vitest |
| `packages/sdk` | `npm run test` | Vitest |
| `packages/polli-cli` | `npm run test` | Vitest |

**Testing Rules:**
- **Snapshots (enter)**: VCR-style, default `replay-or-record` mode. Use `TEST_VCR_MODE=record` to record new ones.
- **No mocks**: Test real code with direct imports. Do not create mock infrastructure.
- **Test API keys**: `enter.pollinations.ai/.testingtokens`
- **Production**: Tests against real `gen.pollinations.ai`.
- Run `npm run decrypt-vars` before tests in `enter.pollinations.ai`.

---

## 📦 Published Packages (npm)

| Package | Version | Description | Installation |
|---|---|---|---|
| `@pollinations/sdk` | 5.1.0-alpha.1 | JS/TS SDK + React hooks | `npm i @pollinations/sdk` |
| `@pollinations/mcp` | 2.3.0 | MCP server (stdio) | `npx @pollinations/mcp` |
| `@pollinations/cli` | 0.1.6 | CLI (`polli`) | `npx @pollinations/cli` |

---

## 🧠 Model Registry (`shared/registry/`)

| File | Purpose |
|---|---|
| `text.ts` | Text models (OpenAI, Claude, Gemini, DeepSeek, etc.) |
| `image.ts` | Image models (Flux, GPT Image, Seedream, Kontext, etc.) |
| `audio.ts` | Audio models (ElevenLabs v3, Suno v4) |
| `embeddings.ts` | Embedding models |
| `realtime.ts` | Real-time voice models |
| `model-info.ts` | Shared metadata |
| `price-helpers.ts` | Price helpers |
| `usage-headers.ts` | HTTP usage headers |

### Adding a Text Model

1. Config in `gen.pollinations.ai/src/text/configs/modelConfigs.ts`
2. Entry in `gen.pollinations.ai/src/text/availableModels.ts`
3. Provider config in `gen.pollinations.ai/src/text/configs/providerConfigs.ts`

### Adding an Image Model

1. Handler in `gen.pollinations.ai/src/image/`
2. Register in `shared/registry/image.ts`

Always update `APIDOCS.md` + registries when adding models.

---

## 🎨 Code Conventions

### Style

- **Modern JS/TS**: ES modules (all `.js` files are ESM)
- **TypeScript**: Strict mode, meaningful types, avoid `any`
- **Formatter**: Biome (4-space indentation, double quotes, `quoteProperties: preserve`)
- **Run** `npx biome check --write <file>` after edits and before commits
- **CI**: Biome automatically checks in `biome-check.yml`

### Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new image model
fix: resolve timeout in audio streaming
docs: update API endpoint references
refactor: extract auth middleware
```

### ⚠️ YAGNI — Critical

**Follow YAGNI religiously:**
- Only implement what is needed now. Remove unused functions.
- No speculative abstractions, "just in case" helpers, preemptive test utils/wrappers.
- No backward-compat fallbacks — clean breaks beat bloat.
- When changing tokens/headers/APIs, update **all** consumers simultaneously.
- "Keep it simple" = one function, one price, one config. Simplest thing that works.

### Common Mistakes to Avoid

- ❌ Don't use `cd` in bash → use `cwd` parameter
- ❌ Don't run `pytest` → use `npm run test` or `npx vitest run`
- ❌ Don't create `.md` docs unless requested
- ❌ Don't modify tests to make them pass → fix the code
- ❌ Don't expose `sk_` keys in client, repos, or public URLs
- ❌ Don't force-push without lease
- ❌ Don't create ad-hoc labels in GitHub; verify existing labels first
- ✅ Always use absolute paths
- ✅ Confirm branch with `git branch --show-current`
- ✅ Run `npm run decrypt-vars` before tests in enter
- ✅ Request PR reviews by including `polly` in a comment

### Communication

- PRs/Issues: bullets, <200 words, no fluff.
- PRs: `- Adds X`, `- Fix Y`; titles `fix:`/`feat:`/`Add`; no marketing.
- Code reviews: point out what needs improving; link specific lines.
- PR descriptions: include `Fixes #issue` when applicable.

---

## 🔄 Git Workflow

```bash
# Check status
git branch --show-current
git status && git diff HEAD && git log -n 3

# Pre-commit
npx biome check --write <files>

# Commits with attribution
git add -A && git commit -m "feat: description

Co-authored-by: username <user_id+username@users.noreply.github.com>
Fixes #issue"
```

- **"send to git"** = status → diff → branch → commit all → push → PR description
- Avoid force pushes (`--force`, `--force-with-lease`) — prefer follow-up commits
- If PR already merged, open a new branch/PR for follow-ups

---

## 🐦 Tinybird — Safe Deployment

**CRITICAL — These rules apply whenever deploying to Tinybird:**

1. **Two workspaces**: `pollinations_enter` (prod) and `pollinations_enter_staging` (staging/dev/local). Pipes and datasources must be deployed to **both** — no CI auto-deploy yet, tracked in #11127.
2. **Staging first**: deploy, verify, then prod.
3. `tb --cloud deploy --wait` (default = prod; override with `TB_TOKEN=<staging_admin_token>` for staging).
4. Validate first: `tb --cloud deploy --check --wait` (against both workspaces if either schema is in doubt).
5. **Never** `--allow-destructive-operations` without explicit permission.
6. **Never** `tb push` (deprecated) — use `tb --cloud deploy --wait`.
7. Run from `enter.pollinations.ai/observability`.
8. Verify all consumers within a workspace before modifying a pipe (pipes are NOT cross-workspace; each workspace has its own copy).
9. For large time ranges: use `start_date` parameter week-by-week.

---

## 🎯 App Submission (TIER-APP)

**Flow**: issue with `TIER-APP` → workflow validates + AI generates preview → bot posts `APP_REVIEW_DATA` JSON + labels `TIER-APP-REVIEW` → maintainer adds `TIER-APP-APPROVED` → workflow prepends row to `apps/APPS.md`, opens PR with auto-merge, closes issue via `Fixes #NNN`.

**Labels**: `TIER-APP` → `TIER-APP-REVIEW` → `TIER-APP-APPROVED` | `TIER-APP-REJECTED` | `TIER-APP-INCOMPLETE`

**Source of truth**: `apps/APPS.md`. Manual edits: edit `apps/APPS.md`, run `node .github/scripts/app-update-greenhouse.js`.

**Columns**: `Emoji | Name | Web_URL | Description (~80 chars) | Language (ISO code, no flags) | Category | Platform | GitHub (@user) | GitHub_ID | Repo | Stars (⭐N) | Discord | Other | Submitted_Date (issue created) | Issue_URL (#N) | Approved_Date (PR merged)`.

**Platforms** (auto-detected; comma-separated for multi): `web` (default w/ URL), `android`, `ios` (App Store or routinehub.co), `windows`, `macos`, `desktop` (cross-platform), `cli`, `discord`, `telegram`, `whatsapp`, `library` (npm/PyPI/SDK), `browser-ext`, `roblox`, `wordpress`, `api` (default w/o URL).

**Categories**: `image`, `video_audio`, `writing`, `chat`, `games`, `learn`, `bots`, `build`, `business`.

---

## 📋 GitHub Actions — Key Workflows

| Workflow | Purpose |
|---|---|
| `deploy-enter-cloudflare.yml` | Deploy enter.pollinations.ai |
| `deploy-gen-cloudflare.yml` | Deploy gen.pollinations.ai |
| `deploy-media-cloudflare.yml` | Deploy media.pollinations.ai |
| `deploy-pollinations-ai-cloudflare.yml` | Deploy frontend pollinations.ai |
| `deploy-portkey-gateway.yml` | Deploy portkey gateway |
| `deploy-polly-bot.yml` | Deploy Polly bot |
| `publish-packages.yml` | Publish npm packages |
| `app-review-submission.yml` | Community apps review |
| `biome-check.yml` | Linting/format checking |
| `codeql.yml` | CodeQL security analysis |
| `d1-tinybird-sync.yml` | Sync D1 → TinyBird |
| `docs-regenerate-apidocs.yml` | Regenerate APIDOCS.md |
| `readme-daily-update.yml` | Daily README update |
| `issue-polly-auto-fix.yml` | Auto-fix issues with Polly |
| `tier-progression-spore-to-seed.yml` | Tier progression |

---

## 🤖 Discord

Guild ID: `885844321461485618` — https://discord.gg/pollinations-ai-885844321461485618

---

## 💾 Compact Instructions

Preserve during compaction:
- Modified files + line numbers
- All diffs/implementation details
- Test output + errors + command results
- Full plan + progress + pending
- User preferences/corrections this session
- Architectural decisions + rationale

---

## 📜 License

MIT — See `LICENSE`.

---
*Last updated: 2026-07-02 | Next review: 2026-08-02*
