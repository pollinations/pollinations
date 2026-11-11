# Pollinations for Krita

Generate an image onto a new layer, or edit the active layer's selection (or
the whole layer) into a new layer, using your Pollinations account. The
source layer is never modified.

## Install

Requires Krita 5 or later with Python scripting enabled (bundled by default).
The plug-in uses only Python's standard library and Krita's bundled PyQt5; do
not install pip packages into Krita's Python.

**Import from a zip** (Tools > Scripts > Import Python Plugin…): build one
with `python package.py`, which writes `pollinations-krita.zip` next to this
README. Import it, restart Krita, then enable **Pollinations** in
**Settings > Configure Krita > Python Plugin Manager** and restart again.

**Manual install**: run

```sh
python install.py "/path/to/pykrita"
```

with the `pykrita` folder shown by **Settings > Manage Resources > Open
Resource Folder** (append `pykrita` to that path). Typical locations:

- Windows: `%APPDATA%\krita\pykrita`
- macOS: `~/Library/Application Support/krita/pykrita`
- Linux: `~/.local/share/krita/pykrita`

Then enable it in the Python Plugin Manager as above.

## Account connection

No App Key is required. Publishers can optionally set
`POLLINATIONS_KRITA_APP_KEY` to a publishable `pk_` key for attribution
before starting Krita.

1. Choose **Tools > Scripts > Pollinations: Connect Account…**. Your browser
   opens the device approval page; the progress dialog also shows the URL and
   user code.
2. Review the account, budget and expiry in the browser and approve. No user
   API key is pasted into Krita.
3. Use **Pollinations: Generate Image…** or **Pollinations: Edit Layer or
   Selection…**. The model picker loads the account's `/image/models`
   catalog, including community image models. Editing only offers models
   advertising image input.
4. **Pollinations: Disconnect Account** removes the saved authorization on
   this computer. To revoke it server-side too, use the account's Keys page.

Authorization survives restarts. Windows stores a DPAPI-encrypted blob bound
to the Windows user; POSIX uses an atomic owner-only file, under
`%LOCALAPPDATA%\PollinationsKrita`, `~/Library/Application Support/PollinationsKrita`,
or `$XDG_CONFIG_HOME/pollinations-krita` (default `~/.config`).

Generation targets the current selection if there is one, otherwise the whole
canvas, and the result is scaled to fit those bounds exactly. Editing sends
that same region from the active layer (must be a paint layer) and requires
an 8-bit RGBA document (**Image > Convert Image Color Space**). Expired
authorization prompts reconnection; insufficient Pollen and network errors
each show a message that says what to do. Generation has no fixed client
timeout since a durable request may legitimately take minutes; catalog and
account requests keep a 30-second timeout.

## Verification

```sh
python -m unittest -v test_pollinations
```

These 11 tests use real localhost HTTP requests, no external credentials or
Pollen: catalog filtering, generation/edit JSON, device polling/backoff,
denial/cancellation/expiry, error redaction, and persistent token storage.

```sh
pip install PyQt5
QT_QPA_PLATFORM=offscreen python -m unittest -v test_image_codec
```

These 5 tests exercise the raw-pixel/PNG conversion that bridges Krita's
`Node.pixelData()` (packed BGRA bytes) and the API's PNG payloads, including
the BGRA byte order and scale-to-target-size behavior, without needing Krita
itself.

**Not exercised by automated tests**, and not run as part of this change: the
Krita `Extension`/`Node`/`Document` calls in `pollinations_krita/extension.py`
(menu registration, dialogs, selection/layer bounds, live device
authorization, and a billed generation) — this environment has no Krita
installation or display to run it against. For a live acceptance check,
install the plug-in in a real Krita, connect, restart Krita, generate onto an
empty canvas, then select a region on an image and edit it; confirm the
result aligns with the region and the source is unchanged.

Contracts: [BYOP device flow](../../BRING_YOUR_OWN_POLLEN.md),
[image API](https://gen.pollinations.ai/docs#tag/image),
[Krita Python plugin how-to](https://docs.krita.org/en/user_manual/python_scripting/krita_python_plugin_howto.html).
