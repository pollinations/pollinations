# Coding Harnesses

Use `polli harness` to connect a supported coding harness to Pollinations. It handles Polli login, a dedicated API key, model setup, and any Pollinations capabilities supported by that harness.

> **Available now:** Bloom CLI, DeepSeek Harness, OpenCode, OpenClaw, Pi, and Prime Agent are integrated `polli harness` profiles.

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

If a harness cannot be launched, `on` stops before login, key creation, or configuration and shows its official installation command. If Polli is not installed yet, run the first setup through `npx @pollinations/cli@latest`. Login uses the browser device flow by default. Each harness receives its own API key instead of reusing the account key stored by `polli auth login`.

## Update a harness

Polli configures harnesses; it does not update their installations. Use the harness's updater (or the package manager you installed it with), then rerun `polli harness <harness> on` to refresh the model catalog and configuration.

```bash
npm install -g @pollinations/cli@latest
uv tool upgrade bloom-cli
npx @deepseek-ai/dsh@latest web
opencode upgrade
openclaw update
pi update self
prime-agent update
```

Current OpenClaw requires Node `>=24.16.0 <25` or `>=26.1.0`; Pi requires Node `>=22.19.0`. Upgrade Node before updating either harness if needed. Bloom requires Python 3.12 or newer. Stop a running DSH server before launching its replacement, and back up saved sessions before a major harness upgrade.

## Harnesses

