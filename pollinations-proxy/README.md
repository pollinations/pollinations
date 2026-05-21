# pollinations-proxy

Thin Cloudflare Worker that lives in the **old Pollinations account** and
proxies `*.pollinations.ai` traffic to `*.myceli.ai` upstreams in the Myceli
account. Public hostnames stay on the Pollinations zone (which we own); all
real work (D1, KV, R2, Workers) runs in the Myceli account.

## Layout

| Public host (this Worker) | Upstream (Myceli) |
| --- | --- |
| `staging.enter.pollinations.ai` | `staging.enter.myceli.ai` |
| `staging.gen.pollinations.ai` | `staging.gen.myceli.ai` |
| `enter.pollinations.ai` | `enter.myceli.ai` |
| `gen.pollinations.ai` | `gen.myceli.ai` |
| `media.pollinations.ai` | `media.myceli.ai` |

## Forwarded headers

The proxy adds:

- `X-Forwarded-Host` — the original `*.pollinations.ai` hostname
- `X-Forwarded-Proto: https`
- `X-Forwarded-For` — overwritten with the original `CF-Connecting-IP` (the
  incoming header is untrusted and not propagated)
- `X-Original-Client-IP` — the original `CF-Connecting-IP` (read by upstream
  for rate-limit / tracking)

The myceli enter/gen workers use these via two shared helpers:

- `shared/public-origin.ts` — `getPublicOrigin(c)` for building public URLs
  (Stripe success, OAuth callback, image `response_format=url`, redirects)
- `shared/client-ip.ts` — `getRealClientIp(c)` for rate-limit + tracking

## OAuth callback URL

Better-Auth is anchored to a public hostname via `BETTER_AUTH_URL`
(set per env in `enter.pollinations.ai/wrangler.toml`). It builds OAuth
callback URLs from that value, independent of the incoming request's host.
So callbacks always land on the Pollinations public hostname, never on the
Myceli upstream.

Direct auth flows against `*.enter.myceli.ai` are intentionally
non-functional — Myceli is treated as a private upstream. Use non-auth
endpoints when smoke-testing the Myceli host directly.

Verified 2026-05-21: production traffic is routed through this proxy to the
Myceli upstreams, and generation/auth smoke tests pass on the public
Pollinations hostnames.

## Deploy

```bash
# Old Pollinations account
cp ~/Library/Preferences/.wrangler/config/pollinations.toml \
   ~/Library/Preferences/.wrangler/config/default.toml

npm run deploy:staging

# Production — this owns enter/gen/media.pollinations.ai.
npm run deploy:production
```

## Rollback

Rollback is a route-owner change, not a DNS change. Re-deploy the previous
Pollinations-account workers to retake their custom domains:

- `pollinations-enter-production` for `enter.pollinations.ai`
- `pollinations-gen-production` for `gen.pollinations.ai`
- `pollinations-media-prod` for `media.pollinations.ai`

If media writes occurred on Myceli before rollback, copy Myceli -> old before
sending `media.pollinations.ai` back to the old worker, or keep media on
Myceli.
