# Setup the development environment


##### SOPS
We use [sops](https://github.com/getsops/sops) with [age](https://github.com/FiloSottile/age) encryption for secrets management.

###### Installation
Install sops via your package manager:
```bash
# macOS
brew install sops

# Linux (see https://github.com/getsops/sops/releases)
```

Set up your SOPS age key:
```bash
mkdir -p $HOME/.config/sops/age/
mv /path/to/keys.txt $HOME/.config/sops/age/
```

By default, sops will look for your key file in `$HOME/.config/sops/age/keys.txt`. If you want to use a different location, set `SOPS_AGE_KEY_FILE` to your preferred path.

To decrypt `.env` files for services, run:
```bash
sops --output-type dotenv decrypt secrets/env.json > .env
``` 

The variables are kept encrypted in `**/secrets/*.json`. If you need to edit them, run `sops edit /secrets/file.json`. This will open an editor and when you save the file, write it to the encrypted file. (hint: set the editor env variable: `export EDITOR=/path/to/your/editor` to open with your favorite editor)

###### macOS Keychain Storage (Recommended)

For better security on macOS, store your age key in the system Keychain instead of a plain text file:

```bash
# Store the age key in Keychain (one-time setup)
# You'll be prompted to paste your key
security add-generic-password -a "$USER" -s "sops-age-key" -w
```

Then add this to your `~/.zshrc` to automatically load the key:

```bash
# Load SOPS age key from macOS Keychain
export SOPS_AGE_KEY=$(security find-generic-password -a "$USER" -s "sops-age-key" -w 2>/dev/null)
```

Now `sops` commands work normally without needing a keys.txt file.

###### Common SOPS commands:
| Command | Description |
| :--- | :--- |
| `sops -d secrets/dev.vars.json` | View decrypted content |
| `sops edit secrets/dev.vars.json` | Edit encrypted file directly (set `EDITOR` env var) |
| `sops -e .dev.vars > secrets/dev.vars.json` | Encrypt .env → .encrypted.env |


##### Running Multiple Services

To run multiple services simultaneously during development:

```bash
# Install dependencies for all services
npm run install:all

# Run all services (enter, text, image) with auto-restart
npm run dev

# Run individual services
npm run dev:enter
npm run dev:text
npm run dev:image
```

The `npm run dev` command uses `concurrently` to run all services with colored output and automatic restart on failure.

##### Debugging
For verbose logging and debugging across all services, you can use:

```bash
DEBUG=* npm start
```

This will enable comprehensive debug output to help troubleshoot issues during development.
