# Coding Harnesses

Use `polli harness` to connect a supported coding harness to Pollinations. It handles Polli login, a dedicated API key, model setup, and any Pollinations capabilities supported by that harness.

> **Available now:** Bloom CLI, Claude Code (through Claude Code Router), Codex (through Codex Router), DeepSeek Harness, OpenCode, OpenClaw, Pi, and Prime Agent are integrated `polli harness` profiles.

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
npm install -g @musistudio/claude-code-router@latest
# Codex Router: rerun its official installer/update flow
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
| [Claude Code](https://claude.com/claude-code) + [Claude Code Router](https://github.com/musistudio/claude-code-router) | **Available now** — `polli harness claude-code on` | Adds a Pollinations provider and isolated `ccr`-scope Claude profile without replacing native Claude login/settings; performs a routed `pong` smoke and verifies dedicated-key usage. |
| [Codex](https://github.com/openai/codex) + [Codex Router](https://github.com/duolahypercho/codex-router) | **Available now** — `polli harness codex on` | Uses Codex Router's generic-provider/curation path, protected credential storage and compatibility probe; native Codex ChatGPT login is left untouched. |
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

## Claude Code through Claude Code Router

```bash
npm install -g @musistudio/claude-code-router@latest
ccr start
polli harness claude-code on
polli harness claude-code status
ccr "Pollinations"
polli harness claude-code off
```

`on` requires both `claude` and Claude Code Router (CCR) `>=3.1.1`, and requires the CCR service to already be running. Missing prerequisites stop the command **before** Polli login or child-key creation. Polli uses CCR's authenticated management RPC rather than editing its live SQLite database. It adds one provider with id `pollinations-polli-harness` and one isolated `scope: "ccr"` Claude profile, so native Claude login, global settings, providers, and other profiles are left alone. The provider's secret lives only in CCR's own configuration.

Models come from Pollinations' live compatible model catalog; choose another with `--model <id>`. Before `on` succeeds, Polli sends a tiny one-word `pong` through CCR's Anthropic-facing gateway and then confirms the request appeared in `GET /account/key/usage` for the dedicated child key. `status` reports router/client/service/version/provider/profile readiness. `off` removes only the Polli-owned provider/profile, leaving CCR itself and unrelated state installed.

If `status` says the router is installed but not ready, run `ccr start`. If CCR's version is too old, upgrade it with the npm command above. If a different provider already uses the name `Pollinations`, Polli refuses to overwrite it.

## Codex through Codex Router

```bash
# Install/update Codex Router using its official installer:
# https://github.com/duolahypercho/codex-router#install-everything-recommended
polli harness codex on
polli harness codex status
polli harness codex off
```

`on` requires Codex and Codex Router `>=0.6.0`. Polli uses Codex Router's current generic-provider and model-curation interfaces instead of pointing Codex directly at Pollinations. It creates an owned generic provider named `pollinations`, stores the dedicated child key in Codex Router's protected credential store, and curates the selected live Pollinations model. Native Codex ChatGPT login and unrelated Codex/router providers are not replaced.

Choose the routed model with `--model <id>`. Before setup is reported successful, Codex Router runs its billed `test-model --quick` compatibility path and Polli confirms that the dedicated key's `/account/key/usage` count increased. For deeper troubleshooting or pre-production validation, Codex Router's full `test-model MODEL --live --yes --json` exercises basic response, streaming, tool calling, stateless tool-result replay, and compaction.

`status` reports Codex, router version, owned provider, protected key and curated-model readiness. `off` removes only the Polli-owned generic provider, its protected credential and routes; Codex Router remains installed. A pre-existing `pollinations` generic provider without Polli's ownership marker is never overwritten. If version skew is reported, update Codex Router before retrying; Polli intentionally stops before login/key creation when the router or Codex client is missing.

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
