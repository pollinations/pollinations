# Agent Guidelines for pollinations.ai

**pollinations.ai** — plataforma open-source de IA generativa (Berlín) que provee APIs unificadas de texto, imagen, video, audio y voz en tiempo real. Sirve ~2.2M req/día a 40K+ usuarios y 500+ proyectos comunitarios. Procesa ~280M req/mes, con ~1,340 RPM en texto y ~441 img/min en imagen/video.

---

## 🏗️ Estructura del Monorepo

```
pollinations/                          # npm workspaces (raíz)
├── enter.pollinations.ai/             # API Gateway — auth, billing, D1 SQLite, TinyBird
│   ├── src/                           # Hono + Cloudflare Worker + Vite SPA
│   ├── frontend/                      # React SPA (Vite, TanStack Router)
│   ├── secrets/                       # Cifrado SOPS+AGE (dev/staging/prod)
│   └── observability/                 # Pipes TinyBird (ClickHouse)
├── gen.pollinations.ai/               # Edge Router — texto, imagen, video, audio
│   ├── src/
│   │   ├── image/                     # Handlers + dispatch a GPUs (Vast/io.net/Modal)
│   │   ├── text/                      # Portkey multi-provider (25+ modelos)
│   │   │   └── configs/
│   │   │       ├── modelConfigs.ts    # Config de modelos de texto
│   │   │       └── providerConfigs.ts # Config de providers
│   │   └── audio/                     # TTS (ElevenLabs) y música (Suno)
│   └── scripts/                       # Push secrets, seed, generación de API docs
├── pollinations.ai/                   # Frontend principal (React 18 + Vite + Tailwind 3)
├── packages/
│   ├── sdk/                           # @pollinations/sdk — cliente JS + React hooks
│   ├── ui/                            # @pollinations/ui — componentes compartidos
│   ├── mcp/                           # @pollinations/mcp — servidor MCP stdio
│   └── polli-cli/                     # @pollinations/cli — CLI (Commander + chalk + keytar)
├── shared/                            # Código compartido entre servicios
│   ├── registry/                      # Registros de modelos (text, image, audio, embeddings, realtime)
│   │   ├── model-info.ts              # Metadatos de modelos
│   │   ├── price-helpers.ts           # Helper de precios
│   │   ├── usage-headers.ts           # Headers de uso
│   │   └── registry.ts                # Registro central
│   ├── db/                            # Esquemas Drizzle ORM + better-auth
│   ├── auth/                          # Lógica de autenticación
│   └── ip-queue/                      # Rate-limiting por IP (Durable Objects)
├── apps/                              # Apps comunitarias + APPS.md (source of truth)
├── social/                            # Automatización Discord/Reddit/GitHub
├── tools/                             # Utilidades (icons, scripts SOPS, rotación)
├── assets/                            # Assets estáticos (logos, imágenes)
├── docs/                              # Documentación adicional
├── scripts/                           # Scripts CI/extra
├── media.pollinations.ai/             # Almacenamiento multimedia (SHA-256, 10 MB)
├── pollinations-myceli-proxy/         # Proxy myceli (experimental)
├── APIDOCS.md                         # Documentación OpenAPI 3.1 (1496 líneas)
├── DEVELOP.md                         # Guía de desarrollo + diagramas arquitectura
├── CONTRIBUTING.md                    # Guía de contribución
└── biome.jsonc                        # Config Biome (indent 4, comillas dobles)
```

### Servicios Cloudflare Workers

| Servicio | Paquete | Puerto | Propósito |
|---|---|---|---|
| **enter** | `pollinations-enter` | 3000 | Gateway auth + billing + D1 + TinyBird |
| **gen** | `pollinations-gen` | 8788 | Router edge texto/imagen/video/audio |
| **media** | `pollinations-media` | - | Upload SHA-256 (10 MB máx) |
| **frontend** | `pollinations.ai` | - | React SPA (Vite + Cloudflare) |
| **portkey** | `portkey-gateway` | - | Proxy de texto vía Portkey |

### Infraestructura

| Recurso | Detalle |
|---|---|
| **Cloudflare Workers** | CDN, WAF, DDoS — ~280M req/mes |
| **D1 (SQLite)** | 40K usuarios, auth, keys, balances |
| **KV** | Stats, deduplicación |
| **R2** | 48 TB, 4 buckets (images, text, media, cache) |
| **Durable Objects** | `PollenRateLimiter` — 10K req/10s por IP |
| **TinyBird (ClickHouse)** | 10 tablas, 18 pipes API |
| **Pagos** | Stripe (packs), Polar (suscripciones), NOWPay (crypto) |
| **Secrets** | SOPS + AGE — 28 secretos en `**/secrets/*.json` |
| **CI/CD** | 29 workflows GitHub Actions (5 deploys, 7 crons) |

