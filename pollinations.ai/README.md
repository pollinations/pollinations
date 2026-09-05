# pollinations.ai

The public website: React 19, TanStack Router (file routes under `src/routes`),
Tailwind v4 through `@pollinations/ui`, served by a Cloudflare Worker
(`src/worker.ts`) that rewrites per-route SEO metadata and proxies two public
counters.

## Develop

```bash
npm ci            # from the repository root, installs the linked packages
npm ci            # here
npm run dev       # builds packages/sdk and packages/ui first, then serves on :5173
```

`npm run build` typechecks and bundles; `npm test` runs the Play unit tests.

## Data

- Model, health and app-directory numbers come from the public endpoints in
  `gen.pollinations.ai/src/docs/public-stats.md` (see `src/data/publicStats.ts`).
- Community signals are read anonymously from GitHub and Discord
  (`src/data/community.ts`); `npm run data:pr-history` refreshes the archived
  merged-PR list in `public/data`.
- Hero art is generated once with `scripts/generate-hero-scenes.mjs` and
  committed under `public/heroes`.

## Deploy

Pushes to `production` run `.github/workflows/deploy-website-cloudflare.yml`.
