# Pollinations AI — GIMP 3 Plug-in

Generate and edit images inside GIMP using the [Pollinations AI](https://pollinations.ai/) API.
Each user authenticates through their own Pollinations account via the BYOP device-flow — no API
key is ever typed into GIMP.

## Features

- **Connect Account** — one-time browser authorization; token is stored locally and survives GIMP restarts.
- **Generate Image** — pick any image model loaded at runtime from `/image/models`, enter a prompt, and receive the result as a new GIMP image or an additional layer.
- **Edit with AI** — send the active layer to an image-to-image model (e.g. FLUX Kontext) and receive the result as a new layer; the source layer is never modified.
- **Disconnect** — removes the stored token at any time.

Model capabilities (whether a model accepts image input) are read from the API, so controls are shown or hidden automatically — nothing is hardcoded.

## Requirements

| Requirement | Notes |
|---|---|
| GIMP 3.0 or later | Python-Fu / GObject-Introspection enabled |
| Python 3.10 or later | Bundled with GIMP 3 on all platforms |
| Pollinations account | Free at [pollinations.ai](https://pollinations.ai/) |
| Pollen balance | Free Pollen covers standard models; paid models (FLUX Kontext, FLUX.2 Pro) require a Paid Pollen balance |

No third-party Python packages are needed.

## Installation

GIMP 3 loads plug-ins from a directory whose name matches the plug-in filename.
Install by copying the `pollinations_gimp` folder to your platform's plug-in directory.

### Linux

```bash
PLUGIN_DIR="$HOME/.config/GIMP/3.0/plug-ins/pollinations_gimp"
mkdir -p "$PLUGIN_DIR"
cp apps/gimp-plugin/pollinations_gimp.py "$PLUGIN_DIR/"
chmod +x "$PLUGIN_DIR/pollinations_gimp.py"
```

### macOS

```bash
PLUGIN_DIR="$HOME/Library/Application Support/GIMP/3.0/plug-ins/pollinations_gimp"
mkdir -p "$PLUGIN_DIR"
cp apps/gimp-plugin/pollinations_gimp.py "$PLUGIN_DIR/"
chmod +x "$PLUGIN_DIR/pollinations_gimp.py"
```

### Windows

1. Open File Explorer and navigate to `%APPDATA%\GIMP\3.0\plug-ins\`.
2. Create a folder named `pollinations_gimp`.
3. Copy `pollinations_gimp.py` into that folder.

GIMP on Windows uses its bundled Python interpreter; no separate installation is needed.

### Restart GIMP

After installation (or after upgrading the plug-in) restart GIMP.
The menu **Filters ▸ Pollinations AI** should appear.

## Usage

### 1. Connect your Pollinations account

Go to **Filters ▸ Pollinations AI ▸ Connect Account…**

A dialog appears showing:
- A verification URL (`enter.pollinations.ai/device`)
- A short approval code

Click **Open Browser**. Approve the plug-in in the browser tab that opens.
The dialog detects approval automatically and closes.
Your token is saved to `~/.config/GIMP/3.0/pollinations/token.json` (Linux/macOS)
or the equivalent Windows path.

### 2. Generate an image

Go to **Filters ▸ Pollinations AI ▸ Generate Image…**

- **Model** — dropdown populated at runtime from the Pollinations API.
- **Prompt** — describe the image you want.
- **Width / Height** — output dimensions (default matches the open canvas, or 1024 × 1024).
- **Insert as new layer** — checked by default when a canvas is open; uncheck to open the result as a standalone image.

### 3. Edit the active layer

Open an image, select a layer, then go to **Filters ▸ Pollinations AI ▸ Edit with AI…**

Only models that advertise image input (e.g. FLUX Kontext, FLUX.2 Pro) are listed.
Enter a plain-English edit instruction and click **Generate**.
The edited result is added as a new layer above the original; nothing is overwritten.

### 4. Disconnect

**Filters ▸ Pollinations AI ▸ Disconnect** removes the saved token from your computer.

## App Key

The plug-in ships with a placeholder App Key (`pk_gimp_plugin`) for attribution.
If you maintain a fork or distribution of this plug-in, replace `APP_KEY` in
`pollinations_gimp.py` with your own publishable key from
[enter.pollinations.ai/keys](https://enter.pollinations.ai/keys).

## Error reference

| Message | Cause | Fix |
|---|---|---|
| "Not connected" | No stored token | Run Connect Account |
| "Could not load the model list" | Network error | Check internet, try again |
| "No image-editing models available" | No Paid Pollen balance | Add balance at enter.pollinations.ai |
| "HTTP 401" | Token expired | Disconnect then Connect Account again |
| "HTTP 402" | Insufficient Pollen | Add balance at enter.pollinations.ai |

## Development

```bash
# Run the unit tests (no GIMP or network required)
python -m pytest apps/gimp-plugin/tests/ -v

# Or with the standard library runner
python -m unittest discover -s apps/gimp-plugin/tests -v
```

Tests cover token persistence, model filtering, URL encoding, and data-URI construction.
The GIMP API calls and GTK dialogs are excluded from automated tests; see the
end-to-end demonstration section below.

## End-to-end demonstration

1. Install into GIMP 3 as described above.
2. Open **Filters ▸ Pollinations AI ▸ Connect Account…** and authorize in the browser.
3. With a blank canvas open, run **Generate Image…**, choose `flux`, and enter `a sunset over mountains`.
4. A new layer "Pollinations: a sunset over mountains" appears on the canvas.
5. With that layer selected, run **Edit with AI…**, choose `kontext`, and enter `make the mountains snow-capped`.
6. A new layer "AI edit: make the mountains snow-capped" appears above the original.
