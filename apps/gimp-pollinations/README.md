# Pollinations AI for GIMP 3

A GIMP 3 plug-in that brings Pollinations image generation and editing to GIMP with Bring Your Own Pollen (BYOP) support. Each user pays through their own Pollinations account.

## Features

- **BYOP Device Authorization** — connect your Pollinations account without pasting API keys
- **Live Model Catalog** — loads all available image models at runtime, including community models
- **Text-to-Image** — generate images from prompts and add them as new layers/images
- **AI Editing** — send the active layer to AI for editing, result returns as a new layer
- **Clear Error Messages** — expired auth, network failures, and API errors show actionable recovery

## Installation

Copy `pollinations.py` to your GIMP 3 plug-in directory:

| Platform | Path |
|----------|------|
| Linux | `~/.config/GIMP/3.0/plug-ins/pollinations.py` |
| macOS | `~/Library/Application Support/GIMP/3.0/plug-ins/pollinations.py` |
| Windows | `%APPDATA%\GIMP\3.0\plug-ins\pollinations.py` |

Make the file executable (Linux/macOS):
```bash
chmod +x ~/.config/GIMP/3.0/plug-ins/pollinations.py
```

Restart GIMP. The plug-in appears under **Filters > AI > Pollinations**.

## Usage

### Connect Your Account
1. Go to **Filters > AI > Pollinations > Connect Account**
2. A dialog opens with a URL and code
3. Open the URL in your browser and enter the code
4. Approve the connection — GIMP shows "Connected" when done

### Generate Images
1. Go to **Filters > AI > Pollinations > Generate...**
2. Select a model from the dropdown
3. Enter your prompt
4. Set dimensions and optional seed
5. Click "Generate Image"
6. The result opens as a new GIMP image

### Edit Layers
1. Select a layer in the Layers panel
2. Go to **Filters > AI > Pollinations > Edit with AI...**
3. Enter your editing prompt
4. Click "Edit Active Layer"
5. The edited result appears as a new image

## Account Management

- **Disconnect**: Filters > AI > Pollinations > Disconnect Account
- Token stored at: `~/.config/pollinations-gimp/token.json`
- Models cached at: `~/.config/pollinations-gimp/models_cache.json`

## Requirements

- GIMP 3.0 or later
- Python 3 with `gi` (PyGObject) bindings
- A Pollinations account with Pollen credits

## License

MIT
