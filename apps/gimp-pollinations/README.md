# Pollinations for GIMP 3

Generate images and edit the active layer in GIMP 3 using the Pollen in the
artist's own Pollinations account. The plug-in uses Pollinations' browser-based
BYOP device authorization. It never asks for, stores in preferences, or sends
a user API key through a URL.

## Install

GIMP 3 and its Python plug-in support are required. Download or clone this
directory, then create a `pollinations-gimp` directory in GIMP's plug-ins
folder and put both `pollinations-gimp.py` and `pollinations_gimp.py` in it.
The directory and script names intentionally match GIMP's plug-in discovery
convention.

- Linux: use **Edit → Preferences → Folders → Plug-ins** to find the active
  folder, copy the directory there, then run `chmod u+x pollinations-gimp.py`.
  The desktop's `secret-tool` command (normally provided by libsecret) stores
  the authorization in the login keyring.
- macOS: use the Plug-ins folder shown in **Preferences → Folders → Plug-ins**,
  then restart GIMP. The authorization is stored in Keychain.
- Windows: use the Plug-ins folder shown in **Preferences → Folders → Plug-ins**,
  then restart GIMP. The authorization is encrypted with Windows DPAPI for the
  signed-in user.

In GIMP, choose **Filters → Artistic → Pollinations Image…**. Enter the
plug-in publisher's public `pk_` App Key and choose **Connect**. GIMP opens the
Pollinations approval page and displays the same short code. Approval returns
a private user authorization that is stored in the operating system credential
store and survives GIMP restarts. **Disconnect** removes it locally.

An App Key is public integration attribution, not a user credential. A released
build can set `POLLINATIONS_GIMP_APP_KEY` before GIMP starts so users do not
need to enter it. The plug-in intentionally does not include a placeholder key:
publishers create their own App Key at <https://enter.pollinations.ai/keys>.

## Use

After connecting, the model picker calls authenticated
`https://gen.pollinations.ai/image/models`. This returns every image-output
model visible to the connected account, including that account's community
models. The picker hides video-only records. Image editing is enabled only when
the selected model advertises `image` in `input_modalities`; resolution choices
are shown only when the selected model advertises `resolutions`.

Enter a prompt and choose **Generate** to add a new result layer. To edit,
select a paintable layer and tick **Edit the active layer**. Optionally tick
**Use the current selection** to send its bounds. The source is exported from a
new temporary image and the returned image is inserted as a new layer. The
source layer is not modified.

The plug-in gives actionable messages for expired/revoked authorization
(connect again), HTTP 402 (add Pollen), connection failures, malformed API
responses, and invalid model/authorization responses.

## Reproducible verification

The protocol code has no GIMP runtime dependency. Run focused tests with:

```sh
python3 -m unittest discover -s apps/gimp-pollinations/tests -v
```

For a manual GIMP 3 demonstration: install the files, connect through the
opened approval page, verify that community models appear for an account that
owns one, generate a new layer, then select an image-input model and edit an
active layer. Disconnect, restart GIMP, and reopen the dialog to verify that
the operating-system credential store restored the connection.

## License

Apache-2.0. See the repository's [LICENSE](../../LICENSE).
