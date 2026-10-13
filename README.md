# pollinations — legacy API branch

This branch serves the legacy text and image APIs. Everything else lives on `main`.

| Host | Cloudflare Worker | Code |
|---|---|---|
| `text.pollinations.ai`, `text.myceli.ai` | `pollinations-text-cache` | `text.pollinations.ai/cloudflare-cache/` |
| `image.pollinations.ai`, `image.myceli.ai` | `pollinations-image-cache` | `image.pollinations.ai/cloudflare-cache/` |

Both Workers call [gen.pollinations.ai](https://gen.pollinations.ai) and share code from `shared/`. They are deployed by the manual "Deploy / Legacy Cloudflare caches" workflow on `main`.
