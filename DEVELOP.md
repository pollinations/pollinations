# Development guide — Run services locally

This file collects quick, reproducible steps to run the Pollinations services locally for development. It is a companion to individual service READMEs (each service contains its own detailed instructions).

If you're working on the Pollen/Auth Service API (issue #4290), see `auth.pollinations.ai/README.md` for the service-specific setup. The short flow below matches the requested steps from that issue.

Quick start (per-service)

- Install Nix: https://nixos.org/download.html
- Ensure secrets are available: copy `.dev.vars.example` → `.dev.vars` and edit values (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, JWT_SECRET, ADMIN_API_KEY, etc.)
- Enter developer shell:

```bash
nix develop
```

- Install dependencies (if needed):

```bash
npm install
```

- Run development migrations for the service you're working on. For `auth.pollinations.ai` there is a helper script and migration SQL files:

```bash
# Uses the helper script added to package.json
npm run migrate:development

# OR run wrangler/d1 directly (example):
npx wrangler d1 execute github_auth --local --file ./auth.pollinations.ai/migrations/schema.sql
```

- Start the dev server (example for `auth.pollinations.ai`):

```bash
npm run dev --workspace=auth.pollinations.ai
```

Per-service READMEs

- `auth.pollinations.ai/README.md` — Auth service local setup and migrations (issue #4290 target)
- `enter.pollinations.ai/README.md` — Enter site and pollen flow
- `image.pollinations.ai/README.md` — Image backend service
- `text.pollinations.ai/README.md` — Text backend service

Notes and troubleshooting

- Some services use Cloudflare Workers and D1 — ensure `wrangler` is installed inside your dev shell or via `npm`.
- If you run into missing environment variables, double-check `.dev.vars` and consider using `ENV_FILE=.dev.vars npm run deploy:local` where provided.
- If your workflow uses a different migration strategy, adapt the `migrate:development` script in the target service's `package.json`.

If you'd like, I can:

- Add direct top-level links in the main `README.md` to this `DEVELOP.md` and key services.
- Add `migrate:development` scripts to other services to standardize the workflow.
# Setup the development environment


##### Nix
Nix is a package manager that we use to define a portable development environment. The best way to install it is the [`Determinate Nix Installer`](https://github.com/DeterminateSystems/nix-installer). When the installation is done, you can enter the development shell by running `nix develop`.

This does the following:

- Install external tools and dependencies at the correct versions in an isolated environment, have a look at `flake.nix` the see what is installed.
- Decrypt and export the environment variables, if a required decryption keys are availabe.

There should be no need to install anything else manually.

###### Installation
To install Nix, run the following command:
```bash
curl -fsSL https://install.determinate.systems/nix | sh -s -- install --determinate
```

After installation:
1. Set up your SOPS age key (see SOPS section below)

```bash
# replace /path/to/keys.txt with the path to your keys.txt file
mkdir -p $HOME/.config/sops/age/
mv /path/to/keys.txt $HOME/.config/sops/age/
```

2. Create a new shell session
3. Run `nix develop` to enter the development environment

##### SOPS
We use [sops](https://github.com/getsops/sops) with [age](https://github.com/FiloSottile/age) encryption for secrets management. When entering the development shell, the shell hook will try to decrypt the env variables stored in `**/.encrypted.env` files. By default, sops will look for your key file in `$HOME/.config/sops/age/keys.txt`, if you want to use a different location, set `SOPS_AGE_KEY_FILE` to your preferred path before entering the nix shell. 

The variables are kept encrypted in `**/.encrypted.env` files, and only decrypted when loaded into memory. If you need to edit them, run `sops edit path/.encrypted.env`. This will open an editor and when you save the file, write it to the encrypted file. (hint: set the editor env var: `export EDITOR=/path/to/your/editor` to open with your favorite editor)


###### Common SOPS commands:
| Command | Description |
| :--- | :--- |
| `sops decrypt .encrypted.env  > .env` | dump decrypted content |
| `sops encrypt .env > .encrypted.env` | encrypt new file |
| `sops edit .encrypted.env` | exit file via temp file (hint: set `EDITOR=/editor/executable`) |

##### Debugging
For verbose logging and debugging across all services, you can use:

```bash
DEBUG=* npm start
```

This will enable comprehensive debug output to help troubleshoot issues during development.
