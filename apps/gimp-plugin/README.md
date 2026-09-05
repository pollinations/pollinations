# Pollinations AI for GIMP 3

GIMP 3 Python plug-in for Pollinations image generation and selection-aware
editing. A generated image can open as a new image or be added as a new layer;
edits always preserve the source and return a new layer.

## Install

GIMP discovers a Python plug-in only when its directory and executable share
the same base name. Copy the file to exactly this layout:

```text
pollinations_gimp/
└── pollinations_gimp.py
```

Place that directory under the user plug-in directory:

- Linux: `${XDG_CONFIG_HOME:-~/.config}/GIMP/3.0/plug-ins/`
- macOS: `~/Library/Application Support/GIMP/3.0/plug-ins/`
- Windows: `%APPDATA%\GIMP\3.0\plug-ins\`

On Linux and macOS, run `chmod 755 pollinations_gimp.py`. Restart GIMP 3 and
confirm these entries appear under `Filters > AI > Pollinations AI`:

- `Connect Account…`
- `Disconnect Account`
- `Generate or Edit…`

The plug-in uses only Python's standard library and the `gi` bindings bundled
with GIMP 3.

## Use

Choose `Connect Account…`, then select `Open Browser`. GIMP displays the code
while polling in a worker thread; Cancel stops polling. Authorization requests
only the `generate` scope. The delegated token persists across GIMP restarts.

`Generate or Edit…` loads the live image-model catalog without blocking GTK.
Choose `New image` or `New layer in current image`. Editing is offered only for
models that advertise image input and the edits endpoint, and sends only the
active drawable plus the active selection when present. Model loading and
generation run outside the GTK thread, and their progress dialogs can be
dismissed without freezing GIMP.

`Disconnect Account` deletes the stored token immediately. Token locations are:

- Linux: `${XDG_CONFIG_HOME:-~/.config}/pollinations-gimp/token.json`
- macOS: `~/Library/Application Support/pollinations-gimp/token.json`
- Windows: `%APPDATA%\pollinations-gimp\token.json`

## Privacy

The token is written atomically with Unix mode `0600` when supported. It is sent
only as an HTTPS bearer header to Pollinations API requests. Signed image-result
URLs are downloaded without the token. The plug-in does not log tokens, prompts,
image data, responses, or telemetry.

## Automated checks

From the repository root:

```bash
python -m unittest discover -s apps/gimp-plugin/tests -v
python -m py_compile apps/gimp-plugin/pollinations_gimp.py
```

The suite covers device approval, cancellation, expiry, token persistence,
platform paths, local HTTP requests, network errors, model validation, base64
and URL image responses, selection bounds, and generation/edit payloads.

## Reproducible GIMP 3 smoke test

1. Install using the exact directory layout above and restart GIMP 3. Confirm
   all three menu entries are discovered.
2. Connect, use `Open Browser`, approve the code, and generate once as a new
   image and once as a new layer. Confirm the dialogs remain responsive.
3. In a two-layer image, select the upper layer and a rectangle. Run an edit and
   confirm a third layer appears while both source layers remain unchanged.
4. Restart GIMP, generate without signing in again, then disconnect. Confirm the
   next generation asks for authorization.
5. Start login again and cancel before approval. Confirm polling stops without
   an error dialog.
