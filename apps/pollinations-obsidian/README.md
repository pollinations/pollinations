# Pollinations AI for Obsidian

[![Quest](https://img.shields.io/badge/Quest-%2315574%20(FIXED)-blue)](https://github.com/pollinations/pollinations/issues/15574)
[![obsidian](https://img.shields.io/badge/Obsidian-0.15.0+-478bff)](https://obsidian.md)

Generate **text** and **images** with [Pollinations AI](https://pollinations.ai) directly inside your Obsidian notes. Pay with your own Pollen via device flow.

## Features

- **Text generation** at cursor from prompt or selection
- **Image generation** — saves to vault and embeds in note
- **Model picker** — browse live text/image/audio model lists
- **Device flow auth** (BYOP — Bring Your Own Pollen)
- **Settings** — set API key, default models

## Installation

### Manual (development)

```bash
git clone https://github.com/g33ky00/obsidian-pollinations.git
cd obsidian-pollinations
npm install
npm run build
```

Then in Obsidian:
1. **Settings → Core Plugins → Toggle OFF** the "Restricted mode" (if needed)
2. **Settings → Community Plugins → Browse → Load unpacked plugin**
3. Select the `obsidian-pollinations` folder

### Recommended (release)

1. Download the latest release from the [releases page](https://github.com/g33ky00/obsidian-pollinations/releases)
2. Extract to `<vault>/.obsidian/plugins/obsidian-pollinations/`
3. Enable in **Settings → Community Plugins**

## Usage

### Generate text

1. Select text or place cursor where you want generation
2. Press the hotkey (default: `Ctrl/Cmd + Shift + P` → "Pollinations: Generate text at cursor")
3. The generated text is inserted at the cursor position

### Generate image

1. Select text (the image prompt) or place cursor
2. Run "Pollinations: Generate image from selection"
3. Image is saved to vault and embedded as `![[filename.png]]`

### Pick models

Run "Pollinations: Pick model" to fetch and display the current model catalog.

### Authenticate (BYOP)

1. Get a publishable key (`pk_...`) from [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys)
2. Set it in **Settings → Plugin Options → Pollinations AI**
3. Run "Pollinations: Authenticate with device flow"
4. Visit the URL shown and enter the code
5. Your access token is stored and used for all subsequent requests

## API Endpoints

| Feature | Endpoint |
|---|---|
| Text (chat) | `POST https://gen.pollinations.ai/v1/chat/completions` |
| Image | `GET https://image.pollinations.ai/{prompt}?model=&width=&height=` |
| Speech | `GET https://gen.pollinations.ai/audio/{prompt}?voice=` |
| Models | `GET https://gen.pollinations.ai/{text\|image\|audio}/models` |
| Device flow | `POST https://enter.pollinations.ai/device` |

## Building

```bash
npm install
npm run build
```

For development with hot reload:

```bash
npm run dev
```

## Demo

### Text generation
1. Open a note or create a new one
2. Type or select a prompt (e.g., "Describe a fantasy tavern")
3. Run **Pollinations: Generate text at cursor** (or use the ribbon icon)
4. The generated text is inserted at the cursor position

### Image generation
1. Select an image prompt (e.g., "A cyberpunk city at night")
2. Run **Pollinations: Generate image from selection**
3. The PNG is saved to your vault and embedded as `![[pollinations_cyberpunk-city_1234567890.png]]`

### Device flow (BYOP)
1. Get a `pk_...` publishable key from [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys)
2. Paste it in **Settings → Plugin Options → Pollinations AI → API Key**
3. Run **Pollinations: Authenticate with device flow**
4. A notice shows the verification URL + code — open it in a browser and approve
5. Your access token is stored and used for all subsequent requests

## License

MIT

## Quest

This plugin fulfills [Quest #15574](https://github.com/pollinations/pollinations/issues/15574) — _[QUEST] Pollinations plug-in for Obsidian_
