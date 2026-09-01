# Pollinations AI — GIMP 3 plug-in

Generate and edit images inside GIMP using [Pollinations.ai](https://pollinations.ai)'s image API. Every user authenticates through their own Pollinations account via the BYOP device-flow — no API key is ever pasted into GIMP.

## Features

- **BYOP device-flow auth** — opens a browser for approval; your API key stays private.
- **Runtime model picker** — fetches `/image/models` at runtime; no model IDs hardcoded.
- **Generate** — text-to-image via `GET /image/{prompt}`; result added as a new image or layer.
- **Edit with AI** — sends the active layer (or selection crop) to `POST /v1/images/edits` as a genuine multipart file upload. The source layer is never modified.
- **Resolution picker** — offers standard resolutions when the model advertises them.
- **No data URIs** — source pixels are exported as PNG bytes, never base64-encoded inline.
- **Model capability gating** — edit-capable models must have `"image"` in both `input_modalities` and `output_modalities`.
- **Clear error messages** — 401 → expired token, 402 → insufficient pollen, 429 → rate limit, network errors → connectivity hint.

## Requirements

- GIMP 3.0+ (Python plug-in support enabled)
- Python 3.8+
- A [Pollinations account](https://pollinations.ai) (free tier available)

## Installation

Copy the directory `apps/gimp-plugin/` into GIMP's plug-ins folder, then restart GIMP. The plug-in must live inside a folder named `pollinations_gimp/`.

### Linux

```bash
cp -r apps/gimp-plugin ~/.config/GIMP/3.0/plug-ins/pollinations_gimp/
```

### macOS

```bash
cp -r apps/gimp-plugin ~/Library/Application\ Support/GIMP/3.0/plug-ins/pollinations_gimp/
```

### Windows

```
%APPDATA%\GIMP\3.0\plug-ins\pollinations_gimp\
```

After copying, make the script executable (Linux/macOS):

```bash
chmod +x ~/.config/GIMP/3.0/plug-ins/pollinations_gimp/pollinations_gimp.py
```

Restart GIMP. The menu appears under **Filters ▸ Pollinations AI**.

## Usage

### Connect Account

1. **Filters ▸ Pollinations AI ▸ Connect Account…**
2. GIMP opens your browser to the Pollinations approval page.
3. Approve access. GIMP receives your token automatically.

Your token is stored at `~/.config/pollinations-gimp/token.json` with `0600` permissions.

### Generate Image

1. **Filters ▸ Pollinations AI ▸ Generate Image…**
2. Pick a model, enter a prompt, set width/height.
3. Optionally check **Add as new layer** to insert the result into the current image.
4. Click **Generate**.

### Edit with AI

1. Open an image, optionally make a selection.
2. **Filters ▸ Pollinations AI ▸ Edit with AI…**
3. Pick an image-input model (filtered to those that accept `image` in `input_modalities`).
4. Enter your edit prompt and click **Generate**.
5. The result appears as a new layer. The original layer is untouched.

### Disconnect

**Filters ▸ Pollinations AI ▸ Disconnect** — removes your stored token.

## Testing

Unit tests require only Python (no GIMP installation):

```bash
cd apps/gimp-plugin
python3 -m pytest tests/test_pollinations_gimp.py -v
```

## Model support

The model list is fetched live from `https://gen.pollinations.ai/image/models`. Any model with `"image"` in its `output_modalities` appears in the picker. Models with `"image"` in `input_modalities` also appear in the edit dialog.

Image-editing models on Pollinations include FLUX Kontext, GPT Image, Nova Canvas, Seedream, nanobanana, and others. Full list: <https://pollinations.ai/models>.

## License

MIT — see repository root for details.
