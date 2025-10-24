# enter.pollinations.ai
Provides authentication, payment infrastructure and authorizing API gateway that tracks cost and price per request.

## Documentation

- **[API.md](./API.md)** - API documentation for server-to-server authentication and endpoints
- **[POLLEN_FAQ.md](./POLLEN_FAQ.md)** - Frequently asked questions about Pollen credits and pricing 

# Local development
1. Install `nix`: If you want to get a reproducible development environment with all the required tools already installed, we recommend to install the nix package manager first. The best way to do that is the [Determinate Nix Installer](https://github.com/DeterminateSystems/nix-installer)
2. Enter the dev shell: `nix develop` will create an isolated shell with all the required tools and decrypt the necessary environment variables if you have the necessary decryption key.
3. Install dependencies: `npm install`
4. Run migrations: `npm run migrate:development`
5. Run the dev server: `npm run dev`
