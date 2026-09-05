# Pollinations AI for GIMP 3

A GIMP 3 plug-in that brings Pollinations image generation and editing into
GIMP, each user paying out of their own Pollinations (Pollen) account via
**BYOP** (Bring Your Own Pollen) device authorization — no API key is ever
pasted into GIMP.

## Features

- **Connect Account…** — RFC 8628 device-flow authorization. The plug-in
  requests a device code, shows a verification URL + user code with an
  *Open Browser* button, and polls until approval. The resulting user key
  (`sk_...`) is stored privately (mode `0600`) and survives restarts.
- **Generate Image…** — pick any image model loaded live from
  [`/image/models`](https://gen.pollinations.ai/image/models) (community
  models included, nothing hardcoded), enter a prompt, and add the result as
  a new layer (or a new image when none is open).
- **Edit with AI…** — only models that advertise image input are shown. The
  active layer/selection is exported as a PNG data URI and sent for editing;
  the result returns as a NEW layer. The source is never altered.
- **Disconnect** — removes the stored authorization.
- Clear recovery messages for expired authorization, insufficient Pollen,
  network failures, and API errors.
- No masks, batch queues, history, video, or dashboard — kept focused.

## Requirements

- GIMP 3 (its bundled Python 3)
- Pillow (`pip install pillow`) available to GIMP's Python interpreter

The data/auth/catalog logic in `pollinations_api.py` is pure standard library
so it runs in GIMP 3's Python without a pip-managed environment beyond Pillow.

## Installation

1. Copy `pollinations_gimp.py` and `pollinations_api.py` into a folder named
   `pollinations-gimp` under your GIMP 3 plug-ins directory:

   | OS      | Path |
   |---------|------|
   | Linux   | `~/.config/GIMP/3.0/plug-ins/pollinations-gimp/` |
   | macOS   | `~/Library/Application Support/GIMP/3.0/plug-ins/pollinations-gimp/` |
   | Windows | `%APPDATA%\GIMP\3.0\plug-ins\pollinations-gimp\` |

2. Make the plug-in executable on Unix:

   ```bash
   chmod +x pollinations_gimp.py
   ```

3. Ensure Pillow is available to GIMP's Python. On Linux this is usually the
   system Python, e.g. `sudo apt install python3-pil` or
   `pip install --user pillow` for the interpreter GIMP 3 uses.

4. Restart GIMP. You'll see **Filters ▸ Pollinations AI**.

## Usage

1. **Filters ▸ Pollinations AI ▸ Connect Account…** — a dialog shows a URL
   and code. Open the URL, approve, and the plug-in stores your key.
2. **Generate Image…** — choose a model, enter a prompt, set width/height.
   The result is added as a new layer.
3. **Edit with AI…** — select a layer (optionally a selection), choose an
   image-input model (e.g. FLUX.2 Pro), describe the edit. The result is added
   as a new layer.
4. **Disconnect** — removes the stored key.

## Manual end-to-end check

1. Connect Account → approve in browser → "Connected" message.
2. Restart GIMP → still connected (key persists).
3. Generate Image → new layer appears.
4. Select a layer, Edit with AI → new layer appears, source unchanged.
5. Disconnect → token file removed.

## Tests

The pure API/auth/catalog layer is tested without GIMP or network:

```bash
cd apps/gimp-plugin
python3 -m unittest discover -s tests -v
```

## App Key

The device flow sends a publishable `client_id` (default
`pk_pollinations_gimp`) for attribution. To use your own, create an App Key at
enter.pollinations.ai and set `DEFAULT_CLIENT_ID` in `pollinations_api.py`.
The user's own `sk_...` authorization stays private to their device.
