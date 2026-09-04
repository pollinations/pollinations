# Pollinations for GIMP

Generate and edit images inside GIMP 3 with Pollinations.ai — your Pollen, your account.

## Installation

**Linux:**

```bash
# 1. Install GIMP 3 (https://www.gimp.org/downloads/)
# 2. Copy the plug-in:
mkdir -p ~/.config/GIMP/3.0/plug-ins/pollinations_gimp
cp pollinations_gimp.py pollinations_api.py ~/.config/GIMP/3.0/plug-ins/pollinations_gimp/
chmod +x ~/.config/GIMP/3.0/plug-ins/pollinations_gimp/pollinations_gimp.py
# 3. Restart GIMP — find it at Filters → Pollinations → Pollinations AI…
```

**macOS:**

```bash
mkdir -p ~/Library/Application\ Support/GIMP/3.0/plug-ins/pollinations_gimp
cp pollinations_gimp.py pollinations_api.py ~/Library/Application\ Support/GIMP/3.0/plug-ins/pollinations_gimp/
chmod +x ~/Library/Application\ Support/GIMP/3.0/plug-ins/pollinations_gimp/pollinations_gimp.py
```

**Windows:**

```
Copy pollinations_gimp.py and pollinations_api.py to:
%APPDATA%\GIMP\3.0\plug-ins\pollinations_gimp\
```

Then restart GIMP.

## Usage

1. **Filters → Pollinations → Pollinations AI…**
2. **Connect** — click *Connect Pollinations*, your browser opens to `https://enter.pollinations.ai/device`, enter the code shown in GIMP. An App Key (`pk_…`) identifies the GIMP integration; your private key (`sk_…`) is stored locally at `~/.config/GIMP/3.0/pollinations.json` (0600) and never leaves your machine except to call Pollinations.
3. **Pick a model** — the model list is loaded live from `https://gen.pollinations.ai/image/models` (includes community models). Choose any image model available to your account.
4. **Prompt** — type your prompt, set width/height, choose *As new image* or *As new layer*.
5. **Edit** — for models that advertise `image` input, check *Use active layer as input* to send the current layer for editing. The result appears as a new layer; your source layer is untouched. Capabilities (like `image` input) drive which controls are shown — unsupported options are hidden.

## Error handling

- **Expired authorization (401)** → “Authorization expired. Please reconnect.” — use Disconnect then Connect again.
- **Insufficient Pollen (402)** → “Insufficient Pollen. Top up at https://enter.pollinations.ai/buy”
- **Network/API errors** → clear message with the HTTP status and a hint to retry.

Your private key works across GIMP restarts and is never pasted into GIMP. Use **Disconnect** to remove it.

## Development

The API client (`pollinations_api.py`) is pure Python + stdlib and can be tested without GIMP:

```bash
python -m pytest apps/gimp-pollinations/test_pollinations_api.py -v
# or
python apps/gimp-pollinations/test_pollinations_api.py
```

For a live end-to-end demo (requires Pollinations account, no GIMP needed):

```bash
python apps/gimp-pollinations/demo.py --prompt "a watercolor cat" --model turbo
# Writes demo_output.png
```

## Reusable code

`pollinations_api.py` is intentionally GIMP-free. Import it in any Python project:

```python
from pollinations_api import request_device_code, poll_for_token, list_image_models, generate_image
```

## License

MIT — see the Pollinations repository.
