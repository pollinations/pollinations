# PWA Asset Generator

Centralized, **configurable** asset generation for all Pollinations apps.

## Usage

```bash
# Generate for all apps
npm run generate

# Generate for specific app
npm run generate:enter
npm run generate:pollinations
npm run generate:auth
```

## What it generates

- **Favicons:** 16x16, 32x32, favicon.ico
- **PWA icons:** 192x192, 512x512 (standard + maskable variants)
- **Apple touch icons:** 180x180, 152x152, 167x167
- **Social media OG images:** 1200x630

## 🎨 Flexible Configuration

Each app's assets are configured in `app-configs.js` with **per-icon-type customization**:

```javascript
{
  pollinations: {
    name: 'pollinations.ai',
    outputDir: 'pollinations.ai/public',
    
    // Source SVG to use
    sourceSvg: 'source.svg',  // or 'source-white.svg', 'custom-logo.svg'
    
    // Per-icon-type customization
    icons: {
      favicons: {
        background: 'transparent'  // Keep favicons transparent
      },
      pwa: {
        background: '#000000'      // PWA icons with black background
      },
      apple: {
        background: '#000000'      // Apple icons with black background
      },
      maskable: {
        background: '#000000'      // Maskable icons need solid backgrounds
      },
      og: {
        background: '#000000'      // Social preview background
      }
    }
  }
}
```

## Customization Examples

### 1. Transparent Favicons, Solid PWA Icons

```javascript
pollinations: {
  sourceSvg: 'source.svg',
  icons: {
    favicons: {
      background: 'transparent'  // ✅ Favicon stays transparent
    },
    pwa: {
      background: '#000000'      // ✅ PWA icons get black background
    },
    apple: {
      background: '#000000'      // ✅ Apple icons get black background
    }
  }
}
```

### 2. Different Source SVGs per App

```javascript
enter: {
  sourceSvg: 'source.svg',        // Black logo
},
pollinations: {
  sourceSvg: 'source-white.svg',  // White logo variant
}
```

### 3. Custom Colors per Icon Type

```javascript
icons: {
  favicons: {
    background: 'transparent'
  },
  pwa: {
    background: '#FFFFFF'  // White background for PWA
  },
  apple: {
    background: '#FF0000'  // Red background for Apple icons
  }
}
```

## Background Format Options

- `'transparent'` - Transparent background
- `'#000000'` - Hex color (black)
- `'#FFFFFF'` - Hex color (white)
- `{ r: 255, g: 0, b: 0, alpha: 1 }` - RGB object

## Adding New Source Assets

1. Add your SVG to `/shared/pwa-assets/`:
   ```bash
   cp /path/to/your-logo.svg shared/pwa-assets/source-custom.svg
   ```

2. Reference it in `app-configs.js`:
   ```javascript
   myApp: {
     sourceSvg: 'source-custom.svg',
     // ... rest of config
   }
   ```

3. Run the generator:
   ```bash
   npm run generate:myApp
   ```

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

## Output Directories

- **enter.pollinations.ai**: `enter.pollinations.ai/public/`
- **pollinations.ai**: `pollinations.ai/public/`
- **auth.pollinations.ai**: `auth.pollinations.ai/media/`

## Notes

- Maskable icons include 20% safe zone padding
- All PNG outputs are optimized with sharp
- The favicon.ico is currently a 32x32 PNG (proper multi-resolution ICO support can be added if needed)
- Default source: `source.svg` (from `/assets/pollinations_ai_logo_black.svg`)
