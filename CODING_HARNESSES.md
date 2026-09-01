# Coding Harnesses

Use `polli harness` to connect a supported coding harness to Pollinations. It handles Polli login, a dedicated API key, model setup, and any Pollinations capabilities supported by that harness.

> **Available now:** DeepSeek Harness, OpenCode, Pi, Prime Agent, and OpenClaw are integrated `polli harness` profiles.

## Use a harness

Every integrated harness follows the same lifecycle:

```bash
polli harness --help
polli harness <harness> on
polli harness <harness> status
polli harness <harness> off
```

- `on` first checks that the harness can be launched, then connects it to Pollinations.
- `status` shows whether the harness is ready to use Pollinations.
- `off` removes only the Pollinations setup and preserves unrelated configuration.

If a harness cannot be launched, `on` stops before login, key creation, or configuration and shows its official installation command. If Polli is not installed yet, run the first setup through `npx @pollinations/cli`. Login uses the browser device flow by default. Each harness receives its own API key instead of reusing the account key stored by `polli auth login`.

## Harnesses

| Harness | Status | What is unique |
| --- | --- | --- |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) | **Available now** — `polli harness dsh on` | Adds the Pollinations provider, hosted Pollinations MCP, and Polli skill. Uses `deepseek` by default. Its official launch uses `npx`, so no separate global DSH installation is required. |
| [OpenCode](https://opencode.ai) | **Available now** — `polli harness opencode on` | Uses the existing [Pollinations OpenCode plugin](https://github.com/fkom13/opencode-pollinations-plugin) for models, media tools, usage, and quests. Defaults to `openai`. |
| [Pi](https://github.com/earendil-works/pi) | **Available now** — `polli harness pi on` | Uses Pi's native provider support and the Polli skill. Pi intentionally has no built-in MCP support. Defaults to `deepseek`. |
| [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent) | **Available now** — `polli harness prime on` | Uses native provider support and the Polli skill while preserving memories, sessions, and unrelated configuration. |
| [OpenClaw](https://github.com/openclaw/openclaw) | **Available now** — `polli harness openclaw on` | Adds the Pollinations provider and Polli skill, and runs OpenClaw's own onboarding for fresh installs. Uses `kimi` by default. |

## DeepSeek Harness

```bash
npx @pollinations/cli harness dsh on
polli harness dsh status
polli harness dsh off
```

DeepSeek Harness is officially run with `npx @deepseek-ai/dsh web`. `on` verifies that `npx` is available before changing configuration. Choose another default model with `--model <id>`. Add `--no-mcp` if you do not want the hosted Pollinations media tools.

## OpenCode

```bash
npx @pollinations/cli harness opencode on
polli harness opencode status
polli harness opencode off
```

`on` requires OpenCode to be installed (`curl -fsSL https://opencode.ai/install | bash`, `npm i -g opencode-ai`, or your package manager). It enables the existing [Pollinations OpenCode plugin](https://github.com/fkom13/opencode-pollinations-plugin) in `~/.config/opencode/opencode.json` (or `$OPENCODE_CONFIG` / `$OPENCODE_CONFIG_DIR`), stores a dedicated Pollinations API key in the plugin's own `config.json` (so no second login inside OpenCode is needed), and sets the default model to `pollinations/enter/openai`. The plugin then serves the current Pollinations model catalog, media tools, usage, and `/poll quests` inside OpenCode. Choose another default with `--model <id>`; `off` removes only the plugin entry, the default model, and the stored key, leaving the rest of your OpenCode configuration untouched.

## Pi

```bash
npx @pollinations/cli harness pi on
polli harness pi status
polli harness pi off
```

`on` requires Pi to be installed with its official npm command: `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`. It registers the current compatible Pollinations model catalog in `~/.pi/agent/models.json`, stores a dedicated key in `auth.json`, selects the startup model in `settings.json`, and installs the Polli skill under `skills/polli/`. Choose another default with `--model <id>`. Pi does not include built-in MCP support.

## Prime Agent

```bash
npx @pollinations/cli harness prime on
polli harness prime status
polli harness prime off
```

`on` requires Prime Agent to be installed with its official installer. It registers the current compatible Pollinations model catalog in `~/.prime/agent/models.json`, stores a dedicated key in `auth.json`, selects the startup model in `settings.json`, and installs the Polli skill under `skills/polli/`. Choose another default with `--model <id>`.

## OpenClaw

```bash
npx @pollinations/cli harness openclaw on
polli harness openclaw status
polli harness openclaw off
```

- If the `openclaw` command is not found, `on` offers the official installation experience: interactive terminals get a prompt that runs the official installer, and non-interactive runs print it (`curl -fsSL https://openclaw.ai/install.sh | bash` on macOS/Linux/WSL2, `iwr -useb https://openclaw.ai/install.ps1 | iex` on Windows). Then re-run `polli harness openclaw on`.
- On a fresh machine that has never run `openclaw onboard`, `on` runs OpenClaw's own non-interactive onboarding first, so you still get a normal workspace, gateway token, and agent — not just a config file. This bootstrap step happens before any Pollinations-specific keys are written, so `off` never has to undo it.
- On an existing installation, `on` only adds a `pollinations` entry to `models.providers` in `openclaw.json` and sets it as the default model (`agents.defaults.model.primary`). Every other agent, channel, and config value is left exactly as it was.
- The model list comes from `gen.pollinations.ai/v1/models` at run time — there is no separate hardcoded model list to fall out of date. Pass `--model <id>` to pick a default other than `kimi`; run `polli models` to see current choices.
- The dedicated Pollinations key lives once in `openclaw.json`'s `env.vars.POLLI_OPENCLAW_API_KEY` and is referenced from the provider as `${POLLI_OPENCLAW_API_KEY}`, OpenClaw's own variable substitution.
- `polli harness openclaw status` reports whether the provider, default model, key, and Polli skill are all in place, and which files are managed.
- `off` restores the exact `openclaw.json` and skill file from before `on` ran, byte-for-byte, as long as nothing else edited them in between. If something else did, `off` instead strips only the `pollinations` provider, a `pollinations/*` default model, the dedicated key, and the Polli skill, leaving every unrelated setting untouched.
- Restart a running gateway afterward with `openclaw gateway restart` to pick up the change immediately; otherwise it applies on the next request.

This replaces the old `apps/openclaw/setup-pollinations.sh` script, which hardcoded a fixed model list. That script now forwards to this harness for backward compatibility.
