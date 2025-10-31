# SOURCE ASSETS (DO NOT DELETE)

These are the **only files you need to keep**. Everything else can be regenerated.

## Files:

- **`logo.svg`** - White bee logo (for favicons, icons)
- **`logo-text.svg`** - White bee logo + "pollinations.ai" text (for OG images/banners)

## Usage:

All PWA assets (favicons, icons, banners) are **generated** from these source files using:

```bash
cd shared/pwa-assets
npm run generate
```

## Colors:

Background colors are configured in `app-configs.js`:
- **enter.pollinations.ai**: Purple `#5b2dd8`
- **pollinations.ai**: Magenta `#d6379e`  
- **auth.pollinations.ai**: Orange `#e67e00`

The generator applies:
1. Colored background (from config)
2. White tinted logo on top

---

**Everything in the app `public/` directories can be deleted and regenerated from these sources!**
