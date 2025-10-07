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
| `sops -d .encrypted.env` | View decrypted content |
| `sops edit .encrypted.env` | Edit encrypted file directly (set `EDITOR` env var) |
| `sops -e .env > .encrypted.env` | Encrypt .env → .encrypted.env |

**Workflow:** 
- **With nix:** Variables auto-load via `nix develop` - edit with `sops edit .encrypted.env`
- **Without nix:** Edit `.env` → Run `sops -e .env > .encrypted.env` → Commit `.encrypted.env`

##### Debugging
For verbose logging and debugging across all services, you can use:

```bash
DEBUG=* npm start
```

This will enable comprehensive debug output to help troubleshoot issues during development.
