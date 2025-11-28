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

If you want to skip using `nix`, you can also install sops via another package manager, e.g. `brew install sops`. To run the image and text services, you will then need to decrypt the `.env` files manually by running `sops --output-type dotenv decrypt secrets/env.json > .env` in the folder of each service.

##### SOPS
We use [sops](https://github.com/getsops/sops) with [age](https://github.com/FiloSottile/age) encryption for secrets management. When entering the development shell, the shell hook will try to decrypt the env variables stored in `**/secrets/*env.json` files. By default, sops will look for your key file in `$HOME/.config/sops/age/keys.txt`, if you want to use a different location, set `SOPS_AGE_KEY_FILE` to your preferred path before entering the nix shell. 

The variables are kept encrypted in `**/secrets/*.json`. If you need to edit them, run `sops edit /secrets/file.json`. This will open an editor and when you save the file, write it to the encrypted file. (hint: set the editor env variable: `export EDITOR=/path/to/your/editor` to open with your favorite editor)


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
