# PWA Asset Generator

**Single source of truth for all logos and PWA assets.**

## 📁 Source Files (Only 2!)

```
/assets/
├── logo.svg          ← Bee logo only
└── logo-text.svg     ← Bee logo + "pollinations.ai" text
```

**These are the ONLY logo files you should ever edit.**

## 🎨 What Gets Generated

From these 2 files, the script automatically generates:

- **Favicons** (16x16, 32x32, .ico)
- **PWA Icons** (192x192, 512x512, maskable)
- **Apple Icons** (180x180, 152x152, 167x167)
- **OG Images** (1200x630 social media previews)
- **Component Logos** (copied for React imports)
- **Watermark Logo** (for image.pollinations.ai)

**Color transforms applied automatically** (black → white via code).

## 🚀 Usage

```bash
# Generate assets for all apps
npm run generate

# Generate for specific app
npm run generate:enter
npm run generate:pollinations
npm run generate:auth
```

## 📍 Output Locations

```
enter.pollinations.ai/public/     ← All enter assets
pollinations.ai/public/           ← PWA/OG assets
pollinations.ai/src/assets/logo/  ← React component logos
auth.pollinations.ai/media/       ← Auth assets
image.pollinations.ai/logo.png    ← Watermark logo
```

## ⚠️ Important Rules

1. **Never edit generated files directly** - they'll be overwritten
2. **Only edit the 2 source SVGs** in `/assets/`
3. **Always regenerate after changing sources**
4. **Commit generated files** with source changes

## 🔧 How It Works

1. Reads black logos from `/assets/`
2. Applies color transforms (black → white)
3. Resizes for each target size
4. Composites on colored backgrounds
5. Copies to app directories

**Configured in:** `app-configs.js`  
**Generator:** `generate-assets.js`

## 🎯 Per-App Configuration

Each app has its own colors and settings in `app-configs.js`:

- **enter**: Purple theme (`#5b2dd8`)
- **pollinations**: Magenta theme (`#d6379e`)
- **auth**: Orange theme (`#e67e00`)

## 📝 SEO Configuration

SEO settings (title, description, URL) are also in `app-configs.js` under the `seo` property.

---

**Questions?** Check the code or ask in Discord!
