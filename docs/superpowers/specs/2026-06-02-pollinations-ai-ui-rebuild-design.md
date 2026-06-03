# pollinations.ai — Full UI Rebuild on `@pollinations/ui` + `@pollinations/sdk`

**Date:** 2026-06-02
**Status:** Design approved — ready for implementation plan
**Author:** elliot (design via Claude)

## Goal

Rebuild the entire pollinations.ai marketing/showcase website so that it relies
**solely** on shared primitives from `@pollinations/ui` and routes **all Pollinations
data and generation** through `@pollinations/sdk` (see **Package boundaries**). Remove every bespoke visual element (animated
scene background, pollen particles, CRT overlay, brutalist styling) and the entire
local design system. The result is a lean site whose only local code is non-primitive
shells and page composition.

This mirrors the architecture already proven in `enter.pollinations.ai/frontend`
(primitives + TanStack Router, ~75 bytes of app CSS) and `apps/model-monitor`
(primitives only, single `@import`).

## Guiding principle

> If it is a primitive, it lives in `@pollinations/ui` (create it if missing).
> The website holds only non-primitive shells (header/footer/layout) and page
> composition. Nothing primitive-like is redefined locally; there is no local
> design system and no custom CSS.

## Package boundaries

The app is an **aggregate**: it composes packages and owns only what is genuinely
site-specific. Three layers, strict ownership:

- **`@pollinations/ui`** — all visual primitives and reusable UI *modules*. No network
  calls, no site copy. Modules (e.g. `auth`, `wallet`, `modality`) may consume the SDK
  but carry no website-specific content.
- **`@pollinations/sdk`** — all Pollinations data: API, auth, account, models, upload,
  generation. **If Play needs Pollinations data, the SDK owns it.** No app component
  fetches a Pollinations endpoint directly; if a method is missing, add it to the SDK
  (or a tiny SDK data module) — don't hand-roll a fetch in the app.
- **`pollinations.ai`** — routes, page composition, static copy (English source of
  truth), loader orchestration, and only truly site-specific aggregation.

**Rule: no direct Pollinations API fetches in the app.** The only sanctioned non-SDK
fetches are *content/presentation data that is not a Pollinations product surface* —
currently the community apps list (`useApps`, parsed from `APPS.md` on GitHub) and
`TopContributors` (GitHub commits API). These are **content aggregation**, not
Pollinations API data, so they stay local — but must be labeled as such, not mistaken
for product/API data. Anything Pollinations-served (models, generation, account,
balance, keys) goes through the SDK. If a "content" source ever needs a live
Pollinations metric, that metric is fetched via the SDK, not a local fetch.

**Shells vs modules:** `Header`/`Footer`/`Layout` stay local because they are
website-specific chrome, not primitives. If they ever become shared brand chrome across
`enter`, `model-monitor`, etc., promote them into `@pollinations/ui` as **modules**
(alongside `auth`/`wallet`/`modality`) — never as primitives.

## Scope decisions (locked)

- **Feature scope:** Drop the runtime i18n auto-translation pipeline and the GitHub
  Build Diary for v1. Keep Hello, Play, Apps, Community, and legal pages. Community
  keeps hero + contribute + voting + Top Contributors; drops Build Diary and the
  supporters image-generation section.
- **Router:** Adopt **TanStack Router** (file-based routes + loaders), matching
  `enter.pollinations.ai`.
- **Shared-code home:** Add `Prose`, `Textarea`, and `FileUpload` as **primitives in
  the package**. Header/footer/layout shells stay **local** (they are not primitives).
- **Theming:** Per-route `data-theme` palettes (Hello=green, Play=violet, Apps=blue,
  Community=pink, legal=green). Modality colors via `getModalityColors` where modality
  is displayed.
- **Hard cutover:** No half-migrated state. The legacy Tailwind v3 config and design
  system are deleted; every page is rebuilt on v4 + primitives.

## Reference facts (from exploration)