### GPU Self-Hosted

| Proveedor | Hardware | Modelos |
|---|---|---|
| **Vast.ai** | ~11× RTX 5090, 4 instancias | Flux Schnell, Z-Image, Sana 0.6B |
| **io.net** | 8 workers, 5 VMs, 2 GPUs c/u | 4× Flux, 4× Z-Image |
| **Modal** | H200 serverless | Klein (Flux 4B), LTX-2 Video |

---

## 🔐 API Gateway

**Endpoint principal**: `https://gen.pollinations.ai` → deriva a `enter.pollinations.ai` para auth/billing.

### Tipos de Key

| Key | Prefijo | Uso | Rate Limits | Estado |
|---|---|---|---|---|
| Publishable | `pk_` | Client-side, demos, prototipos | 1 pollen/IP/hora | ⚠️ Beta |
| Secret | `sk_` | Server-side | Sin rate limits | Stable |

### Endpoints Rápidos

```bash
# Imagen
curl "https://gen.pollinations.ai/image/prompt" -H "Authorization: Bearer $KEY"

# Texto (OpenAI-compat)
curl -X POST "https://gen.pollinations.ai/v1/chat/completions" \
  -H "Authorization: Bearer $KEY" \
  -d '{"model":"openai","messages":[{"role":"user","content":"Hello"}]}'

# Texto simple (GET)
curl "https://gen.pollinations.ai/text/Hello?key=$KEY"

# Audio TTS
curl "https://gen.pollinations.ai/audio/Hola?voice=nova&key=$KEY" -o speech.mp3

# Modelos (sin auth)
curl "https://gen.pollinations.ai/v1/models"
curl "https://gen.pollinations.ai/image/models"
curl "https://gen.pollinations.ai/v1/models/status"   # Health check (cached 60s)
```

Documentación completa: `APIDOCS.md` (~1500 líneas, OpenAPI 3.1).

### Autenticación

- Header: `Authorization: Bearer <key>`
- Query param (GET): `?key=<key>`
- Endpoints públicos: `GET /{hash}`, `GET /v1/models`, `GET /image/models`
- `401` = key missing/invalid · `402` = budget exhausted

---

## 🚀 Desarrollo Local

### Prerrequisitos

