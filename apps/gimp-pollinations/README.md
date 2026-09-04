# Pollinations AI for GIMP 3

A native GIMP 3 Python plug-in for Pollinations image generation and non-destructive editing. It uses Pollinations BYOP device authorization: users approve the integration in their browser and never paste a Pollinations secret key into GIMP.

## What it does

- **BYOP onboarding** — visual first-run flow, browser approval, private persistent delegated auth, account disconnect, and no pasted API key.
- **Live model browser** — fetches Pollinations image models at runtime, including Community models, with searchable Quest/Paid, Official/Community, health and capability filters. No image model IDs are hard-coded into the UI.
- **Capability-driven controls** — resolutions, seed and quality appear only when the chosen live model supports them. Auto selection uses live catalog data, health and user preferences.
- **Generate** — creates a new GIMP image or inserts a generated image as a new layer.
- **Edit with AI** — edits the active layer or exact selection and always returns a new layer; source pixels remain untouched.
- **Add / Replace / Remove Object** — contextual layer operations. Add creates a standalone asset and removes its temporary background before insertion; Replace/Remove edit the full active layer to preserve composition.
- **Magic Separate — Object + Background** — extracts the original foreground pixels into a transparent layer, punches the same alpha region from a copy, reconstructs only the missing background, and returns separate GIMP layers. No prompt or Advisor is used for the RMBG step.
- **Isolate Object (RMBG)** — creates a transparent object layer with ClearBackdrop without modifying the source.
- **Vision Advisor** — optional on creative Generate/Edit/Add/Replace/Remove flows only. Its proposal is advisory: keep the original, accept only the improved prompt, accept only the suggested model, or accept both.
- **Account & Usage** — shows the connected Pollinations identity when available, key information, Pollen balance/usage and the plug-in's local activity log.
- **Recovery-first UX** — network, moderation/API, billing and provider errors do not discard a long prompt or the user's model/options; the form reopens with its state preserved.
- **Six UI languages** — English, French, Spanish, German, Italian and Chinese.

## GIMP menus

The plug-in exposes a top-level **Pollinations AI** menu and also places actions in native GIMP locations where useful:

- **Pollinations AI** — Generate, Generate as New Layer, Edit, Add/Replace/Remove Object, Magic Separate, Isolate Object, Settings, Account & Usage, About.
- **File → Create** — Generate Image.
- **Layer / Select → Pollinations AI** — layer and selection workflows.
- **Edit** — Pollinations AI Settings.

`Connect` and `Disconnect` remain internal procedures used by onboarding/account flows rather than appearing as contradictory root-menu items. On a true first run, functional actions route through Welcome → BYOP connection → Settings. **About** is informational and can be opened before onboarding.

## Install

Requires GIMP 3 with Python plug-in support. Copy the complete contents of this directory into a plug-in directory named `pollinations_gimp`:

```text
<GIMP user config>/plug-ins/pollinations_gimp/
  pollinations_gimp.py
  pollinations_api.py
  pollinations_core.py
  pollinations_i18n.py
  assets/
    pollinations-gimp-welcome.jpg
```

Make `pollinations_gimp.py` executable on Linux/macOS, then restart GIMP.

Do not assume the profile directory is named `3.0`. Use the plug-in path reported by the installed GIMP under **Preferences → Folders → Plug-ins**. Typical roots are:

- Linux: `~/.config/GIMP/<major.minor>/plug-ins/`
- Flatpak Linux: the writable plug-in directory shown by GIMP Preferences
- macOS: the GIMP user configuration directory shown in Preferences, then `plug-ins/`
- Windows: the GIMP user configuration directory shown in Preferences, then `plug-ins\`

The plug-in uses Python's standard library plus GIMP's bundled `gi` bindings; no pip package is required.

## BYOP authorization

The integration contains its Pollinations **publishable App Key** only. A publishable App Key identifies the application; it is not the user's delegated authorization.

1. Start any functional Pollinations action on first run.
2. Approve the device authorization in the browser.
3. The delegated user token is stored locally with private file permissions and survives GIMP restarts.
4. Pollinations requests use the connected user's own account/Pollen entitlements.
5. Disconnect from **Account & Usage** to remove the local delegated authorization.

## Model selection, cost and fallback

The model browser is rebuilt from the live Pollinations catalog. It can filter Official vs Community and Quest vs Paid models, shows live health, and displays request-aware cost estimates where pricing data allows it.

Auto mode combines task fit, live model health, capabilities and user preferences. Recoverable provider/time-out failures can use a compatible fallback. An explicitly selected model is not silently replaced unless the user has opted into automatic manual-model fallback.

## RMBG scope

For this quest submission, RMBG is intentionally simple: **ClearBackdrop or Off**. ClearBackdrop is a no-key external background-removal service. It is used only by explicit object-isolation workflows and the object-extraction step of Magic Separate.

Advanced promptable alpha routing, additional RMBG providers, masks, batch queues, video and multi-layer orchestration are intentionally outside this PR.

## Tests

Run the pure-Python suite from the repository root:

```bash
python3 -m unittest discover -s apps/gimp-pollinations/tests -v
python3 -m py_compile apps/gimp-pollinations/*.py apps/gimp-pollinations/tests/*.py
git diff --check
```

The implementation has also been smoke-tested with real GIMP 3.2.4 (Flatpak), including plug-in registration, selection export, layer import/scaling/offsets, alpha-hole creation for Magic Separate, onboarding, live BYOP, generation and editing workflows.

## Files

- `pollinations_api.py` — stdlib BYOP/API client, live model catalogs/status, generation/edit/Advisor calls, account usage and ClearBackdrop adapter.
- `pollinations_core.py` — settings, live model scoring/fallback policy and dimension presets.
- `pollinations_gimp.py` — GIMP/GTK procedures, model browser, onboarding, progress/error recovery and non-destructive layer workflows.
- `pollinations_i18n.py` — six-language UI strings.
- `assets/pollinations-gimp-welcome.jpg` — onboarding/About artwork.
- `tests/` — focused pure-Python contract/ranking tests.
