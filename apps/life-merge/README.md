# Life Merge

A small Pollinations demo game that combines Suika-style falling physics with a constrained biological grammar.

Two objects of the same physical scale merge into a generated natural/organic result at the next scale. Scale controls radius and physics only; generated names and descriptions are the player-facing discoveries.

The physics engine only sees circles. Pollinations text and image generation upgrade the surface: names, short descriptions, and circular specimen art.

The current axis starts from simple seeds such as water, sugar, yeast, moss, fish, frog, and mushroom, then asks the model to stay in a natural biology lane.

Visual style presets keep tokens legible at small sizes:

- Blueprint: white contour on a tier-tinted technical ground
- Risograph: two-color overprint with warm grain
- Ink Wash: minimal sumi-e brushwork on warm tinted paper

## Stack

- Vite, React, TypeScript
- Matter.js for 2D circle physics
- `@pollinations/sdk/react` for BYOP login
- `@pollinations/ui` for app chrome, wallet chips, and controls
- Pollinations `claude-large` text generation for merged specimen metadata
- Pollinations `zimage` image generation for playable specimen art
- Blueprint, Risograph, and Ink Wash token style presets

## Local Development

```bash
npm install
npm run dev
```

Run from `apps/life-merge`.

No app key is committed. Without one, auth uses only the current `redirect_uri`, so requests are not attributed to a named app key. To enable app attribution, create a dedicated publishable App Key at `https://enter.pollinations.ai`, add the local or production redirect URL, and run/build with:

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

- Gameplay requires Pollinations login because playable pieces must be generated.
- Each seed image and successful merge asks Pollinations for specimen art; merges also generate names and one-sentence descriptions.
- Images are fetched with the delegated key as blobs and rendered with local object URLs, so the key is not placed in image URLs.
