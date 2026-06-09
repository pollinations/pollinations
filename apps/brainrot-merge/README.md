# Brainrot Merge

The Italian brainrot edition of SuikaCraft: Suika-style falling physics where
merging two same-size pieces asks the AI to invent a brand-new Italian
brainrot character — pseudo-Italian name, absurd lore, hyperreal image, and a
dramatic Italian voice line spoken aloud on discovery.

The famous brainrot creatures are themselves hybrids (shark + sneakers,
crocodile + bomber, ballerina + cappuccino), so the seeds are the raw
ingredients — Squalo, Sneakers, Cappuccino, Coccodrillo, Aereo, Banana,
Scimmia, Ballerina — and characters emerge through play.

## How it differs from SuikaCraft (`apps/life-merge`)

- **One world, no presets.** The preset/style machinery is gone; the brainrot
  grammar is hardcoded in `generation.ts`.
- **Figure physics.** Generated images are requested on a plain white
  background; `figure.ts` flood-fills the background away, cuts out the
  sprite, and builds a simplified convex hull (≤12 vertices). The hull —
  area-normalized to the tier circle so the size economy stays intact —
  becomes the matter-js body. Shapes change how pieces rest, wedge, and
  stack, never how much board space a tier is worth. Circle fallback when
  extraction fails.
- **Voice.** Each generated character comes with an Italian catchphrase
  (blasphemy/profanity filtered, with prompt rules and a regex blocklist as
  defense in depth). It is spoken via ElevenLabs TTS (`adam` — the canonical
  brainrot narrator voice) on discovery, and replayed by clicking a piece.
  The 🔊 Voce button mutes the narrator.

## Stack

- Vite, React, TypeScript
- Matter.js — circles for placeholders, convex hulls for figures
- `@pollinations/sdk/react` for BYOP login
- `@pollinations/ui` for app chrome, wallet chips, and controls
- Pollinations `claude` text generation for character name/lore/catchphrase
- Pollinations `zimage` image generation for character art
- Pollinations `elevenlabs` TTS for the narrator

## Local Development

```bash
npm install
npm run dev
```

Run from `apps/brainrot-merge`.

No app key is committed. Without one, auth uses only the current
`redirect_uri`, so requests are not attributed to a named app key. To enable
app attribution, create a dedicated publishable App Key at
`https://enter.pollinations.ai`, add the local or production redirect URL,
and run/build with:

```bash
VITE_POLLINATIONS_APP_KEY=pk_your_publishable_key npm run build
```

## Scripts

```bash
npm run typecheck
npm run build
npm run preview
```

## Notes

- Gameplay requires Pollinations login because playable pieces must be
  generated.
- Images and audio are fetched with the delegated key as blobs and rendered
  from local object URLs, so the key never appears in media URLs.
- Canonical brainrot characters are deliberately NOT reproduced: the prompt
  instructs the model to invent new characters in the same naming grammar
  (the canonical lines contain blasphemy, and some characters have
  third-party IP claims).
