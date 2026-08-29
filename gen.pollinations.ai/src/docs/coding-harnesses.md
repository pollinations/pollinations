# Coding harnesses

Use the Polli CLI to configure supported coding harnesses with Pollinations:

```bash
npm install -g @pollinations/cli
polli harness --help
polli harness opencode on
polli harness opencode status
polli harness opencode off
```

## OpenCode

`on` first checks for the `opencode` executable. When it is missing, Polli runs OpenCode's official npm installation command:

```bash
npm install --global opencode-ai@latest
```

After installation, the adapter adds the community-maintained [`opencode-pollinations-plugin`](https://github.com/fkom13/opencode-pollinations-plugin) package to the global `opencode.json` plugin list. It preserves existing configuration and does not store an API key. If installation fails, Polli leaves the OpenCode configuration unchanged.

Restart OpenCode after setup, then run `/poll login` to connect your Pollinations account. `OPENCODE_CONFIG_DIR` is respected when OpenCode uses a custom configuration directory.

Each harness has `on`, `off`, and `status` commands and defaults to `on` when the command is omitted. `off` disables the Pollinations integration; it does not uninstall the harness. Each integration is an isolated Polli CLI adapter, so additional harnesses do not change the shared command.
