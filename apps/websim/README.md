# Websim

Worker-backed BYOP app for generating shareable single-file HTML pages with Pollinations.

## Local Development

```bash
npm install
npm run dev
```

The Worker runs on `http://localhost:16386` and serves the Vite-built app from `dist`.

## Routes

- `/` serves the React app shell using `@pollinations/sdk` and `@pollinations/ui`.
- `/api/generate` accepts `POST { "prompt": "...", "model": "openai-fast" }` and returns generated HTML.
- `/{prompt}/?model=openai-fast` returns a shareable generated page URL.
- `/api/health` returns Worker configuration health without exposing tokens.

## Auth

The frontend uses the publishable app key `pk_wYCqFfSdCXZL8UBW`.

Generation uses auth in this order:

1. Incoming `Authorization: Bearer ...` header from the BYOP app shell.
2. `TEXT_API_TOKEN` Worker secret, if set.
3. `WEBSIM_APP_KEY` Worker var.
4. The publishable Websim app key fallback.

## Deployment

```bash
npm run deploy
```

The Worker deploy target is `websim.myceli.ai` in `wrangler.toml`.
