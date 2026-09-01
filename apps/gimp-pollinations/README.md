# Pollinations AI — GIMP 3 Plug-in (BYOP)

Generate and edit images inside GIMP 3 with your own Pollinations account.
Authorization uses the BYOP device flow (RFC 8628 style): the plug-in opens the
approval page in your browser — **you never paste an API key into GIMP**.

## Features

- **Connect / Disconnect** — `Filters ▸ Pollinations AI ▸ Connect Account…`
  shows a verification URL + approval code and opens the browser. The resulting
  user authorization (`sk_...`) is stored privately (mode `0600`, atomic write)
  in your per-user config dir and persists across GIMP restarts. `Disconnect`
  deletes it.
- **Generate Image…** — prompt → image → inserted as a new layer on the open
  canvas, or opened as a new standalone image.
- **Edit with AI…** — exports the active layer (cropped to the current
  selection, if any), sends it to a model that advertises image input, and
  returns the result as a **new** layer. The source layer is never modified.
- **Live model catalog** — the model picker is populated at runtime from
  [`/image/models`](https://gen.pollinations.ai/image/models) for the connected
  account, including community models. No model IDs are hardcoded.
- **Capability-driven controls** — the edit dialog lists only models whose
  `inputModalities` include `image`; resolution choices appear only when the
  model advertises `resolutions` (and then free-form width/height are locked);
  size/seed controls are hidden in edit mode. Unsupported options are never
  presented or sent.
- **Clear recovery messages** — distinct dialogs for expired authorization
  (HTTP 401/403 → "Connect Account" again), insufficient Pollen (HTTP 402),
  network failures, and other API errors.

## Layout

| File | Purpose |
|---|---|
| `pollinations_api.py` | Pure standard-library client: device flow, token store, model catalog, request building, error taxonomy. Importable without GIMP. |
| `pollinations_gimp.py` | GIMP 3 plug-in (GObject introspection, Gimp 3.0 API) with the GTK dialogs. Imports `pollinations_api`. |
| `tests/` | Unit tests that run with plain `python3` (no GIMP, no network). |

The API client deliberately uses only `urllib`/`json` from the standard
library — no third-party packages — because GIMP 3's bundled Python on
Windows/macOS has no pip environment users can rely on.

## Installation

Copy **both** `pollinations_gimp.py` and `pollinations_api.py` into a folder
named `pollinations-gimp` inside your GIMP 3 plug-ins directory.

### Linux

```bash
DEST="$HOME/.config/GIMP/3.0/plug-ins/pollinations-gimp"
mkdir -p "$DEST"
cp apps/gimp-pollinations/pollinations_gimp.py apps/gimp-pollinations/pollinations_api.py "$DEST/"
chmod +x "$DEST/pollinations_gimp.py"
```

### macOS

```bash
DEST="$HOME/Library/Application Support/GIMP/3.0/plug-ins/pollinations-gimp"
mkdir -p "$DEST"
cp apps/gimp-pollinations/pollinations_gimp.py apps/gimp-pollinations/pollinations_api.py "$DEST/"
chmod +x "$DEST/pollinations_gimp.py"
```

### Windows

1. Open `%APPDATA%\GIMP\3.0\plug-ins\` in Explorer.
2. Create a folder `pollinations-gimp`.
3. Copy `pollinations_gimp.py` and `pollinations_api.py` into it.

Restart GIMP. The menu **Filters ▸ Pollinations AI** appears.

## App Key (attribution)

`APP_KEY` in `pollinations_api.py` is a publishable `pk_...` key sent as
`client_id` when starting the device flow, so traffic is attributed to this
integration. To use your own, create one at
[enter.pollinations.ai/keys](https://enter.pollinations.ai/keys) and replace
the constant. The private per-user `sk_...` authorization is obtained at
connect time and is never embedded in the code.

## Tests

No GIMP, no network, no third-party packages required:

```bash
python3 -m unittest discover -s apps/gimp-pollinations/tests -v
```

27 tests cover: the device flow end-to-end against a scripted local HTTP
server (code request, pending → slow_down → approved, denied, network down),
HTTP 401/402/500 → error taxonomy mapping, model-catalog parsing (community
models, image-input capability, resolutions, video-model exclusion), edit
payload encoding (PNG → data URI, edit rejected for text-only models), and
token persistence (0600 perms, atomic write, corrupt-file handling).

## Manual end-to-end checklist (requires real GIMP 3)

Automated e2e was not run here (no GIMP 3 in CI); maintainers can verify:

1. Install as above; restart GIMP → **Filters ▸ Pollinations AI** is present.
2. **Connect Account…** → dialog shows URL + code; click *Open Browser*,
   approve; dialog auto-closes with "Connected as @you". Confirm
   `~/.config/pollinations-gimp/token.json` (Linux) exists with mode `0600`.
3. Restart GIMP → still connected (token persisted). **Disconnect** → file gone.
4. With a blank 1024×1024 canvas: **Generate Image…** → model picker lists the
   live catalog; pick `flux`, prompt "a sunset over mountains" → new layer
   "Pollinations: a sunset over mountains" appears; source untouched.
5. Uncheck "New layer on the current image" → result opens as a new image.
6. Select a layer, make a rectangular selection: **Edit with AI…** → only
   image-input models (e.g. `kontext`) are listed; prompt "make it snowy" →
   result appears as a **new** layer; the original layer is unchanged.
7. Switch to a text-only model in Generate → no edit path is offered; if the
   catalog advertises `resolutions` for a model, the resolution combo appears
   and width/height lock.
8. Error paths: disconnect network → clear connection error; revoke the key at
   enter.pollinations.ai then generate → "authorization expired" dialog and the
   stored token is cleared; exhaust balance → "Insufficient Pollen" dialog.

## Out of scope (by design)

No masks, batch queues, generation history, video generation, or web dashboard.
