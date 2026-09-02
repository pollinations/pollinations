# Pollinations AI plug-in for GIMP 3

Generate and edit images inside GIMP with **your own Pollinations account** —
BYOP (Bring Your Own Pollen). No API keys to paste, no hardcoded model list,
nothing billed to the plug-in author.

## Install

Requires **GIMP 3.0 or newer** (it ships its own Python; no extra packages).

Copy `pollinations_gimp.py` into your GIMP plug-ins folder and make it
executable (Linux/macOS):

| Platform | Path |
| --- | --- |
| Linux | `~/.config/GIMP/3.0/plug-ins/pollinations-gimp/pollinations_gimp.py` |
| macOS | `~/Library/Application Support/GIMP/3.0/plug-ins/pollinations-gimp/pollinations_gimp.py` |
| Windows | `%APPDATA%\GIMP\3.0\plug-ins\pollinations-gimp\pollinations_gimp.py` |

Restart GIMP. The commands appear under **Filters ▸ Pollinations**.

## Use

1. **Connect Account…** — GIMP shows a short code and can open
   `enter.pollinations.ai/device` for you. Sign in, type the code, approve.
   The authorization is stored privately (`~/.config/GIMP/3.0/pollinations/auth.json`,
   mode `600`) and survives restarts. **Disconnect** removes it.
2. **Generate Image…** — pick a model and write a prompt. The model list is
   loaded live from `/image/models` for *your* account (including community
   models) with per-image prices, so nothing is hardcoded. The result is added
   as a new layer on the current image, or as a new image.
3. **Edit with AI…** — sends the **selection** (if any) or the **active layer**
   to a model that advertises image input, and adds the result as a new layer.
   The source layer is never modified. Models without image input are not
   offered here — controls follow what the live catalog reports.

Every request spends your own Pollen at the model's normal rate.

## Attribution (for distributors)

The default `APP_KEY` (`pk_gimp_pollinations`) is a placeholder. If you
repackage the plug-in, create your own publishable App Key at
[enter.pollinations.ai/keys](https://enter.pollinations.ai/keys) and either
edit the constant or export `POLLINATIONS_APP_KEY` before launching GIMP.

## Tests

Pure logic (auth store, error classification, device flow, catalog filtering,
request shapes) is unit-tested without GIMP or network access:

```bash
python3 -m unittest discover -s apps/gimp-pollinations/tests -v
```

## Verified on real GIMP 3.0.4

This plug-in was executed against an actual GIMP 3.0.4 installation
(headless, under `xvfb-run`) — not only unit-tested. Observed results:

| Check | Result |
| --- | --- |
| Plug-in registration | All four procedures appear under **Filters ▸ Pollinations** |
| Live catalog | `/image/models` returned **52 image models**, 36 of them advertising image input |
| Device flow | `enter.pollinations.ai` issued a real user code and verification URL |
| Active-layer export | Exported to a valid PNG |
| Selection export | Cropped to the exact selection bounds, exported to a valid PNG |
| Result insertion | Fetched PNG inserted as a new layer, and opened as a new image |
| Source safety | Source layer and image unchanged after both operations |

### Reproduce the end-to-end run

1. Install the plug-in (above) and restart GIMP 3.
2. **Filters ▸ Pollinations ▸ Connect Account…** — approve the code at
   `enter.pollinations.ai/device`; the dialog confirms your username.
3. Quit and reopen GIMP, then open **Generate Image…** — the model list loads
   and you are still connected (authorization persisted across restarts).
4. **Generate Image…** with `zimage` at 512×512 — the result arrives as a new
   layer; run it again with *new image* selected to exercise both paths.
5. Select a region of a layer and run **Edit with AI…** with an image-input
   model (e.g. `flux-2-flex`) — the result is added as a new layer and the
   source layer is untouched. Text-only models are absent from this dialog.
6. **Disconnect**, then open **Generate Image…** — the failure reports
   "authorization is missing or expired" with a reconnect hint.

## Troubleshooting

| Message | What to do |
| --- | --- |
| "authorization is missing or expired" | Run **Connect Account…** again — user keys last 7 days by default. |
| "Not enough Pollen" | The error shows the request cost; top up at enter.pollinations.ai. |
| "Network error" | Check connectivity; GIMP keeps your stored authorization. |
| "No model on your account supports image editing" | Image-input models require a Paid Pollen balance. |
