# Pollinations for GIMP 3

Generate an image or edit the active layer using your Pollinations account.
Results open as a new image or a new layer. Editing uses the selection's
bounding rectangle when selected, otherwise the whole active layer; it does
not replace the source or apply a mask.

## Install

Requires GIMP 3 with Python plug-in support. The plug-in uses only Python's
standard library and GIMP's bundled GI/GTK libraries; do not install pip
packages into GIMP. Windows GIMP 3.2.4 was exercised with the native smoke test.
Linux and macOS installation paths are documented below but not tested here.

In **Edit > Preferences > Folders > Plug-ins**, find your user plug-ins folder.
Run with Python 3 (substitute that exact folder, since GIMP minor versions
can have separate configuration directories):

```sh
python install.py "/your/GIMP/user/plug-ins"
```

Typical parent locations are `%APPDATA%\GIMP\<version>` on Windows,
`~/.config/GIMP/<version>` on Linux and
`~/Library/Application Support/GIMP/<version>` on macOS. For Flatpak, use the
folder shown inside GIMP's preferences. Manual installation: put
`pollinations-gimp.py`, `pollinations_api.py` and `token_store.py` inside a
`pollinations-gimp` folder in that plug-ins directory; make the entry script
executable on Unix. Restart GIMP.

## Publisher configuration and account connection

The publisher registers an **App Key** at
[Pollinations Keys](https://enter.pollinations.ai/keys) and sets
`POLLINATIONS_GIMP_APP_KEY` to that `pk_` key in the environment used to launch
GIMP. No invented or contributor-owned default key is bundled. This public
integration identifier is sent as `client_id` for attribution.

1. Choose **Filters > Pollinations > Connect Account**. The browser opens the
   device approval page. The dialog also shows the URL and user code.
2. Review the account, budget and expiry in the browser and approve. No user
   API key is pasted into GIMP. Pending and slow-down responses are respected;
   cancellation and expired or declined codes stop the flow.
3. Use **Generate Image** or **Edit Active Layer**. The model picker reloads
   the account's `/image/models` catalog, including community image models.
   Editing only offers models advertising image input. Resolution controls
   appear only when the model advertises resolutions; other options use the
   provider defaults. Generation may take several minutes.
4. **Disconnect Account** removes the saved authorization on this computer.
   To revoke it server-side as well, use the account's Keys page.

Authorization survives restarts. Windows stores a DPAPI-encrypted blob bound
to the Windows user; POSIX uses an atomic owner-only file. Storage is under
`%LOCALAPPDATA%/PollinationsGimp`,
`~/Library/Application Support/PollinationsGimp`, or
`$XDG_CONFIG_HOME/pollinations-gimp` (default `~/.config`). The authorization is
only sent as a bearer header to Pollinations. API response bodies are not
displayed in error dialogs.

Expired authorization prompts reconnection; denied model access prompts a
permission check; insufficient Pollen prompts a balance/budget check. After a
generation timeout, check account activity before retrying, as the request may
have completed remotely. Network work stays off the GTK thread.

## Verification

```sh
python -m unittest -v test_pollinations
```

These tests use real localhost HTTP requests, no external credentials or
Pollen: catalog filtering, generation/edit JSON, device polling/backoff,
denial/cancellation/expiry, error redaction, and persistent token storage.

Run the native GIMP smoke script with the Python batch interpreter (set
`__file__` to the absolute path):

```sh
gimp-console-3 --new-instance --no-data --no-fonts --console-messages \
  --batch-interpreter=python-fu-eval \
  --batch="exec(compile(open('/absolute/path/smoke_gimp.py').read(), 'smoke_gimp.py', 'exec'), {'__file__': '/absolute/path/smoke_gimp.py'})" --quit
```

It verifies native PNG export, selection coordinates, new-layer insertion,
result offsets, unchanged source pixels, and whole-layer export. On Unix use
the installed `gimp` executable if there is no separate console executable.

For a live acceptance check, configure a registered App Key, connect, restart
GIMP, generate, then select a region on an offset layer and edit it. Confirm
that the returned layer aligns with the region and the source remains intact.
Finally disconnect and confirm generation asks to reconnect. Live account
authorization and billed generation were not run as part of the automated
tests.

Contracts: [BYOP device flow](../../BRING_YOUR_OWN_POLLEN.md),
[image API](https://gen.pollinations.ai/docs#tag/image),
[GIMP Python tutorial](https://developer.gimp.org/resource/writing-a-plug-in/tutorial-python/).
