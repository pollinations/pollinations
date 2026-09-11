## OpenCode Harness

Use Pollinations as a provider inside [OpenCode](https://opencode.ai/) through the
Pollinations CLI (`polli`). The existing Pollinations OpenCode plugin is enabled
automatically, so media, usage, and quest capabilities work once the harness is on.

### Install the CLI

```bash
npm install -g @pollinations/cli
```

### Set up Pollinations in OpenCode

```bash
polli harness opencode on
```

What this does:

- Resolves a dedicated Pollinations API key (created on first `polli login` — no
  second login is required).
- Writes a `pollinations` provider block into `~/.config/opencode/opencode.json`
  pointing at `https://gen.pollinations.ai/v1`.
- Enables the `opencode-pollinations-plugin` (media, usage, and quest tools).
- Selects a default compatible text model.
- Leaves any existing, non-Pollinations OpenCode configuration untouched.

If OpenCode is not installed, the command prints the official install steps
(`npm install -g opencode-ai` or https://opencode.ai/) and still writes the config.

### Choose a model

```bash
polli models                 # list compatible Pollinations text models
polli harness opencode on --model <model-id>
```

The default model is `openai`. Any model reported by `polli models` that supports
tool calling can be selected. Re-running `on` with a different `--model` updates the
selection and keeps the pre-setup backup.

### Check status

```bash
polli harness opencode status
```

Reports whether the integration is ready: provider configured, selected model, and
plugin enabled. Example:

```json
{
  "harness": "opencode",
  "label": "OpenCode",
  "configured": true,
  "model": "openai",
  "mcp": true,
  "files": ["/home/you/.config/opencode/opencode.json"]
}
```

### Remove Pollinations from OpenCode

```bash
polli harness opencode off
```

Removes only Pollinations-owned configuration: the `pollinations` provider block, the
`opencode-pollinations-plugin` entry, and the `pollinations/...` model selection.
Any other providers, plugins, or settings you added remain unchanged. If the config
file was unchanged since `on`, the original file is restored byte-for-byte.

### How the key is scoped

`polli login` mints a dedicated key stored for the harness. It is never printed and
is written only into the OpenCode config. Use `polli auth status --json` to inspect
the session without revealing the secret.
