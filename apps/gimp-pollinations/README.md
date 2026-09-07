# Pollinations AI — GIMP 3 Plug-in (BYOP)

Generate and edit images inside GIMP 3 using the Pollinations AI API.
Each user authenticates through their own Pollinations account via
the BYOP device flow (RFC 8628).

## Features

- **BYOP device flow** — Open browser, authorize, token stored securely
- **Dynamic model picker** — Loads all image models at runtime
- **Generate Image** — Text-to-image, result as new image or layer
- **Edit with AI** — Active layer editing via image-input models
- **Capability-driven UI** — Only shows supported options
- **Clear error messages** — Auth, Pollen, network, API errors
- **Pure stdlib** — No pip packages required

## Installation

### Linux

```bash
# Create plugin directory
mkdir -p ~/.config/GIMP/3.0/plug-ins/gimp-pollinations

# Copy files
cp pollinations_gimp.py test_pollinations_api.py README.md \
   ~/.config/GIMP/3.0/plug-ins/gimp-pollinations/

# Make executable
chmod +x ~/.config/GIMP/3.0/plug-ins/gimp-pollinations/pollinations_gimp.py
```

### macOS

```bash
mkdir -p ~/Library/Application\ Support/GIMP/3.0/plug-ins/gimp-pollinations
cp pollinations_gimp.py test_pollinations_api.py README.md \
   ~/Library/Application\ Support/GIMP/3.0/plug-ins/gimp-pollinations/
chmod +x ~/Library/Application\ Support/GIMP/3.0/plug-ins/gimp-pollinations/pollinations_gimp.py
```

### Windows

```
mkdir %APPDATA%\GIMP\3.0\plug-ins\gimp-pollinations
copy pollinations_gimp.py %APPDATA%\GIMP\3.0\plug-ins\gimp-pollinations\
copy test_pollinations_api.py %APPDATA%\GIMP\3.0\plug-ins\gimp-pollinations\
copy README.md %APPDATA%\GIMP\3.0\plug-ins\gimp-pollinations\
```

## Usage

1. **Connect** — Filters > Pollinations AI > Connect Account
2. Opens browser for device authorization
3. **Generate** — Filters > Pollinations AI > Generate Image
4. **Edit** — Filters > Pollinations AI > Edit with AI
5. **Disconnect** — Filters > Pollinations AI > Disconnect Account

## Tests

```bash
cd ~/.config/GIMP/3.0/plug-ins/gimp-pollinations
python3 -m unittest test_pollinations_api -v
```

## Architecture

- `pollinations_gimp.py` — GIMP 3 plugin (350 lines, pure stdlib)
- `test_pollinations_api.py` — 25 unit tests with mock HTTP server
- Token storage: atomic write to platform config dir (mode 0600)

## License

MIT
