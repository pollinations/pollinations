# Open WebUI on Cloudflare Containers

Hosted [Open WebUI](https://github.com/open-webui/open-webui) with Pollinations
as its **only** login provider. Users sign in with their Pollinations account;
the consent screen mints a budgeted `sk_` which Open WebUI forwards to
`gen.pollinations.ai` per user (`auth_type: system_oauth`), so every chat is
paid from the signed-in user's own wallet.

- Public: https://openwebui.pollinations.ai (origin https://openwebui.myceli.ai)
- Staging: https://openwebui-staging.elliot-b6e.workers.dev
- Login: OAuth 2.1 code + PKCE against the environment's Enter URL. Public
  client, no secret. Discovery is the RFC 8414 document; Pollinations serves no
  `openid-configuration` alias.

## Layout

| File | Role |
|------|------|
| `config.js` | Every container setting as a pure `containerEnv(env)` function — the only place defaults change |
| `config.test.js` | `node --test` assertions for billing, login, model discovery, MCP and banners, plus a catalog check |
| `worker.js` | Container class, the referrer header and the keepalive cron; builds `envVars` from `config.js` |
| `scripts/check-model-ids.mjs` | Fails when a referenced model id leaves the catalog (`--live`, `--refresh` for the fixture) |
| `catalog.fixture.json` | Recorded ids from `GET /v1/models`, so the id check needs no network |
| `wrangler.jsonc` | Container (pre-built image), custom domains, staging env |
| `scripts/push-image.sh` | Mirror the upstream image into the Cloudflare registry |
| `scripts/push-secrets.mjs` | Push `secrets/secrets.vars.json` (sops) to the Worker |
| `deploy.json` | Picked up by `Deploy / Applications` on the `production` branch |

No Dockerfile. Cloudflare cannot pull `ghcr.io`, so the upstream `-slim` image is
pushed once to `registry.cloudflare.com` and referenced from `wrangler.jsonc`.
Deploys then need no Docker, locally or in CI.

## State

Container disk is wiped on every sleep. All state lives in Postgres (one
instance on the `monitoring-agents` box, databases `openwebui` and
`openwebui_staging`):
`DATABASE_URL` holds users, chats, config, and the pgvector store. Uploaded
files are still on local disk and do not survive a restart; switch to R2 via
`STORAGE_PROVIDER=s3` when that matters.

RAG embeds locally with the bundled `sentence-transformers/all-MiniLM-L6-v2`
(`RAG_EMBEDDING_ENGINE` unset). RAG, image and audio all authenticate with a
single static key rather than the per-user OAuth token the chat connection uses,
so pointing them at gen would bill every user's documents to one wallet. The
cost is a ~90 MB model download onto the ephemeral disk after a restart.

Secrets (per environment in `secrets/secrets.vars.json`):

- `WEBUI_SECRET_KEY`: session signing key. Changing it logs everyone out.
- `DATABASE_URL`: Postgres connection string (staging uses its own database).

## Before/after walkthrough

What a signed-in user sees after this change. Every row is covered by
`npm test` in this directory (10 assertions plus a catalog check), so the
columns below are checked, not just described:

| Screen | Before | After |
|--------|--------|-------|
| First chat | `DEFAULT_MODELS=openai` is an **alias**, not a catalog id, so the picker fell back to the alphabetically first community model | `openai/gpt-5.4-mini` → `openai/gpt-5.4-nano` → `openai/gpt-5.5`; Open WebUI keeps the first id that exists, so a retired model only moves to the next one |
| Sidebar | empty until the user pins something | `DEFAULT_PINNED_MODELS` fills it with an everyday chat model, a coding model, a small fast model and an image model while the user has no pins; a user's own pins always win afterwards |
| New chat | nothing said who pays | one dismissible banner: chats spend your own Pollen, with balance and top-up links |
| Share menu | "to community" uploads the chat to openwebui.com | `ENABLE_COMMUNITY_SHARING=false`; chats stay on this instance |
| Regression safety | no tests in this app | `config.test.js` asserts the billing, login, discovery, MCP and banner wiring; `scripts/check-model-ids.mjs` fails when a referenced model id leaves the catalog |

`scripts/check-model-ids.mjs` validates the ids in `config.js` against
`catalog.fixture.json` (304 ids, recorded from `GET /v1/models`). Run it with
`--live` to check against the gateway right now, or `--refresh` to re-record the
fixture after the catalog moves on.

Chat-level checks a reviewer can run in two minutes on staging
(`npm run deploy:staging`, URL in `wrangler.jsonc`):

1. Sign in with a Pollinations account: the consent screen mints the `sk_`,
   and no password form appears.
2. Open a new chat: the billing banner is on top, the sidebar shows the four
   pinned models, and the picker starts on `openai/gpt-5.4-mini`.
3. Send a prompt: the generated title proves `task.model.external` ran, and
   `enter.pollinations.ai` shows that user's spend against their own wallet.
4. Open the chat's **Tools** menu: the Pollinations MCP server is listed and
   enabled, and a tool call bills the same user.

## Config vars are seeded once, not on every boot

Production uses Chat Completions; staging uses Responses with
`ENABLE_RESPONSES_API_STATEFUL=false`. Staging connects only to staging Gen
and staging Enter, and has no external MCP tool server. Both discover the full
model catalog (`MODEL_IDS=[]`). Managed agents' own configured MCP tools are independent of Open
WebUI's external tool servers.

Titles, tags and follow-up suggestions use `openai/gpt-5-nano`, not the selected
chat model. For existing databases, set `task.model.external` to that ID; this
global setting applies to existing users too.

On an existing staging database, also update `openai.api_base_urls`,
`openai.api_configs` (`api_type` and `model_ids`), and
`tool_server.connections` to match the staging configuration. Preserve
users/chats and unrelated settings. Restart the staging container to apply
the new OAuth environment. Its `OAUTH_CLIENT_ID` must be registered in staging
Enter; production client registrations do not exist in staging automatically.

Every setting in `DEFAULT_CONFIG` (`OPENAI_API_CONFIGS`, `TOOL_SERVER_CONNECTIONS`,
...) is written to the Postgres `config` table only when the key is *missing*:
`Config.seed_defaults` inserts new keys and `Config.get` reads the stored row
first. Editing one of those env vars on a database that has already booted does
nothing. Change the stored row instead, or use the admin API where one exists
(`POST /api/v1/retrieval/embedding/update` both writes the config and rebuilds
the in-memory embedding function, which a bare `UPDATE` does not):

```bash
ssh community-monitor "sudo docker exec openwebui-postgres \
  psql -U openwebui -d openwebui -c \
  \"select key, value::text from config where key = 'tool_server.connections';\""
```

### Reaching an existing installation

The defaults this app ships are `DEFAULT_CONFIG` seeds: `ui.default_models`,
`ui.default_pinned_models`, `ui.banners`, `ui.enable_community_sharing`,
`models.default_metadata`, `ui.default_user_role` and `task.model.external` are
inserted only while their row is *missing*. A database that has already booted
keeps the old values, so editing `worker.js` alone changes nothing for the
hosted instance or staging. Apply them to the stored rows instead; none of
these keys is cached in memory, so the next request picks the change up (no
container restart):

```sql
update config set value = '"openai/gpt-5.4-mini,openai/gpt-5.4-nano,openai/gpt-5.5"'
  where key = 'ui.default_models';
update config set value = '"openai/gpt-5.4-mini,openai/gpt-5.3-codex,openai/gpt-5.4-nano,openai/gpt-image-2"'
  where key = 'ui.default_pinned_models';
update config set value = 'false' where key = 'ui.enable_community_sharing';
-- ui.banners stores the JSON array worker.js builds:
update config set value = '[{"id":"pollinations-billing","type":"info","title":"Chats spend your own Pollen","content":"Text, images and tool calls are billed to the Pollen wallet you signed in with. [Check your balance](https://enter.pollinations.ai/pollen) or [top up](https://enter.pollinations.ai/top-up).","dismissible":true,"timestamp":1759500000}]' where key = 'ui.banners';
```

Read what is there before overwriting it so an installation's own banner list
is extended rather than replaced:

```bash
ssh community-monitor "sudo docker exec openwebui-postgres \
  psql -U openwebui -d openwebui -c \
  \"select key, value::text from config where key in ('ui.banners','ui.default_models','ui.default_pinned_models','ui.enable_community_sharing','task.model.external');\""
```

Values are JSON, so a string seed is quoted JSON (`'"openai/…"'`) and a boolean
seed is bare (`false`). The same applies to a fresh database: these rows are
written from the environment on first boot only.

## Restarting the container

`envVars` on the Container class are applied when the container *starts*, and a
`wrangler deploy` does not restart a running instance (nor does a shorter
`sleepAfter`). To force a fresh container, delete the container application and
deploy again. Users, chats and configuration remain in Postgres; uploaded
files on the ephemeral disk are lost, so check for files before restarting:

```bash
npx wrangler containers list                     # find the app id
npx wrangler containers delete <ID>
npx wrangler deploy --env staging                # retry once; the first
                                                 # attempt after a delete can
                                                 # fail on the durable object
```

The new container cold-starts in a few minutes while it pulls the ~1.5 GB image.
For production the deploy half must run through `Deploy / Applications`.

## Tool servers

`https://mcp.pollinations.ai/` (the endpoint is the root path; `/mcp` 404s) is
registered as an MCP tool server with `auth_type: system_oauth`, the same
per-user consent key as the model connection, so a generation started from a
tool call is billed to the signed-in user. Two fields are easy to miss:
`config.enable` must be true, and `config.access_grants` must carry an explicit
public read grant — an empty grant list means admin-only, not everyone.

That MCP server is opt-in per chat. Open WebUI's *builtin* tools are not: it
appends their specs to every request coming from its UI unless the model sets
`meta.capabilities.builtin_tools` false (`utils/middleware.py`). Models fetched
from a connection have no row in the `model` table, so the only lever is the
global default, `DEFAULT_MODEL_METADATA` / `models.default_metadata`, which
`utils/models.py` applies to them wholesale. We set it to
`{"capabilities": {"builtin_tools": false}}` — without it, managed agents and
community models that reject a `tools` field 400 on every UI chat.

`models.base_models_cache` is false and `Config.get_many` reads the row per
request, so changing that config row takes effect immediately, for existing
chats and users too. No container restart, no per-chat migration.

## Update the image

```bash
# Needs a Docker daemon; use the monitoring-agents EC2 engine over SSH.
DOCKER_HOST=ssh://community-monitor npm run push-image -- 0.11.3
# then bump containers[].image in wrangler.jsonc (both envs)
```

## Deploy

```bash
npm ci
npm run check                      # dry run
npm run deploy:staging && npm run push-secrets:staging
npm run deploy && npm run push-secrets   # production; CI does this on `production`
```

Production deploys run through `.github/workflows/deploy-applications.yml`.

## Placement

The container is constrained to `ENAM` (`containers[].constraints.regions` in
`wrangler.jsonc`) because Postgres is in AWS us-east-1. Unconstrained, Cloudflare
starts the container nearest to whichever request woke it (it ran in Riga), and
every DB session then costs ~3 transatlantic round trips (~0.45 s), which made
each page load ~20 s. A deploy that changes the constraint rolls the single
instance to the new region: expect ~5 min of 500/503 while the 1.5 GB image
cold-starts. Verified on staging 2026-09-16: `/health/db` 0.9 s → 0.3 s.

## Login requirements on the Pollinations side

- App Key (`pk_`) with the exact redirect URIs registered:
  `https://openwebui.pollinations.ai/oauth/oidc/callback` and the staging one.
  Non-loopback redirects must be HTTPS.
- `OAUTH_CLIENT_SECRET` stays empty. With a secret, authlib switches to Basic
  auth and drops `client_id` from the token request, which the Pollinations
  token endpoint rejects.
- `OAUTH_SCOPES=profile`: email is only returned with that scope. A user who
  unticks "profile" on the consent screen cannot log in.
- There is no refresh grant. The consent key expiry (`OAUTH_AUTHORIZE_PARAMS`)
  is the re-login interval for API access.
