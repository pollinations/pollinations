# enter.pollinations.ai
Provides authentication, payment infrastructure and authorizing API gateway that tracks cost and price per request.

## Documentation

- **[API Authentication Guide](./API_AUTHENTICATION.md)** - How to use API keys for server-to-server requests
- **[API Documentation](https://gen.pollinations.ai/docs)** - Interactive API reference
- **[FAQ](./POLLEN_FAQ.md)** - Frequently asked questions about Pollen and pricing

## Layout

- `src/` - Cloudflare Worker API, auth, and billing routes.
- `frontend/src/` - React SPA served by the Worker and built into `dist/client`.
- `../shared/` - Code shared across services, including registry and billing primitives.
- `frontend/src/backend-types.ts` - Type-only boundary for frontend references to Worker route/auth types.

## Local development

1. **SOPS key setup** (one-time): Copy age key to `~/Library/Application Support/sops/age/keys.txt` on macOS
2. **Optional - Nix**: Install [nix](https://github.com/DeterminateSystems/nix-installer) for reproducible dev environment, then run `nix develop`
3. Install dependencies: `npm install`
4. Run migrations: `npm run migrate:development`
5. Run the dev server: `npm run dev`
