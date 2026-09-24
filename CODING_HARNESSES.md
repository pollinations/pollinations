# Coding Harnesses

Use `polli harness` to connect a supported coding harness to Pollinations. It handles Polli login, a dedicated API key, model setup, and any Pollinations capabilities supported by that harness.

> **Available now:** Bloom CLI, Claude Code Router, Codex Router, DeepSeek Harness, OpenCode, OpenClaw, Pi, and Prime Agent are integrated `polli harness` profiles.

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

Router integrations run small live checks after setup: an exact `pong`, a streamed response, a forced tool call, and confirmation that usage appeared on the dedicated key. These checks are billable but deliberately small. Use `--no-smoke` only when you need to configure without making live requests.

If a harness cannot be launched, `on` stops before login, key creation, or configuration and shows its official installation command. If Polli is not installed yet, run the first setup through `npx @pollinations/cli@latest`. Login uses the browser device flow by default. Each harness receives its own API key instead of reusing the account key stored by `polli auth login`.

## Update a harness

Polli configures harnesses; it does not update their installations. Use the harness's updater (or the package manager you installed it with), then rerun `polli harness <harness> on` to refresh the model catalog and configuration.

```bash
npm install -g @pollinations/cli@latest
uv tool upgrade bloom-cli
npm install -g @musistudio/claude-code-router@latest
# Codex Router: rerun its official installer, or `brew upgrade codex-router`
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
| [Claude Code Router](https://github.com/musistudio/claude-code-router) | **Available now** — `polli harness claude-code on` | Uses CCR's authenticated management API and an isolated Claude Code profile. Defaults to `deepseek/deepseek-v4-flash`. |
| [Codex Router](https://github.com/duolahypercho/codex-router) | **Available now** — `polli harness codex on` | Publishes Pollinations as an explicit generic provider through Codex Router. Defaults to `openai/gpt-5.4-nano`. |
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

## Claude Code Router

Prerequisites are Node.js 22 or newer, Claude Code, and Claude Code Router `>=3.1.1 <4.0.0`:

```bash
npm install -g @anthropic-ai/claude-code
npm install -g @musistudio/claude-code-router
polli harness claude-code on
polli harness claude-code status
ccr "Pollinations Claude Code"
```

`on` starts CCR without opening its UI, fetches the current compatible Pollinations model catalog, and saves the provider through CCR's authenticated management API. It creates an enabled `Pollinations Claude Code` profile with `scope: ccr`, so native Claude Code login and global settings remain untouched. The dedicated Pollinations key stays only in CCR's protected configuration database; Polli's ownership journal contains hashes, not credentials. Choose another model with `--model <id>`.

`status` reports the CCR version, gateway readiness, provider, dedicated key, selected model, and missing prerequisites. `off` asks CCR to remove only the Pollinations provider/profile and its generated profile client key. Untouched setup is restored semantically; if the owned entries changed, Polli performs surgical cleanup and preserves every unrelated provider and profile.

Troubleshooting:

- If `ccr` or `claude` is missing, install the command shown above. Polli stops before login or key creation.
- If the service state is stale, run `ccr start --no-open`, then retry `polli harness claude-code status`.
- If `status` reports version skew, update with `npm install -g @musistudio/claude-code-router@latest`.
- If an entry-id collision is reported, rename the existing user-owned `pollinations` provider or `pollinations-claude-code` profile. Polli will not overwrite it.
- Setup rolls CCR back to its in-memory pre-change configuration if saving, gateway startup, smoke checks, or usage verification fails.

## Codex Router

Install Codex Router from its [official repository](https://github.com/duolahypercho/codex-router), including guided setup, then use version `>=0.6.0 <1.0.0`:

```bash
codex-router setup --guided
polli harness codex on
polli harness codex status
# Fully quit and reopen Codex, then select a pollinations/* model.
```

The official macOS/Linux and PowerShell installers are documented in the Codex Router README; Homebrew users can tap its repository and run `brew install codex-router`. Do not install an unrelated npm package with the same name.

`on` fetches the live compatible model catalog and adds an explicit `pollinations` generic provider using Codex Router's current `openai-chat` adapter. The dedicated key is stored only in Codex Router's protected provider-key file; snapshots cover only non-secret metadata. Choose another default with `--model <id>`. Codex's native login and unrelated settings stay in place.

`status` reports the router version, service readiness, provider, key, selected model, and prerequisites. `off` restores untouched metadata byte-for-byte. If those files changed after setup, it removes only Polli-owned provider, credential-reference, model, and picker entries, then republishes the remaining catalog.

Troubleshooting:

- If `codex-router` is missing, follow the official installer. Polli stops before login or key creation.
- If the caller capability is missing, run `codex-router setup --guided`; for a damaged service, run `codex-router doctor --fix`.
- If `status` reports version skew, update with the same official installer (or `brew upgrade codex-router`).
- If a `pollinations` provider/model collision is reported, rename or remove the user-owned entry first. Polli will not overwrite it.
- After `on` or `off`, fully quit and reopen Codex so it reloads the routed catalog.

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
