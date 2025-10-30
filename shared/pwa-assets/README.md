# PWA Assets Generator

Centralized PWA asset generation for Pollinations applications.

## Overview

This package generates all PWA icons, favicons, Apple touch icons, and social media images from a single source SVG file (`source.svg`).

## Usage

```bash
# Generate assets for all apps
npm run generate:all

# Generate assets for specific apps
npm run generate:enter        # enter.pollinations.ai
npm run generate:pollinations  # pollinations.ai
npm run generate:auth         # auth.pollinations.ai
```

## Generated Assets

For each app, the following assets are generated:

### Favicons
- `favicon.ico` (32x32)
- `favicon-16x16.png`
- `favicon-32x32.png`

### PWA Icons
- `icon-192.png` or `android-chrome-192x192.png` (standard)
- `icon-192-maskable.png` (adaptive Android)
- `icon-512.png` or `android-chrome-512x512.png` (standard)
- `icon-512-maskable.png` (adaptive Android)

### Apple Touch Icons
- `apple-touch-icon.png` (180x180)
- `apple-touch-icon-152x152.png` (iPad)
- `apple-touch-icon-167x167.png` (iPad Pro)

### Social Media
- `og-image.png` (1200x630) - For enter and pollinations apps only

## Source File

The source file is `source.svg`, which is a copy of `/assets/pollinations_ai_logo_black.svg`.

## Output Directories

- **enter.pollinations.ai**: `../../enter.pollinations.ai/public/`
- **pollinations.ai**: `../../pollinations.ai/public/`
- **auth.pollinations.ai**: `../../auth.pollinations.ai/media/`

## Integration

Add to your app's `package.json`:

```json
{
  "scripts": {
    "prebuild": "cd ../shared/pwa-assets && npm run generate:yourapp",
    "build:pwa": "cd ../shared/pwa-assets && npm run generate:yourapp"
  }
}
```

## Notes

- Icons are generated with transparent backgrounds
- Maskable icons include 20% safe zone padding
- All PNG outputs are optimized with sharp
- The favicon.ico is currently a 32x32 PNG (proper multi-resolution ICO support can be added if needed)
