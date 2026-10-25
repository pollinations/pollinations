# enter.pollinations.ai
Provides authentication, payment infrastructure and authorizing API gateway that tracks cost and price per request.

## Documentation

- **[API Authentication Guide](../gen.pollinations.ai/src/docs/authentication.md)** - How to use API keys for server-to-server requests
- **[API Documentation](https://gen.pollinations.ai/docs)** - Interactive API reference
- **[FAQ](./POLLEN_FAQ.md)** - Frequently asked questions about Pollen and pricing

## Layout

- `src/` - Cloudflare Worker API, auth, and billing routes.
- `frontend/src/` - React SPA served by the Worker and built into `dist/client`.
- `../shared/` - Code shared across services, including registry and billing primitives.
- `frontend/src/backend-types.ts` - Type-only boundary for frontend references to Worker route/auth types.

## Local development

1. **SOPS key setup** (maintainers, one-time): Copy age key to `~/Library/Application Support/sops/age/keys.txt` on macOS. Without the key, `npm run dev` keeps your `.dev.vars` or creates it from `.dev.vars.example`; for sign-in, add your own [GitHub OAuth app](https://github.com/settings/developers) with the callback `http://localhost:3000/api/auth/callback/github`.
2. **Optional - Nix**: Install [nix](https://github.com/DeterminateSystems/nix-installer) for reproducible dev environment, then run `nix develop`
3. Install dependencies: `npm install`
4. Run the dev server: `npm run dev` (applies local migrations automatically)
5. **Local Pollen**: after signing in, run `npm run seed:local` in `gen.pollinations.ai` to give every local account Quest Pollen.
