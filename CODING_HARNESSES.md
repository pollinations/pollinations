# Coding Harnesses

Use `polli harness` to connect a supported coding harness to Pollinations. It handles Polli login, a dedicated API key, model setup, and any Pollinations capabilities supported by that harness.

> **Available now:** Bloom CLI, Claude Code (via Claude Code Router), Codex (via Codex Router), DeepSeek Harness, OpenCode, OpenClaw, Pi, and Prime Agent are integrated `polli harness` profiles.

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
npm install -g @musistudio/claude-code-router@latest
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
| [Claude Code](https://claude.com/claude-code) via [Claude Code Router](https://github.com/musistudio/claude-code-router) | **Available now** — `polli harness claude-code on` | Adds a Pollinations provider and a `Pollinations` profile launched with `ccr "Pollinations"`. Your own Claude login and settings are untouched. Defaults to `openai/gpt-5.4-nano`. |
| [Codex](https://github.com/openai/codex) via [Codex Router](https://github.com/duolahypercho/codex-router) | **Available now** — `polli harness codex on` | Adds Pollinations as a Codex Router provider and routes the chosen model into Codex's model picker. Your ChatGPT login, native models and profiles are untouched. Defaults to `openai/gpt-5.4-nano`. |
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

## Claude Code (Claude Code Router)

```bash
npm install -g @musistudio/claude-code-router
ccr start
polli harness claude-code on --model z-ai/glm-5.3-flash
ccr "Pollinations"
polli harness claude-code status
polli harness claude-code off
```

`on` needs `ccr` and `claude` installed and the router **already running** (`ccr start`); Polli does not start it, because the router's default profiles take over `~/.claude` and `~/.codex` the first time it runs with a provider. It then creates a dedicated key and uses the router's own management API to add a `pollinations` provider (the current tool-calling catalog, chosen model via `--model`) and an isolated `Pollinations` profile, and sends one word (`pong`) through the router gateway. If that request fails, the router configuration is restored. The profile uses the router's `ccr` scope, so it applies only when you launch `ccr "Pollinations"` — your normal `claude` login, settings and other providers are unchanged. The key is stored only in the router's configuration.

`status` reports whether the router, Claude Code, the running service, the provider and the profile are ready, and what to do next. `off` removes only the `pollinations` provider and the `Pollinations` profile through the same API.

Troubleshooting: `Claude Code Router is not running` means run `ccr start`. A model must be addressed as `openai/<model id>` (the gateway reads the first path segment as the protocol), which the adapter does for you. After a router upgrade, rerun `on`; if `status` disagrees with the router UI, the router's management API changed — check `ccr --help` and the router changelog.

## Codex (Codex Router)

```bash
polli harness codex on --model z-ai/glm-5.3-flash
polli harness codex status
polli harness codex off
```

`on` needs [Codex Router](https://github.com/duolahypercho/codex-router#install-everything-recommended) and `codex` installed; if either is missing it stops before login or key creation and shows the official install link. It runs the router's own commands: `providers generic add` for a `pollinations` OpenAI-chat provider at `https://gen.pollinations.ai/v1`, `credential set` (the key is handed over standard input, never argv or shell history, and stays in the router's protected credential store), `curate-models pollinations --models <id> --apply`, and finally the router's live compatibility probe (`compatibility-test`) for the chosen model. A failed probe removes what the run added. The model appears as `pollinations/<model id>` in Codex's picker after you fully quit and reopen Codex; your ChatGPT login, native models and profiles are untouched. Run `on` again with another `--model` to add more models.

`status` reports the router, Codex, provider, key and curated models. `off` removes the provider, which also removes its credential and routes, and leaves the router and other providers installed.

Troubleshooting: the adapter drives the router's scripts (`src/providers.mjs`, `src/curate-models.mjs`, `src/compatibility-test.mjs`) from `%LOCALAPPDATA%\codex-router` (Windows) or `~/.local/share/codex-router`; set `CODEX_ROUTER_HOME` if yours lives elsewhere. If a command reports an unknown option after a router update, compare `model-router codex providers generic` and `curate-models` usage with the versions above.

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
