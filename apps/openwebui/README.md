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

Container disk is wiped on every sleep. All state lives in Postgres (Neon):
`DATABASE_URL` holds users, chats, config, and the pgvector store. Uploaded
files are still on local disk and do not survive a restart; switch to R2 via
`STORAGE_PROVIDER=s3` when that matters.

Secrets (per environment in `secrets/secrets.vars.json`):

- `WEBUI_SECRET_KEY`: session signing key. Changing it logs everyone out.
- `DATABASE_URL`: Neon connection string (staging uses a Neon branch).

## Config vars are seeded once, not on every boot

Every setting in `DEFAULT_CONFIG` (`OPENAI_API_CONFIGS`, `TOOL_SERVER_CONNECTIONS`,
...) is written to the Postgres `config` table only when the key is *missing*:
`Config.seed_defaults` inserts new keys and `Config.get` reads the stored row
first. Editing one of those env vars on a database that has already booted does
nothing. Change the stored row instead:

```bash
ssh community-monitor "sudo docker exec openwebui-postgres \
  psql -U openwebui -d openwebui -c \
  \"select key, value::text from config where key = 'tool_server.connections';\""
```

## Tool servers

`https://mcp.pollinations.ai/` (the endpoint is the root path; `/mcp` 404s) is
registered as an MCP tool server with `auth_type: system_oauth`, the same
per-user consent key as the model connection, so a generation started from a
tool call is billed to the signed-in user. Two fields are easy to miss:
`config.enable` must be true, and `config.access_grants` must carry an explicit
public read grant — an empty grant list means admin-only, not everyone.

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
