# Myceli Production Cutover Playbook

Purpose: first production cutover from old Pollinations Cloudflare workers to Myceli workers while keeping public `*.pollinations.ai` hostnames.

The first cutover is manual and tightly sequenced. Do not rely on CI for the first switch, and do not leave deploys hours apart. After the cutover is proven, CI can handle normal redeploys.

## Accounts

| Account | Use |
|---|---|
| Old Pollinations Cloudflare | Owns `pollinations.ai`; deploys `pollinations-myceli-proxy` |
| Myceli Cloudflare | Runs upstream workers on `*.myceli.ai` |

## Scope

Cut over:

- `enter.pollinations.ai` -> `enter.myceli.ai`
- `gen.pollinations.ai` -> `gen.myceli.ai`
- `media.pollinations.ai` -> `media.myceli.ai`

Keep as-is:

- `pollinations.ai` frontend stays in old Pollinations account
- `image.pollinations.ai` / `text.pollinations.ai` legacy workers stay in old Pollinations account
- `portkey.myceli.ai` is internal/direct; no `portkey.pollinations.ai` proxy needed

## Before Cutover

1. Confirm PR #10991 is green and up to date.

```bash
/opt/homebrew/bin/gh pr view 10991 \
  --repo pollinations/pollinations \
  --json statusCheckRollup,mergeStateStatus,headRefOid,url
```

2. Confirm Wrangler auth works for both Cloudflare accounts.

```bash
cp ~/Library/Preferences/.wrangler/config/myceli.toml \
  ~/Library/Preferences/.wrangler/config/default.toml
npx wrangler whoami

cp ~/Library/Preferences/.wrangler/config/pollinations.toml \
  ~/Library/Preferences/.wrangler/config/default.toml
npx wrangler whoami
```

3. Confirm the R2 migration config exists locally.

```bash
ls -l "/Users/thomash/Library/Application Support/pollinations/media-r2-migration-rclone.conf"
```

## Cutover Sequence

### 1. Final Media R2 Delta

Run this immediately before deploys. `pollinations-media` is live user-upload data, so a final delta is required.

```bash
RCLONE_CONFIG="/Users/thomash/Library/Application Support/pollinations/media-r2-migration-rclone.conf" \
  /opt/homebrew/bin/rclone copy \
  old:pollinations-media \
  myceli:pollinations-media \
  --transfers 16 \
  --checkers 32 \
  --stats 10s \
  --stats-one-line \
  -v
```

Then verify old -> Myceli has no missing destination objects:

```bash
RCLONE_CONFIG="/Users/thomash/Library/Application Support/pollinations/media-r2-migration-rclone.conf" \
  /opt/homebrew/bin/rclone check \
  old:pollinations-media \
  myceli:pollinations-media \
  --one-way \
  --size-only \
  --fast-list \
  --missing-on-dst /tmp/media-missing-on-dst.txt

wc -l /tmp/media-missing-on-dst.txt
```

Proceed only when the line count is `0`.

### 2. Manually Deploy Myceli Upstreams

```bash
cp ~/Library/Preferences/.wrangler/config/myceli.toml \
  ~/Library/Preferences/.wrangler/config/default.toml

cd /Users/thomash/Documents/GitHub/pollinations-codex/enter.pollinations.ai
npm run push-secrets:production
npm run migrate:production
npm run deploy:production

cd /Users/thomash/Documents/GitHub/pollinations-codex/gen.pollinations.ai
npm run push-secrets:production
npm run deploy:production
npm run apply-lifecycle:production

cd /Users/thomash/Documents/GitHub/pollinations-codex/media.pollinations.ai
npm run deploy:production
npm run apply-lifecycle:production
```

Portkey is already live on Myceli. Only redeploy it if the script or pinned gateway commit changed:

```bash
cd /Users/thomash/Documents/GitHub/pollinations-codex
PORTKEY_ENV=production \
PORTKEY_ACCOUNT_ID=b6ec751c0862027ba269faf7029b2501 \
PORTKEY_PRODUCTION_HOST=portkey.myceli.ai \
PORTKEY_PRODUCTION_ZONE=myceli.ai \
./gen.pollinations.ai/scripts/deploy-portkey.sh
```

### 3. Enable and Deploy Production Proxy

Uncomment production routes in `pollinations-myceli-proxy/wrangler.toml`:

```toml
routes = [
  { pattern = "enter.pollinations.ai", custom_domain = true },
  { pattern = "gen.pollinations.ai", custom_domain = true },
  { pattern = "media.pollinations.ai", custom_domain = true },
]
```

Deploy the proxy from the old Pollinations account. This is the public traffic flip.

```bash
cp ~/Library/Preferences/.wrangler/config/pollinations.toml \
  ~/Library/Preferences/.wrangler/config/default.toml

cd /Users/thomash/Documents/GitHub/pollinations-codex/pollinations-myceli-proxy
npm run deploy:production
```

### 4. Smoke Tests

```bash
TOKEN="<fresh sk_ token>"

curl -sI https://enter.pollinations.ai/api/auth/session
curl -s  https://gen.pollinations.ai/v1/models | head -c 500; echo
curl -sI https://media.pollinations.ai/
curl -sI https://portkey.myceli.ai/

curl -s -X POST "https://gen.pollinations.ai/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai","messages":[{"role":"user","content":"ping"}]}' | head -c 500; echo

curl -sN -X POST "https://gen.pollinations.ai/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai","stream":true,"messages":[{"role":"user","content":"count to 3"}]}' | head -c 800; echo
```

Browser checks:

- GitHub OAuth sign-in at `https://enter.pollinations.ai`
- Create/list an API key
- Text completion through `https://gen.pollinations.ai`
- Existing media object resolves from `https://media.pollinations.ai`
- New media upload resolves after upload

## Rollback

If public traffic fails:

1. Comment production routes in `pollinations-myceli-proxy/wrangler.toml`.
2. Redeploy `pollinations-myceli-proxy` from the old Pollinations account.

If media writes occurred on Myceli before rollback, copy Myceli -> old before sending `media.pollinations.ai` back to the old worker, or keep media on Myceli.

If only an upstream version is bad, roll back that Myceli Worker version in Cloudflare and leave proxy routing alone.

## After Successful Cutover

Revoke temporary credentials:

- Old Pollinations R2 token: `media-migration-read`
- Myceli R2 token: `media-migration-write`
- Myceli bootstrap API token: `pollinations-ci-bootstrap`

Keep:

- GitHub secret `CLOUDFLARE_API_TOKEN_MYCELI`
- GitHub secret `CLOUDFLARE_ACCOUNT_ID_MYCELI`
