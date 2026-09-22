# Coding Harnesses

Use `polli harness` to connect a supported coding harness to Pollinations. It handles Polli login, a dedicated API key, model setup, and any Pollinations capabilities supported by that harness.

> **Available now:** Bloom CLI, Claude Code, Codex, DeepSeek Harness, OpenCode, OpenClaw, Pi, Prime Agent, and tgpt are integrated `polli harness` profiles.

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
| Claude Code via [Claude Code Router](https://github.com/musistudio/claude-code-router) | **Available now** — `polli harness claude-code on` | Adds a Pollinations provider and an isolated `ccr`-scoped profile through the router's management RPC. Native Claude Code login stays untouched. Defaults to `openai/gpt-5.4-nano`. |
| Codex via [Codex Router](https://github.com/duolahypercho/codex-router) | **Available now** — `polli harness codex on` | Registers the generic provider, hands the key over stdin, and curates the model through the router's own CLI. Defaults to `openai/gpt-5.4-nano`. |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) | **Available now** — `polli harness dsh on` | Adds the Pollinations provider, hosted Pollinations MCP, and Polli skill. Uses `deepseek/deepseek-v4-flash` by default. Its official launch uses `npx`, so no separate global DSH installation is required. |
| [OpenCode](https://opencode.ai) | **Available now** — `polli harness opencode on` | Uses the existing [Pollinations OpenCode plugin](https://github.com/fkom13/opencode-pollinations-plugin) for models, media tools, usage, and quests. Defaults to `openai/gpt-5.4-nano`. |
| [OpenClaw](https://github.com/openclaw/openclaw) | **Available now** — `polli harness openclaw on` | Adds the Pollinations provider, a dedicated key, and the Polli skill, pulling models from the live catalog. Defaults to `moonshotai/kimi-k2.6`. |
| [Pi](https://github.com/earendil-works/pi) | **Available now** — `polli harness pi on` | Uses Pi's native provider support and the Polli skill. Pi intentionally has no built-in MCP support. Defaults to `deepseek/deepseek-v4-flash`. |
| [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent) | **Available now** — `polli harness prime on` | Uses native provider support and the Polli skill while preserving memories, sessions, and unrelated configuration. |
| [tgpt](https://github.com/aandrew-me/tgpt) | **Available now** — `polli harness tgpt on` | Configures tgpt's existing Pollinations provider with a dedicated key and authenticated text model. |

## Bloom CLI

```bash
uv tool install --python 3.12 bloom-cli
polli harness bloom on
bloom
```

Bloom already uses Pollinations for its models. `on` creates a dedicated key and stores it in `~/.bloom/.env` (or `$BLOOM_HOME/.env`); `off` restores the previous file or removes only that key if the file changed later.

## Claude Code (via Claude Code Router)

```bash
npx @pollinations/cli@latest harness claude-code on
polli harness claude-code status
polli harness claude-code off
```

`on` requires Claude Code Router (`npm install -g @musistudio/claude-code-router`, version `>=3.0.0`) and Claude Code (`npm install -g @anthropic-ai/claude-code`), with the router already running (`ccr start` — Polli never starts it, because CCR's default global profiles take over `~/.claude` on first launch). Configuration goes through the same management RPC the router's own UI uses (`getConfig` / `saveConfig`), so there is no concurrent SQLite writer. It adds a `pollinations` provider pointing at `https://gen.pollinations.ai/v1`, stores a dedicated key, and enables an isolated profile scoped to `ccr` only — `ccr "Pollinations"` routes to Pollinations while your native Claude Code login and settings stay untouched. `status` reports each prerequisite, whether the service is up, and whether the stored key still validates against the Pollinations API. A one-word smoke test through the gateway runs before `on` succeeds; a failure rolls the router config back. Choose another default with `--model <id>`; `off` restores the pre-`on` config byte-for-byte when you have not edited it since, or otherwise removes only the Pollinations provider and profile. When the router is stopped, `off` works offline through a read-only SQLite path.

## Codex (via Codex Router)

```bash
npx @pollinations/cli@latest harness codex on
polli harness codex status
polli harness codex off
```

`on` requires Codex (`npm install -g @openai/codex`) and [Codex Router](https://github.com/duolahypercho/codex-router) (version `>=0.5.0`, Node `>=22.19.0`). The adapter drives the router's own scripts — `providers generic add`, `credential set --stdin` (the key never appears in argv or the shell), `curate-models --apply`, and a live `compatibility-test` smoke — so it does not write `generic-providers.json` by hand. State lives under `$CODEX_HOME/codex-router` (default `~/.codex/codex-router`). `off` restores the pre-`on` router files byte-for-byte when untouched; after outside edits it removes only the Pollinations provider, credential, and curated routes. Choose another default with `--model <id>`; `status` reports each prerequisite and the selected model.

## tgpt

```bash
brew install tgpt # or use another official installation method
polli harness tgpt on
tgpt "Hello"
```

tgpt already includes a Pollinations provider. `on` selects it for text generation and writes a dedicated key and model to `~/.config/tgpt/config.conf`, making tgpt use the authenticated `gen.pollinations.ai` endpoint. Choose another model with `--model <id>`; `off` restores the previous file or removes only the Pollinations values if the file changed later.

The default model is `openai/gpt-5.4-nano`. Polli clears any generic `AI_API_KEY` from this file so it cannot override the dedicated `POLLINATIONS_API_KEY`; the original file is backed up. Exported environment variables, a local `config.conf`, or `--config` can override this user-level setup. `off` does not revoke the account key.

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
