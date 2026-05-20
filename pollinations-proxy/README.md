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
| `enter.pollinations.ai` *(disabled until prod cutover)* | `enter.myceli.ai` |
| `gen.pollinations.ai` *(disabled until prod cutover)* | `gen.myceli.ai` |

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

Verified 2026-05-20: the staging GitHub App (client_id `Iv23li2dFvT2lzVnK4Bg`)
already accepts `staging.enter.pollinations.ai/...` as a callback URI. For
prod (OAuth App, client_id starting `Ov23li…`), end-to-end OAuth login
should be re-validated before cutover.

## Deploy

```bash
# Old Pollinations account
cp ~/Library/Preferences/.wrangler/config/pollinations.toml \
   ~/Library/Preferences/.wrangler/config/default.toml

# Staging only — production routes are commented out in wrangler.toml.
npm run deploy:staging
```

## Rollback

Re-deploy the existing staging enter/gen workers on the Pollinations account
to retake their custom domains. Or delete the proxy worker — Cloudflare
falls back to whichever Worker last claimed the custom domain.