- `@pollinations/ui` v0.0.2: ~29 primitives + modules (`auth`, `wallet`, `modality`),
  6 `data-theme` palettes, OKLCH tokens, Tailwind v4, branded fonts.
  `@pollinations/ui/app.css` does `@import "tailwindcss"` → consumer must run Tailwind v4.
  **CSS convention (load-bearing — got this wrong once):** the `polli:` prefix is
  **package-internal only** (its pre-built `styles.css`, scanned over package source at
  package-build time). **Consumer apps author UNPREFIXED utilities** (`flex h-full`,
  `min-h-full`, `text-theme-text-strong`, `font-heading`). `app.css` ships a second,
  unprefixed `@import "tailwindcss"` + unprefixed `@theme` tokens; Tailwind generates those
  utilities by scanning the *consumer's* source. Writing `polli:`-prefixed classes in app
  code silently no-ops unless the package happens to ship that exact class — which breaks
  layout (e.g. an inner-scroll container that never constrains height). Reference consumer:
  `apps/model-monitor` (zero `polli:` in app code).
  Its `@pollinations/sdk` peer is already aligned to `^5.0.0` (done in #11577).
- `@pollinations/sdk` v5.0.0: full client (image/text/chat/audio/video/transcribe/
  upload/models/account/keys) + `@pollinations/sdk/react` (`PolliProvider`, `useAuth`,
  `useAccountBalance`, `useAccountProfile`, etc.). No gaps for this site.
- Current site: React 18 + Vite + React Router v6 + Tailwind v3, ~10K LOC, 8 routes,
  custom CVA design system, deployed to Cloudflare Workers (wrangler). Only existing
  shared usage is `@shared/registry` for the model list.

## Architecture

### 1. Foundation migration
- React 18 → 19 (`react`/`react-dom` ^19).
- Replace PostCSS/autoprefixer + Tailwind v3 with `@tailwindcss/vite`.
- Delete `tailwind.config.ts` and `src/theme/palette.ts`.
- Single entry CSS importing only `@pollinations/ui/app.css`.
- Shell classes: `<html class="polli-ui-root">` (reset) + **`<body class="polli-ui-shell">`**
  — the full-width, viewport-locked app shell (`max-width:none; height:100dvh;
  overflow:hidden`, `#root` fills the viewport), matching `apps/model-monitor`. **Not**
  `polli-ui-body` — that is `enter`'s 800px-centered document model and injects an
  emerald bg + opinionated `h1`–`h6` styles that would fight per-route theming. Per-route
  `data-theme` goes on the route container, not `<body>`. Consequence of shell: the
  document does not scroll — an inner container under `#root` owns scroll, so the
  header scroll-hide hook listens to that container, not `window`. Legal/`Prose` pages
  set their own reading width rather than relying on `polli-ui-body`.
- Add `@pollinations/ui` and `@pollinations/sdk` as `file:` deps. Define a `build:ui`
  script (`npm run build --prefix ../packages/sdk && npm run build --prefix
  ../packages/ui`) and hook it into **every** entry point: `predev`, `prebuild`,
  `prebuild:staging`, `prebuild:production` — mirror `enter.pollinations.ai`, **not**
  `apps/model-monitor`. npm pre-hooks are name-exact, and the site deploys via
  `build:staging`/`build:production` (`deploy:*` invoke those, not `build`), so a bare
  `prebuild` would never fire on the deploy path and would ship stale/absent package
  `dist/`.
- Keep Cloudflare Workers deploy; verify the `prebuild:staging`/`prebuild:production`
  hooks actually run in CI / on `deploy:production`.

### 2. New primitives in `@pollinations/ui`
Styled exclusively with `--polli-*` tokens; exported from `packages/ui/src/index.ts`.
- **`Prose`** — `react-markdown` + `remark-gfm` + `rehype-slug`, elements mapped to
  theme text/heading tokens and package fonts. Replaces `LegalMarkdownPage`,
  `LazyMarkdown`, and all inline markdown rendering. Add markdown deps to the package.
- **`Textarea`** — multiline counterpart to `Input` (error state, theme, manual
  `resize-y`). Used by the Play prompt field. No auto-grow: `field-sizing` is not yet
  Baseline (silently no-ops in some browsers) and JS auto-grow isn't worth the
  complexity for an unproven need — revisit if Play actually requires it.
- **`FileUpload`** — controlled drag-and-drop zone with thumbnail previews, remove
  buttons, and size/count/type limits. **Contract:**
  - **Controlled only** — `value: File[]` is the single source of truth; no internal
    file-list state.
  - **Never uploads** — it is a pure input; the Play page hands `value` to the SDK.
    No implicit network calls.
  - **Object-URL cleanup** — preview URLs are created via `URL.createObjectURL` and
    **revoked on remove and unmount** (no leaks).
  - **Deterministic reject** — files violating `accept`/`maxFiles`/`maxSizeBytes` are
    rejected by a fixed rule and reported via `onReject`, never silently dropped.
    Being **at the `maxFiles` limit does not disable the input** — over-limit
    selections still flow through the reject rule (reported as `count`) so the user
    gets feedback; only `disabled` blocks interaction.
  - **`disabled` fully locks** — no add and no remove (the remove control is hidden),
    and dropped files are ignored. Drag/drop handlers still call `preventDefault()`
    unconditionally so a stray drop never triggers browser file navigation.
  - **Theme** — accepts an optional `theme?: ThemeName` cascade override
    (`data-theme` on the root), matching the package's themed primitives.

  API (draft): `{ value: File[], onChange, onReject?, maxFiles, maxSizeBytes, accept,
  theme, disabled }`. Powers Play reference images.
- Add any site-needed icons missing from the current 21.
- Bump package version; rebuild.

### 3. Deletions (legacy design system + "special")
- `src/ui/components/SceneBackground.tsx` + `public/scene-*.webp`.
- Scene/particle/CRT/fade CSS in `src/styles.css` (file removed or reduced to nothing).
- Entire CVA `src/ui/components/ui/` library: `button`, `badge`, `typography`,
  `page-card`, `page-container`, `sub-card`, `divider`, `feature-item`, `roadmap-item`,
  `lazy-markdown`, `back-to-top`.
- `src/theme/palette.ts`, `src/services/pollinationsAPI.ts`.
- Translation pipeline: `src/copy/translation/`, translation paths in `usePageCopy`,
  `useTranslate`, `usePrettify`, `useTranslateAndPrettify`.
- `BuildDiary.tsx` + `useDiaryData.ts`; supporters image-gen section.
- Copy constants in `src/copy/content/*.ts` stay as static English source of truth.

### 4. Local (non-primitive) site code
Thin compositions of package primitives — no bespoke CSS:
- **App shell:** `Header` (logo, nav, social/Enter buttons), `Footer`, root layout.
  Scroll-hide retained via a small hook. Built from `Button`, icons, `Dropdown`.
- **UserMenu:** `Dropdown` + SDK auth/balance hooks.
- **Page composition:** hero, feature grid, app cards, playground form, contributor
  grid — assembled from `Surface`, `Section`, `Button`, `Chip`, `Prose`, `TabButton`,
  `ButtonGroup`, `Textarea`, `FileUpload`, `Alert`, `CopyButton`, `Tooltip`.
- One-off headings/labels use Tailwind utilities bound to package tokens
  (`font-heading`, `text-theme-text-strong`, etc.) — utilities, not local components.

### 5. Routing — TanStack Router
File-based routes: `/`, `/play`, `/apps`, `/community`, `/terms`, `/privacy`,
`/refunds`; `/docs` → `/play` redirect. Loaders fetch the apps list, model list, and
contributors. Document title/meta via router head management (replacing
`useDocumentMeta`).

### 6. Pollinations data / generation — 100% SDK
- Wrap app in **`PolliProvider`** (`appKey` from config).
- Replace the custom `useAuth` context with `useAuth` / `useAccountBalance` /
  `useAccountProfile` from `@pollinations/sdk/react`.
- **Play:** replace all hand-rolled fetches with SDK — `generateImage`, `chat`/
  `generateText`, `generateAudio`, `upload`; model list via `client.models()`; tier
  gating via `validateKey()` permissions.
- `useApps` (APPS.md parsing) and `TopContributors` (GitHub commits API) stay local as
  **content aggregation** — GitHub/website content, not Pollinations API data — re-skinned
  on primitives only. They are the *only* sanctioned non-SDK fetches; everything
  Pollinations-served goes through the SDK (see **Package boundaries**).

### 7. Theming
Per-route `data-theme` on the route container (Hello=green, Play=violet, Apps=blue,
Community=pink, legal=green). Modality colors via `getModalityColors` where shown
(e.g. Play model categories, Apps genre accents).

## Component → primitive mapping (summary)

| Current | Replacement |
|---|---|
| CVA `Button` (12 variants) | `Button` (theme/intent/size) |
| `Badge` (6 variants) | `Chip` (intent) |
| `Typography` (Title/Heading/Body/Label) | Tailwind token utilities; `Prose` for markdown |
| `PageCard` / `SubCard` / `PageContainer` | `Surface` (`panel`/`card`/`card-themed`) + `Section` |
| `Divider` | `hr` / border utility |
| `LazyMarkdown` / `LegalMarkdownPage` | `Prose` |
| `ModelSelector` | `TabButton` + `ButtonGroup` (+ `Dropdown`) |
| Play prompt textarea | `Textarea` |
| Play reference-image upload | `FileUpload` |
| Voice selector | `TabButton` / `ButtonGroup` |
| Error box | `Alert` |
| Copy-URL button | `CopyButton` |
| `UserMenu` | `Dropdown` + SDK hooks (local shell) |
| `Layout` header/footer/nav | Local `Header`/`Footer` from primitives |
| Result media (img/video/audio/text) | Native elements (no primitive needed) |

## Implementation phases

1. **Package primitives:** add `Prose`, `Textarea`, `FileUpload`; build + version bump
   (next bump `0.0.2` → `0.0.3` for the new primitives — the peer-dep fix already
   consumed `0.0.1` → `0.0.2` in #11577).
2. **Foundation:** React 19 + Tailwind v4 + `@tailwindcss/vite` + TanStack Router +
   `PolliProvider`; wire `file:` deps + prebuild hooks; delete legacy config/design
   system/scene/translation.
3. **App shell + legal pages:** `Header`/`Footer`/layout; legal on `Prose` (smallest,
   validates the markdown primitive end-to-end).
4. **Hello** (hero, features, roadmap on `Surface`/`Prose`).
5. **Apps** (filter/sort + cards from `Surface`/`Chip`/`Prose`; `useApps`).
6. **Play** (largest — full SDK generation, `Textarea`, `FileUpload`, model/voice
   selectors, integrate/API-URL section).
7. **Community** (hero + contribute + voting + Top Contributors; no diary/supporters).
8. **Cleanup:** delete dead code, verify all routes render, `biome check`, build.

## Verification

- Package gates (Phase 1 adds primitives to the shared package, so it must stand alone):
  `npm run build --prefix packages/ui` and `npm run test --prefix packages/ui` pass —
  `Prose`/`Textarea`/`FileUpload` build + test green in isolation; same for
  `packages/sdk` if touched.
- `npm run build` **and** `npm run build:production` succeed — the production build is
  the actual deploy path; confirm `build:ui` runs via the `prebuild:production` hook.
- Dev server: every route renders correctly; auth/login, balance, and at least one
  generation per modality work via the SDK.
- **Inner-scroll behavior** (regresses quietly because `polli-ui-shell` makes `<body>`
  non-scrolling — verify against the inner scroll container, not `window`):
  - Browser back/forward restores scroll position per route.
  - In-page anchor / hash links (`#section`, legal-page TOC) scroll to the target.
  - Focus lands sensibly after route changes (focus moved to/near the new content,
    not lost to `<body>`).
  - Legal/`Prose` pages scroll fully on mobile (no content trapped under the fold by
    `height:100dvh; overflow:hidden`).
- `npx biome check --write` clean.
- No remaining imports of deleted modules; no scene assets in `public/`.
- Bundle: scene assets (~228KB) and the CVA library gone.

## Out of scope (v1)

- i18n auto-translation.
- Build Diary timeline.
- Supporters image-generation section.
- Promoting the site shell/header/footer into the package (they are not primitives).

## Risks

- **Hard cutover:** no legacy Tailwind config fallback — every page must be rebuilt
  before the site is shippable; there is no partially-migrated working state.
- **`FileUpload`** is the most novel primitive; needs a clean, tested API since it
  ships in the shared package.
- **Cloudflare build** must execute the package `build:ui` step via the **name-exact**
  `prebuild:staging`/`prebuild:production` hooks (a bare `prebuild` won't fire on
  `build:staging`/`build:production`); verify in CI before relying on `deploy:production`.
- **React 19 + Ark UI**: confirm the package's Ark UI components behave under the
  site's usage (they already do in enter/model-monitor on React 19).

## Branch

Implement on a feature branch off `main` (e.g. `feat/website-ui-primitives`), not on
`production`.
