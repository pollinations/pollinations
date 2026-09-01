# Pollinations AI for GIMP 3

Standalone GIMP 3 Python plug-in for text-to-image generation and image
editing through `gen.pollinations.ai`. Results are imported as a new layer;
the source layer is never replaced.

## Install

1. Copy `pollinations_gimp.py` into a GIMP 3 plug-in directory, for example
   `~/.config/GIMP/3.0/plug-ins/pollinations/` on Linux or
   `%APPDATA%\\GIMP\\3.0\\plug-ins\\pollinations\\` on Windows.
2. On Unix, make the file executable (`chmod 755 pollinations_gimp.py`).
3. Restart GIMP and open `Filters > AI > Pollinations AI`.

The plug-in uses only Python's standard library. GIMP 3 supplies the `gi`
bindings at runtime. It needs network access to `enter.pollinations.ai` for
device login and `gen.pollinations.ai` for model discovery and generation.

## Login and configuration

The first run displays a device URL and code. Open that URL in any browser,
approve access, then return to GIMP and confirm. The plug-in polls
`/api/oauth/token` until approval or expiry. It stores the resulting key at
`~/.config/pollinations-gimp/token.json` (or the equivalent home directory on
the platform). Delete that file to disconnect and connect again.

Model choices come from the authenticated `/image/models` response. Editing
is available only when the model advertises image input and
`/v1/images/edits`; resolution choices appear only when `resolutions` is
advertised. No unsupported fields are sent.

## Privacy

The token is written atomically with Unix mode `0600` when supported. Requests
send the token only as an HTTPS bearer header. For edits, only the active
drawable and active selection (when present) are exported as PNG data; the
whole image is not flattened. The plug-in does not log tokens, prompts, image
data, or responses, and does not send telemetry.

## Reproducible smoke checklist

1. Run `python -m unittest discover -s apps/gimp-plugin/tests -v` from the
   repository root (no GIMP installation is required).
2. Run `python -m py_compile apps/gimp-plugin/pollinations_gimp.py`.
3. In GIMP 3, create a two-layer RGB image, select the top layer, and invoke
   the menu. Complete device login; verify image models populate.
4. Generate a prompt and verify one new `Pollinations · <model>` layer appears
   while both source layers remain unchanged.
5. Select an edit-capable model, make a rectangular selection, enable edit,
   and verify the generated result is inserted as another new layer.
6. Switch to a text-only image model and verify edit is hidden; switch to a
   model without `resolutions` and verify the resolution control is hidden.
7. Temporarily remove network access and verify the dialog reports a concise
   connection error without printing credentials.
