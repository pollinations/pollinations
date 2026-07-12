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
- `/{prompt}/?model=openai-fast` is a legacy generation URL and requires `Authorization: Bearer ...`.
- `/api/health` returns Worker configuration health without exposing tokens.

## Auth

The frontend uses the publishable app key `pk_wYCqFfSdCXZL8UBW`.

Generation requires the incoming `Authorization: Bearer ...` header from the BYOP app shell.

## Deployment

```bash
npm run deploy
```

The Worker deploy target is `websim.myceli.ai` in `wrangler.toml`.
