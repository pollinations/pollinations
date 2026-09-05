# Open WebUI on Cloudflare Containers

Hosted [Open WebUI](https://github.com/open-webui/open-webui) with Pollinations
as its **only** login provider. Users sign in with their Pollinations account;
the consent screen mints a budgeted `sk_` which Open WebUI forwards to
`gen.pollinations.ai` per user (`auth_type: system_oauth`), so every chat is
paid from the signed-in user's own wallet.

- Public: https://openwebui.pollinations.ai (origin https://openwebui.myceli.ai)
- Staging: `openwebui-staging` on workers.dev
- Login: OAuth 2.1 code + PKCE against `https://enter.pollinations.ai`. Public
  client, no secret. Discovery is the RFC 8414 document; Pollinations serves no
  `openid-configuration` alias.

## Layout

| File | Role |
|------|------|
| `worker.js` | Container class with every Open WebUI setting as env vars, plus a keepalive cron |
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

## Config vars are seeded once, not on every boot

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

## Restarting the container

`envVars` on the Container class are applied when the container *starts*, and a
`wrangler deploy` does not restart a running instance (nor does a shorter
`sleepAfter`). To force a fresh container, delete the container application and
deploy again — state is in Postgres, so nothing is lost:

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
