# Pollinations AI for GIMP 3

A GIMP 3 plug-in that brings [Pollinations](https://pollinations.ai) image
generation and editing into GIMP with **BYOP (Bring Your Own Pollen)** — every
user connects their own Pollinations account, so each request is paid from
their own balance. **No API key is ever typed into GIMP.**

```
Filters ▸ Pollinations AI ▸ Connect Account…      authorize with your account
Filters ▸ Pollinations AI ▸ Disconnect Account     remove the stored key
Filters ▸ Pollinations AI ▸ Generate Image…        prompt → new layer / new image
Filters ▸ Pollinations AI ▸ Edit with AI…          active layer → edited new layer
```

## Features

- **BYOP device authorization (RFC 8628)** — the plug-in opens the approval
  page in your browser with the code pre-filled, polls in the background, and
  stores the resulting user key privately (mode `0600`) in your user config
  directory. The authorization survives GIMP restarts until you disconnect it
  in the plug-in or revoke it from your dashboard.
- **App Key attribution** — the integration identifies itself with a
  publishable App Key (`client_id`), while the user authorization stays private.
- **Live model catalog** — the model picker loads `/image/models` at runtime
  from the connected account, including community models (flagged in the
  label). No model IDs are hardcoded.
- **Generate Image** — text-to-image; the result is added as a new layer
  (centered, undo-grouped) or opened as a new image.
- **Edit with AI** — a *copy* of the active layer, cropped to the selection if
  one exists, is uploaded as PNG; the edited result comes back as a **new
  layer**. The source layer is never altered.
- **Capability-driven controls** — the edit dialog only lists models that
  advertise image input; the resolution control only appears when the model
  advertises `resolutions`; unsupported options are never sent.
- **Clear recovery messages** — expired/revoked authorization (401/403),
  insufficient Pollen (402), network failures and API errors each produce a
  dialog that tells you exactly what to do next.
- **Scriptable** — `Generate Image` and `Edit with AI` are also PDB procedures
  with `prompt` / `model` / `size` / `target` arguments for batch use.

Deliberately out of scope (per the quest): masks, batch queues, history,
video generation, web dashboards.

## Installation

The plug-in is two Python files that use **only the standard library** — no
pip packages needed, because GIMP 3 bundles its own Python interpreter.

1. Copy the two files `pollinations_gimp.py` and `pollinations_api.py` into a
   folder named `pollinations_gimp` inside your GIMP 3 `plug-ins` directory:

   | Platform | Plug-ins directory |
   | --- | --- |
   | **Linux** | `~/.config/GIMP/3.0/plug-ins/pollinations_gimp/` |
   | **macOS** | `~/Library/Application Support/GIMP/3.0/plug-ins/pollinations_gimp/` |
   | **Windows** | `%APPDATA%\GIMP\3.0\plug-ins\pollinations_gimp\` |

   From a terminal (adjust the source path):

   ```sh
   # Linux / macOS
   mkdir -p ~/.config/GIMP/3.0/plug-ins/pollinations_gimp        # macOS: ~/Library/Application Support/...
   cp pollinations_gimp.py pollinations_api.py ~/.config/GIMP/3.0/plug-ins/pollinations_gimp/
   chmod u+x ~/.config/GIMP/3.0/plug-ins/pollinations_gimp/pollinations_gimp.py

   # Windows (PowerShell)
   mkdir "$env:APPDATA\GIMP\3.0\plug-ins\pollinations_gimp"
   cp pollinations_gimp.py, pollinations_api.py "$env:APPDATA\GIMP\3.0\plug-ins\pollinations_gimp\"
   ```

2. Restart GIMP.
3. Verify the menu **Filters ▸ Pollinations AI** appears in an image window.

> GIMP 2.10 is *not* supported — this plug-in uses the GIMP 3 GObject
> Introspection API.

## Usage

### Connect your account (once)

1. **Filters ▸ Pollinations AI ▸ Connect Account…**
2. Click **Open Browser with Code** — the approval page opens with the code
   pre-filled (`enter.pollinations.ai/device?user_code=…`).
3. Approve the request while signed in to your Pollinations account.
4. The dialog confirms the connected account; the key is stored privately and
   survives GIMP restarts.

To stop using the plug-in: **Disconnect Account** (deletes the stored key), or
revoke the key any time from your [keys dashboard](https://enter.pollinations.ai/keys).

### Generate an image

**Filters ▸ Pollinations AI ▸ Generate Image…** — pick a model, type a
prompt, choose whether the result is added as a **new layer** in the current
image or opened as a **new image**, then *Generate*. The model list and the
size/resolution controls adapt to what the selected model supports.

### Edit the active layer

1. Select a layer (and optionally a region — only the selection is sent).
2. **Filters ▸ Pollinations AI ▸ Edit with AI…**
3. Pick an image-input model (e.g. FLUX Kontext–style models), describe the
   edit, then *Edit*.

A copy of the layer is uploaded, and the result is inserted as a new layer on
top. Your original layer is never modified.

## Where is my key stored?

| Platform | Path |
| --- | --- |
| Linux | `~/.config/pollinations-gimp/auth.json` |
| macOS | `~/Library/Application Support/pollinations-gimp/auth.json` |
| Windows | `%APPDATA%\pollinations-gimp\auth.json` |

The file is written atomically with `0600` permissions on Linux/macOS and is
never sent anywhere except as the `Authorization` header to
`gen.pollinations.ai` / `enter.pollinations.ai`.

## Troubleshooting

| Symptom | What it means / what to do |
| --- | --- |
| "Your Pollinations authorization is missing, expired or was revoked" | User-authorized keys default to 7 days. The stored key is cleared automatically — run **Connect Account…** again. |
| "This request costs more Pollen than your account budget allows" | Top up or raise the budget at [enter.pollinations.ai](https://enter.pollinations.ai), then retry. |
| "Could not reach Pollinations" | Check your internet connection/proxy, then retry. |
| "Device code expired" | The approval page was not completed in time — run **Connect Account…** again. |
| Model list empty | The connected account has no image models available right now; reconnect later. |

Environment variable `POLLINATIONS_APP_KEY` overrides the App Key used for
attribution (defaults to the built-in publishable key of this plug-in).

## Development

```
apps/gimp-pollinations/
├── pollinations_api.py      # API layer: device auth, token store, catalog,
│                            # generate/edit, error mapping — pure stdlib
├── pollinations_gimp.py     # GIMP 3 plug-in: 4 procedures + GTK dialogs
└── test_pollinations_api.py  # unit tests (local http.server, no GIMP needed)
```

Run the test suite with any Python 3.8+:

```sh
cd apps/gimp-pollinations
python -m unittest test_pollinations_api -v
```

The tests exercise the exact `urllib` code paths against an in-process HTTP
server: device flow (pending → slow_down → approved / denied / expired /
cancelled), error mapping (401/402/500/network), catalog parsing and
capability helpers, generation payload + base64 decoding, multipart edit
upload (field and image-byte assertions) and token persistence (atomic write,
privacy mode, restart survival).

### End-to-end verification checklist (with a real GIMP 3)

1. Install as above, restart GIMP, confirm the **Filters ▸ Pollinations AI** menu.
2. **Connect Account…** → browser opens with pre-filled code → approve →
   dialog shows the connected username.
3. Quit and restart GIMP → **Generate Image…** header still shows
   "Connected as …" (persistence across restarts).
4. Generate into a new image, and into the active image as a new layer
   (undo works as one step).
5. Make a selection → **Edit with AI…** shows the crop size in the source
   note → result arrives as a *new* layer; source pixels unchanged.
6. Revoke the key at enter.pollinations.ai/keys → generate → clear
   "authorization expired" dialog offering reconnect.
7. **Disconnect Account** → the auth file is gone.

## License

Same as the pollinations repository — open source, reusable.