| Harness | Status | What is unique |
| --- | --- | --- |
| [Bloom CLI](https://github.com/Ilm-Alan/bloom-cli) | **Available now** — `polli harness bloom on` | Creates a dedicated key for Bloom's existing Pollinations integration. |
| [Claude Code](https://github.com/anthropics/claude-code) | **Available now** — `polli harness claude-code on` | Configures the [Claude Code Router](https://github.com/musistudio/claude-code-router) provider and an isolated `Pollinations` launch profile; the native `~/.claude` login is never touched. |
| [Codex](https://github.com/openai/codex) | **Available now** — `polli harness codex on` | Configures the [Codex Router](https://github.com/duolahypercho/codex-router) generic provider end to end (provider, credential, curated model, smoke request). Preserves the ChatGPT login, native GPT models, and profiles. |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) | **Available now** — `polli harness dsh on` | Adds the Pollinations provider, hosted Pollinations MCP, and Polli skill. Uses `deepseek/deepseek-v4-flash` by default. Its official launch uses `npx`, so no separate global DSH installation is required. |
| [OpenCode](https://opencode.ai) | **Available now** — `polli harness opencode on` | Uses the existing [Pollinations OpenCode plugin](https://github.com/fkom13/opencode-pollinations-plugin) for models, media tools, usage, and quests. Defaults to `openai/gpt-5.4-nano`. |
| [OpenClaw](https://github.com/openclaw/openclaw) | **Available now** — `polli harness openclaw on` | Adds the Pollinations provider, a dedicated key, and the Polli skill, pulling models from the live catalog. Defaults to `moonshotai/kimi-k2.6`. |
| [Pi](https://github.com/earendil-works/pi) | **Available now** — `polli harness pi on` | Uses Pi's native provider support and the Polli skill. Pi intentionally has no built-in MCP support. Defaults to `deepseek/deepseek-v4-flash`. |
| [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent) | **Available now** — `polli harness prime on` | Uses native provider support and the Polli skill while preserving memories, sessions, and unrelated configuration. |

## Bloom CLI

```bash
uv tool install --python 3.12 bloom-cli
polli harness bloom on
bloom
```

Bloom already uses Pollinations for its models. `on` creates a dedicated key and stores it in `~/.bloom/.env` (or `$BLOOM_HOME/.env`); `off` restores the previous file or removes only that key if the file changed later.

## Claude Code

```bash
npm install -g @anthropic-ai/claude-code
npm install -g @musistudio/claude-code-router
npx @pollinations/cli@latest harness claude-code on
ccr "Pollinations"
```

`on` requires both the Claude Code CLI and [Claude Code Router](https://github.com/musistudio/claude-code-router) (CCR). It adds a `pollinations` provider (base URL `https://gen.pollinations.ai/v1`, `autoFetchModels` so CCR keeps the catalog current) plus an isolated Agent Config profile named `Pollinations` with scope **Only opened from CCR** in CCR's own `config.sqlite`, then smoke-tests one `pong` request through the CCR gateway. Your existing Claude login, settings, providers, and profiles are untouched: the generated profile settings live under `~/.claude-code-router/profiles/`, and nothing is written to `~/.claude`. Choose another model with `--model <id>`. `off` restores `config.sqlite` byte-for-byte, or removes only the Pollinations provider, profile, and profile key after outside edits. Start the profile with `ccr "Pollinations"`, then use `/model` inside Claude Code to switch among the models the gateway exposes.

Troubleshooting: `polli harness claude-code status` reports the provider/key/profile state and, when CCR is installed, runs the same smoke check on demand. If the profile does not launch, make sure the CCR gateway is running (`ccr start` or the desktop app's Server page) — the adapter starts it when it can and skips the smoke with a note when it cannot. Version skew: CCR 3.x stores its config in `config.sqlite` and the adapter writes that store with the same document schema; if a future CCR moves storage again, re-run `polli harness claude-code on` after upgrading and `off` first if the config was left in an old format.

## Codex

```bash
npm install -g @openai/codex
curl -fsSL https://raw.githubusercontent.com/duolahypercho/codex-router/main/install.sh | sh -s -- --target codex --guided
npx @pollinations/cli@latest harness codex on
```

`on` requires the Codex CLI and [Codex Router](https://github.com/duolahypercho/codex-router). The whole setup is driven through the router's own commands: `providers generic add|edit` (OpenAI-chat adapter against `https://gen.pollinations.ai/v1`), the dedicated Pollinations key handed to `providers generic credential ... set --stdin` (it lands only in the router's protected credential file), `providers enable`, and `curate-models ... --apply` for the selected model from the live catalog. Before finishing, a one-word `pong` request runs through the real `codex exec` → router → Pollinations path. Your ChatGPT login, native GPT models, profiles, and settings are preserved; the router manages its own block in `~/.codex/config.toml`. Choose another model with `--model <id>`; `off` restores the router state byte-for-byte when untouched, otherwise removes only the Pollinations provider, its credential, and its curated routes (`providers generic remove`), leaving the router and unrelated providers installed. A router installed with `--no-discovery` refuses to read credential files by design — re-run the installer without that flag first. Fully quit and reopen Codex (or the ChatGPT app) after `on` to refresh the model picker.

Troubleshooting: `polli harness codex status` reports the provider, credential, curated model, and files, using the router's own `providers generic show`. A `providers generic test` that fails with "response exceeds the byte limit" is the router's 64 KiB discovery bound, not a broken provider — curation and routed requests still work, and the adapter's smoke is a real generation instead. Version skew: the adapter drives the router's documented provider commands (v0.6.x); after upgrading the router, re-run `polli harness codex status` and, if flags changed, `off` then `on` again.

## DeepSeek Harness

```bash
npx @pollinations/cli@latest harness dsh on
polli harness dsh status
polli harness dsh off
```

DeepSeek Harness is officially run with `npx @deepseek-ai/dsh@latest web`. The explicit `@latest` selects the current release rather than a local installation. `on` verifies that `npx` is available before changing configuration. Choose another default model with `--model <id>`. Add `--no-mcp` if you do not want the hosted Pollinations media tools.

## OpenCode

```bash
npx @pollinations/cli@latest harness opencode on
polli harness opencode status
polli harness opencode off
```

`on` requires OpenCode to be installed (`curl -fsSL https://opencode.ai/install | bash`, `npm i -g opencode-ai`, or your package manager). It enables the existing [Pollinations OpenCode plugin](https://github.com/fkom13/opencode-pollinations-plugin) in `~/.config/opencode/opencode.json` (or `$OPENCODE_CONFIG` / `$OPENCODE_CONFIG_DIR`), stores a dedicated Pollinations API key in the plugin's own `config.json` (so no second login inside OpenCode is needed), and sets the default model to `pollinations/enter/openai/gpt-5.4-nano`. The plugin then serves the current Pollinations model catalog, media tools, usage, and `/poll quests` inside OpenCode. Choose another default with `--model <id>`; `off` removes only the plugin entry, the default model, and the stored key, leaving the rest of your OpenCode configuration untouched.

## OpenClaw

```bash
npx @pollinations/cli@latest harness openclaw on
polli harness openclaw status
polli harness openclaw off
```

`on` requires OpenClaw to be installed (`curl -fsSL https://openclaw.ai/install.sh | bash`, or `openclaw.ai/install`). For a fresh install, it first creates OpenClaw's baseline config and workspace. It then adds a `pollinations` provider under `models.providers` in `~/.openclaw/openclaw.json` (or `$OPENCLAW_CONFIG_PATH` / `$OPENCLAW_STATE_DIR` / `$OPENCLAW_HOME`), stores a dedicated Pollinations API key in `env.vars` and references it from the provider with OpenClaw's own `${VAR}` substitution, and sets the default model to `pollinations/moonshotai/kimi-k2.6` in `agents.defaults.model.primary`. The model list is pulled live from the Pollinations catalog (`--model <id>` to choose a different default). The Polli skill is installed under `~/.openclaw/skills/polli/` so the agent can generate images, audio, and video. Choose another default with `--model <id>`; `off` restores the previous config byte-for-byte, or (if you edited it) removes only the Pollinations provider, the key, a `pollinations/*` default model, and the skill, leaving unrelated settings untouched.

## Pi

```bash
npx @pollinations/cli@latest harness pi on
polli harness pi status
polli harness pi off
```

`on` requires Pi to be installed with its official npm command: `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`. It registers the current compatible Pollinations model catalog in `~/.pi/agent/models.json`, stores a dedicated key in `auth.json`, selects the startup model in `settings.json`, and installs the Polli skill under `skills/polli/`. Choose another default with `--model <id>`. Pi does not include built-in MCP support.

## Prime Agent

```bash
npx @pollinations/cli@latest harness prime on
polli harness prime status
polli harness prime off
```

`on` requires Prime Agent to be installed with its official installer. It registers the current compatible Pollinations model catalog in `~/.prime/agent/models.json`, stores a dedicated key in `auth.json`, selects the startup model in `settings.json`, and installs the Polli skill under `skills/polli/`. Choose another default with `--model <id>`.
