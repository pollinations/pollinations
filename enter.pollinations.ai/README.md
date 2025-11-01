# enter.pollinations.ai
Provides authentication, payment infrastructure and authorizing API gateway that tracks cost and price per request.

## Documentation

- **[API Documentation](https://enter.pollinations.ai/api/docs)** - Interactive API reference (unified view of enter + gen services)
- **[API Authentication Guide](./API_AUTHENTICATION.md)** - How to use API keys for server-to-server requests
- **[Testing Cheatsheet](./AGENTS.md)** - Curl examples and testing guide
- **[FAQ](./POLLEN_FAQ.md)** - Frequently asked questions about Pollen and pricing 

# Local development
1. **SOPS key setup** (one-time): Copy age key to `~/Library/Application Support/sops/age/keys.txt` on macOS
2. **Optional - Nix**: Install [nix](https://github.com/DeterminateSystems/nix-installer) for reproducible dev environment, then run `nix develop`
3. Install dependencies: `npm install`
4. Run migrations: `npm run migrate:development`
5. Run the dev server: `npm run dev`
