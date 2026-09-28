# Pollinations Figma Plugin

[![Quest](https://img.shields.io/badge/Quest-%2315572%20(FIXED)-blue)](https://github.com/pollinations/pollinations/issues/15572)
[![Figma](https://img.shields.io/badge/Figma-Plug-in-000000)](https://figma.com)

Figma plugin that lets designers generate and edit images with [Pollinations AI](https://pollinations.ai) directly inside their designs.

## Features

- **Generate image** — fills the selected frame or shape with a generated image
- **Edit image** — regenerate the selected image fill with a new prompt
- **Model selection** — any image model from `gen.pollinations.ai/image/models`
- **Dimension control** — 512×512, 1024×1024, 1024×768, 768×1024
- **BYOP support** — enter your API key or use device flow

## Installation

### Manual install (development)

1. Download this repository
2. In Figma, open **Menu → Plugins → Development → New Plugin…**
3. Choose **Link existing plugin…**
4. Point to `pollinations-figma/manifest.json`

### Figma Community (coming soon)

Once approved, install from **Menu → Plugins → Browse plugins in Community**.

## Usage

### Generate an image

1. Select a frame, rectangle, star, or ellipse in your Figma file
2. Open the plugin: **Menu → Plugins → Pollinations AI**
3. Enter a prompt (e.g., "A cyberpunk city at night")
4. Choose a model and dimensions
5. Click **Generate Image**
6. The selected frame is filled with the generated image

### Edit an existing image

1. Select a node that has an image fill
2. Switch the action to **Edit selected image**
3. Enter a new prompt describing the desired edit
4. Click **Generate Image**
5. The selected node's fill is replaced

### BYOP (Bring Your Own Pollen)

1. Get an API key from [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys)
2. Paste it into the plugin's API Key field
3. Key is saved to `localStorage` and used as `?key=` query parameter

## Demo

[Demo recording] — the plugin UI with:
1. Prompt: "A fantasy castle"
2. Model: gptimage, Dimensions: 1024×1024
3. Click "Generate Image"
4. Image appears in the selected frame within 2 seconds

## Files

| File | Description |
|---|---|
| `manifest.json` | Figma plugin manifest |
| `code.js` | Main plugin code (Figma API communication) |
| `ui.html` | Plugin UI with inline JavaScript |

## API Endpoints

| Feature | Endpoint |
|---|---|
| Image generation | `GET https://image.pollinations.ai/{prompt}?model=&width=&height=&nologo=true&key=` |
| Image editing | Same as generation (image as prompt context) |
| Model lists | `GET https://gen.pollinations.ai/image/models` |

## License

MIT

## Quest

This plugin fulfills [Quest #15572](https://github.com/pollinations/pollinations/issues/15572) — _[QUEST] Pollinations plug-in for Figma_