- Node.js >= 20
- [SOPS](https://github.com/getsops/sops) + [age](https://github.com/FiloSottile/age)
- Wrangler (`npx wrangler`)
- `SOPS_AGE_KEY_FILE` apuntando a `$HOME/.config/sops/age/keys.txt`

### Comandos

```bash
# Instalar todo
npm run install:all

# Descifrar vars de entorno
cd enter.pollinations.ai && sops --output-type dotenv decrypt secrets/dev.vars.json > .dev.vars
cd gen.pollinations.ai && sops --output-type dotenv decrypt secrets/env.json > .env

# Desarrollo concurrente (enter:3000 + gen:8788)
npm run dev

# Servicios individuales
npm run dev:enter     # → localhost:3000 (API en /api/*)
npm run dev:gen       # → localhost:8788

# Construir SDK + UI (necesario antes del dev)
npm run build:sdk

# Testing
npm run test          # en cada workspace
npx vitest run --testNamePattern="nombre"
npx vitest run test/archivo.test.ts

# Linting/Formato
npx biome check --write <archivo>
npm run format:changed   # solo archivos modificados vs origin/main
```

### API Test Local

```bash
curl "http://localhost:8788/image/test?model=flux" -H "Authorization: Bearer $TOKEN"
curl "http://localhost:8788/v1/chat/completions" -H "Authorization: Bearer $TOKEN" ...
```

### Testing por Servicio

| Servicio | Comando | Toolstack |
|---|---|---|
| `enter.pollinations.ai` | `npm run test` | Vitest + CF Workers pool + VCR snapshots |
| `gen.pollinations.ai` | `npm run test` | Vitest + CF Workers pool |
| `image.pollinations.ai` | `npm run test` | Vitest |
| `packages/sdk` | `npm run test` | Vitest |
| `packages/polli-cli` | `npm run test` | Vitest |

**Reglas de testing:**
- **Snapshots (enter)**: VCR-style, modo `replay-or-record` por defecto. Usar `TEST_VCR_MODE=record` para grabar nuevos.
- **Sin mocks**: Testear código real con imports directos. No crear infraestructura mock.
- **API keys de test**: `enter.pollinations.ai/.testingtokens`
- **Producción**: Tests contra `gen.pollinations.ai` real.
- Ejecutar `npm run decrypt-vars` antes de tests en `enter.pollinations.ai`.

---

## 📦 Paquetes Publicados (npm)

| Paquete | Versión | Descripción | Instalación |
|---|---|---|---|
| `@pollinations/sdk` | 5.1.0-alpha.1 | SDK JS/TS + React hooks | `npm i @pollinations/sdk` |
| `@pollinations/mcp` | 2.3.0 | Servidor MCP (stdio) | `npx @pollinations/mcp` |
| `@pollinations/cli` | 0.1.6 | CLI (`polli`) | `npx @pollinations/cli` |

---

## 🧠 Registro de Modelos (`shared/registry/`)

| Archivo | Propósito |
|---|---|
| `text.ts` | Modelos de texto (OpenAI, Claude, Gemini, DeepSeek, etc.) |
| `image.ts` | Modelos de imagen (Flux, GPT Image, Seedream, Kontext, etc.) |
| `audio.ts` | Modelos de audio (ElevenLabs v3, Suno v4) |
| `embeddings.ts` | Modelos de embeddings |
| `realtime.ts` | Modelos de voz en tiempo real |
| `model-info.ts` | Metadatos compartidos |
| `price-helpers.ts` | Helper de precios |
| `usage-headers.ts` | Headers HTTP de uso |

### Añadir Modelo de Texto

1. Config en `gen.pollinations.ai/src/text/configs/modelConfigs.ts`
2. Entry en `gen.pollinations.ai/src/text/availableModels.ts`
3. Provider config en `gen.pollinations.ai/src/text/configs/providerConfigs.ts`

### Añadir Modelo de Imagen

1. Handler en `gen.pollinations.ai/src/image/`
2. Registrar en `shared/registry/image.ts`

Siempre actualizar `APIDOCS.md` + registros al agregar modelos.

---

## 🎨 Convenciones de Código

### Estilo

- **JS/TS moderno**: ES modules (todos los `.js` son ESM)
- **TypeScript**: Strict mode, tipos significativos, evitar `any`
- **Formatter**: Biome (indentación 4 espacios, comillas dobles, `quoteProperties: preserve`)
- **Ejecutar** `npx biome check --write <archivo>` antes de commits
- **CI**: Biome verifica automáticamente en `biome-check.yml`

### Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new image model
fix: resolve timeout in audio streaming
docs: update API endpoint references
refactor: extract auth middleware
```

### ⚠️ YAGNI — Crítico

- Solo implementar lo necesario. Eliminar funciones no usadas.
- Sin abstracciones especulativas, helpers "por si acaso", wrappers preemptivos.
- Sin fallbacks de backward-compat — mejor romper limpio que inflar.
- Al cambiar tokens/headers/APIs, actualizar **todos** los consumidores simultáneamente.
- "Keep it simple" = una función, un precio, una config.

### Errores Comunes a Evitar

- ❌ No usar `cd` en bash → usar `cwd` parameter
- ❌ No ejecutar `pytest` → usar `npm run test` o `npx vitest run`
- ❌ No crear `.md` docs a menos que se solicite
- ❌ No modificar tests para que pasen → arreglar el código
- ❌ No exponer `sk_` keys en cliente, repos o URLs públicas
- ❌ No force-push sin lease
- ❌ No crear labels ad-hoc en GitHub; verificar labels existentes primero
- ✅ Siempre usar rutas absolutas
- ✅ Confirmar branch con `git branch --show-current`
- ✅ Ejecutar `npm run decrypt-vars` antes de tests en enter
- ✅ Request PR reviews incluyendo `polly` en un comentario

### Comunicación

- PRs/Issues: bullets, <200 palabras, sin relleno.
- PRs: `- Adds X`, `- Fix Y`; títulos `fix:`/`feat:`/`Add`; sin marketing.
- Code reviews: señalar qué mejorar, enlazar líneas específicas.
- PR descriptions: incluir `Fixes #issue` cuando corresponda.

---

## 🔄 Flujo de Trabajo Git

```bash
# Verificar estado
git branch --show-current
git status && git diff HEAD && git log -n 3

# Pre-commit
npx biome check --write <archivos>

# Commits con atribución
git add -A && git commit -m "feat: descripción

Co-authored-by: username <user_id+username@users.noreply.github.com>
Fixes #issue"
```

- **"send to git"** = status → diff → branch → commit all → push → PR description
- Evitar force pushes (`--force`, `--force-with-lease`) — preferir follow-up commits
- Si PR ya merged, abrir nueva rama/PR para follow-ups

---

## 🐦 Tinybird — Despliegue Seguro

**CRÍTICO** — Siempre que se despliegue a Tinybird:

1. **Dos workspaces**: `pollinations_enter` (prod) y `pollinations_enter_staging` (staging/dev)
2. **Staging primero**: desplegar, verificar, luego prod
3. `tb --cloud deploy --wait` (default = prod; override con `TB_TOKEN=<staging_admin_token>`)
4. Validar con `tb --cloud deploy --check --wait` primero
5. **Nunca** `--allow-destructive-operations` sin permiso explícito
6. **Nunca** `tb push` (deprecated) — usar `tb --cloud deploy --wait`
7. Ejecutar desde `enter.pollinations.ai/observability`
8. Verificar consumidores dentro del mismo workspace antes de modificar un pipe
9. Para rangos grandes: usar `start_date` semana por semana

---

## 🎯 Submisión de Apps (TIER-APP)

**Flujo**: issue con `TIER-APP` → workflow valida + AI genera preview → bot postea `APP_REVIEW_DATA` JSON + label `TIER-APP-REVIEW` → maintainer agrega `TIER-APP-APPROVED` → workflow añade fila a `apps/APPS.md`, abre PR con auto-merge, cierra issue con `Fixes #NNN`.

**Labels**: `TIER-APP` → `TIER-APP-REVIEW` → `TIER-APP-APPROVED` | `TIER-APP-REJECTED` | `TIER-APP-INCOMPLETE`

**Source of truth**: `apps/APPS.md`. Ediciones manuales → editar `apps/APPS.md`, ejecutar `node .github/scripts/app-update-greenhouse.js`.

**Columnas**: `Emoji | Name | Web_URL | Description (~80 chars) | Language (ISO code) | Category | Platform | GitHub (@user) | GitHub_ID | Repo | Stars (⭐N) | Discord | Other | Submitted_Date | Issue_URL (#N) | Approved_Date`

**Plataformas** (auto-detectadas): `web`, `android`, `ios`, `windows`, `macos`, `desktop`, `cli`, `discord`, `telegram`, `whatsapp`, `library`, `browser-ext`, `roblox`, `wordpress`, `api`

**Categorías**: `image`, `video_audio`, `writing`, `chat`, `games`, `learn`, `bots`, `build`, `business`

---

## 📋 GitHub Actions — Workflows Clave

| Workflow | Propósito |
|---|---|
| `deploy-enter-cloudflare.yml` | Deploy enter.pollinations.ai |
| `deploy-gen-cloudflare.yml` | Deploy gen.pollinations.ai |
| `deploy-media-cloudflare.yml` | Deploy media.pollinations.ai |
| `deploy-pollinations-ai-cloudflare.yml` | Deploy frontend pollinations.ai |
| `deploy-portkey-gateway.yml` | Deploy portkey gateway |
| `deploy-polly-bot.yml` | Deploy Polly bot |
| `publish-packages.yml` | Publicar paquetes npm |
| `app-review-submission.yml` | Review de apps comunitarias |
| `biome-check.yml` | Linting/format checking |
| `codeql.yml` | CodeQL security analysis |
| `d1-tinybird-sync.yml` | Sincronizar D1 → TinyBird |
| `docs-regenerate-apidocs.yml` | Regenerar APIDOCS.md |
| `readme-daily-update.yml` | Actualizar README diario |
| `issue-polly-auto-fix.yml` | Auto-fix de issues con Polly |
| `tier-progression-spore-to-seed.yml` | Progresión de tiers |

---

## 🤖 Discord

Guild ID: `885844321461485618` — https://discord.gg/pollinations-ai-885844321461485618

---

## 💾 Compact Instructions

Preservar durante compactación:
- Archivos modificados + números de línea
- Todos los diffs/detalles de implementación
- Output de tests + errores + resultados de comandos
- Plan completo + progreso + pendientes
- Preferencias/correcciones del usuario esta sesión
- Decisiones arquitectónicas + rationale

---

## 📜 Licencia

MIT — Ver `LICENSE`.

---

*Última actualización: 2026-06-29 | Próxima revisión: 2026-07-29*
