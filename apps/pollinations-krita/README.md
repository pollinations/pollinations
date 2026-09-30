# Pollinations Krita Plugin

> Generate and edit AI images directly inside [Krita](https://krita.org) with the [Pollinations API](https://pollinations.ai). Pay with your own Pollen.

## Features

- 🎨 **Text-to-image** — Type a prompt, get a full-resolution image in Krita's canvas
- ✏️ **Image editing** — Send your current Krita canvas to Pollinations for img2img editing
- 🖼️ **Canvas presets** — A4, A3, 4K, square, portrait, and custom sizes
- 🐝 **Pollen payment** — Log in with your Pollinations account to use your Pollen balance
- 🖥️ **Web + Native** — Use the web app directly, or install the Python plugin for a native Krita Docker panel

## Quick Start

### Option 1 — Web App

1. Go to **[krita.pollinations.ai](https://krita.pollinations.ai)**
2. Click **Log In** and authorize with your Pollinations account
3. Enter your prompt, pick a canvas size, and click **Generate**
4. Download the result or click **Edit Again** to iterate

### Option 2 — Native Krita Plugin

1. Download:
   - [`pollinations_krita.py`](krita/pollinations_krita.py)
   - [`pollinations_krita.desktop`](krita/pollinations_krita.desktop)
2. Copy both files to your Krita Python plugins directory:
   - **Linux**: `~/.local/share/krita/pykrita/pollinations_krita/`
   - **macOS**: `~/Library/Application Support/Krita/pykrita/pollinations_krita/`
   - **Windows**: `%APPDATA%\krita\pykrita\pollinations_krita\`
3. Restart Krita → Settings → Configure Krita → Python Plugin Manager → enable **Pollinations AI**
4. Open the Docker: Settings → Docker → Pollinations AI

**Requirements**: Krita 5.2+ with Python 3 and PyQt5-WebEngine.

### Option 3 — Polli CLI

```bash
npx polli image "a serene mountain landscape at sunset" --save mountain.png
```

## API Usage

### Text-to-image

```
GET https://gen.pollinations.ai/image/{prompt}
  ?width=1024&height=1024
  &model=nanobanana-2-lite
  &key=YOUR_API_KEY
```

### Image editing (img2img)

```
GET https://gen.pollinations.ai/image/{prompt}
  ?width=1024&height=1024
  &model=gptimage
  &image={reference_url}&enhance=true
  &key=YOUR_API_KEY
```

### Authentication

```
GET https://enter.pollinations.ai/authorize
  ?app_key=pk_krita_plugin_v1
  &redirect_url={your_url}
  &budget=5
  &permissions=profile,usage
```

## Web App Structure

```
apps/pollinations-krita/
├── deploy.json          # Cloudflare Pages: krita.pollinations.ai
├── index.html           # Main UI
├── script.js            # UI logic + generation flow
├── ai.js                # API utilities (auth, generation, upload)
├── styles.css           # Comic-style UI theming
├── krita/
│   ├── pollinations_krita.py   # Native Krita Docker plugin
│   └── pollinations_krita.desktop
├── og-image.png         # Social preview
└── README.md
```

## Available Models

| Model | Provider | Notes |
|---|---|---|
| `nanobanana-2-lite` | OpenRouter | Default for Krita (image edit + gen) |
| `nanobanana` | OpenRouter | Alternative image model |
| `gptimage` | OpenAI/Azure | High-quality generation |
| `kokoro` | Various | Inpainting and fine edits |
| `auto` | — | Auto-selects best available model |

## Development

```bash
# Clone and install
git clone https://github.com/pollinations/pollinations.git
cd pollinations/apps/pollinations-krita

# Test locally (any static server works)
npx serve .

# Deploy (Cloudflare Pages auto-deploys on merge to main)
```

## License

Part of the [Pollinations.AI](https://github.com/pollinations/pollinations) ecosystem.
