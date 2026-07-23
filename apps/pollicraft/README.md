# Pollicraft

Pollicraft is an Infinite Craft-style browser game built for Pollinations quest [#10973](https://github.com/pollinations/pollinations/issues/10973). Players start with Water, Fire, Wind, and Earth, then combine elements on a small alchemy table. Known recipes come back from the shared PocketBase atlas; new recipes are resolved with Pollinations text generation and illustrated with Pollinations image generation.

The current app is a SvelteKit static frontend with a PocketBase backend. The backend is included as source for this special PR because maintainers approved including it.

## Stack

- SvelteKit, Svelte 5, TypeScript, Vite, Tailwind CSS 4
- `pnpm` package management
- PocketBase JavaScript hooks and migrations
- Pollinations BYOP auth through `enter.pollinations.ai`
- Pollinations text generation through `https://gen.pollinations.ai/v1/chat/completions`
- Pollinations image generation through `https://gen.pollinations.ai/image/{prompt}`
- Pollinations identity verification through `https://enter.pollinations.ai/api/device/userinfo`

## Environment

Create `.env` from `.env.example`.

```sh
PUBLIC_PB_URL=http://127.0.0.1:8090
PUBLIC_POLLINATIONS_APP_KEY=
```

`PUBLIC_PB_URL` is required for crafting and inventory sync. It should point to the PocketBase backend locally or to the PocketHost production instance.

`PUBLIC_POLLINATIONS_APP_KEY` is optional. When set to a publishable Pollinations app key, it is sent as `client_id` in the BYOP authorization URL so the Pollinations consent screen identifies Pollicraft.

## Local Development

```sh
pnpm install
pnpm dev
```

Run the backend from `backend/` with a separately installed PocketBase `0.38.0` binary.

```sh
pocketbase serve
```

Open the frontend URL printed by Vite. Connect a Pollinations account from the in-game menu before crafting new elements.

## Scripts

```sh
pnpm check
pnpm build
pnpm preview
```

`pnpm build` creates the static SvelteKit output used for web deployment and itch.io HTML5 upload.

## BYOP Flow

Pollicraft uses a bring-your-own-Pollen-key flow:

1. The player clicks Connect Pollinations.
2. The browser redirects to `https://enter.pollinations.ai/authorize`.
3. Pollinations redirects back with `api_key` in the URL hash.
4. The frontend verifies the key with `enter.pollinations.ai/api/device/userinfo`.
5. The frontend stores the key in local storage under the verified account email and sends it to PocketBase only when loading inventory or crafting.

The frontend never commits or ships a secret key. The player can disconnect from the menu, which clears the stored identity and key.

## Backend Role

PocketBase stores the shared game state:

- `profiles`: verified Pollinations users.
- `elements`: global element atlas, first discoverer, recipe ingredients, optional generated image.
- `inventories`: per-player ownership of discovered elements.

The frontend calls:

- `POST /inventory` to verify identity, create a profile if needed, seed base elements, and load the player's inventory.
- `POST /craft` to verify ownership of both ingredients, return a cached recipe if it exists, or call Pollinations to create a new global element.

See `backend/README.md` for the backend API contract and local PocketBase setup.

## Production

For production, configure the deployed frontend with:

```sh
PUBLIC_PB_URL=<PocketHost Pollicraft URL>
PUBLIC_POLLINATIONS_APP_KEY=<optional pk_... app key>
```

The static frontend can be deployed by the Pollinations apps workflow. The PocketBase backend should run on PocketHost or another PocketBase host using the committed hooks and migrations only.

The Pollinations apps deploy script currently runs `npm install` for apps with a `package.json`. Pollicraft still uses `pnpm`, so the `apps/apps.json` entry explicitly runs pnpm after the default install step:

```json
{
  "pollicraft": {
    "subdomain": "pollicraft",
    "buildCommand": "corepack enable && pnpm install --frozen-lockfile && pnpm build",
    "outputDir": "build",
    "title": "Pollicraft",
    "description": "An Infinite Craft-style alchemy game powered by Pollinations"
  }
}
```

The backend source included in this PR is limited to:

```txt
backend/
  README.md
  .gitignore
  pb_hooks/
  pb_migrations/
```

Do not copy `pb_data/`, `pocketbase.exe`, generated storage, or PocketBase release files.

## Itch.io Export

```sh
pnpm build
```

Zip the static build output and upload it to itch.io as an HTML5 game. The itch.io page must still be configured with a production `PUBLIC_PB_URL` at build time, because crafting requires the PocketBase backend.

## Open Source Notes

Do not commit `.env`, generated build output, PocketBase data, generated storage, user profile data, or Pollen keys. The open-source copy should include source, migrations, hooks, docs, and lockfiles only.
