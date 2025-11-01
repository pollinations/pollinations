# PWA Asset Generator

Single source of truth for all logos and PWA assets.

## Source Files

```
/assets/
├── logo.svg          ← Bee logo only
└── logo-text.svg     ← Bee + text
```

**Only edit these 2 files. Everything else is generated.**

## What Gets Generated

- Favicons (16x16, 32x32, .ico)
- PWA Icons (192x192, 512x512, maskable)
- Apple Touch Icons (180, 152, 167)
- OG Images (1200x630 for social media)
- React component logos (copied to src/)

Color transforms applied automatically (black → white).

## Usage

```bash
npm run generate              # All apps
npm run generate:enter        # enter.pollinations.ai
npm run generate:pollinations # pollinations.ai
npm run generate:auth         # auth.pollinations.ai
```

## Output Locations

```
enter.pollinations.ai/public/  ← Enter assets
pollinations.ai/public/        ← Main site PWA assets
pollinations.ai/src/logo/      ← React imports
auth.pollinations.ai/media/    ← Auth assets
```

## Rules

1. Never edit generated files (they'll be overwritten)
2. Only edit source SVGs in `/assets/`
3. Always regenerate after changing sources
4. Commit generated files with source changes

## Configuration

**Colors & settings:** `app-configs.js`
- enter: Purple `#5b2dd8`
- pollinations: Magenta `#d6379e`
- auth: Orange `#e67e00`

**SEO metadata:** Also in `app-configs.js` under `seo` property
