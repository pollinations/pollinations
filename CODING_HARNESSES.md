# Coding Harnesses

Use `polli harness` to connect a supported coding harness to Pollinations. It handles Polli login, a dedicated API key, model setup, and any Pollinations capabilities supported by that harness.

> **Available now:** Bloom CLI, Claude Code, Codex, DeepSeek Harness, OpenCode, OpenClaw, Pi, and Prime Agent are integrated `polli harness` profiles.

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
codex-router update
npm install -g @musistudio/claude-code-router
```

Current OpenClaw requires Node `>=24.16.0 <25` or `>=26.1.0`; Pi requires Node `>=22.19.0`. Upgrade Node before updating either harness if needed. Bloom requires Python 3.12 or newer. Stop a running DSH server before launching its replacement, and back up saved sessions before a major harness upgrade.

## Harnesses

| Harness | Status | What is unique |
| --- | --- | --- |
| [Bloom CLI](https://github.com/Ilm-Alan/bloom-cli) | **Available now** — `polli harness bloom on` | Creates a dedicated key for Bloom's existing Pollinations integration. |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) | **Available now** — `polli harness dsh on` | Adds the Pollinations provider, hosted Pollinations MCP, and Polli skill. Uses `deepseek/deepseek-v4-flash` by default. Its official launch uses `npx`, so no separate global DSH installation is required. |
| [OpenCode](https://opencode.ai) | **Available now** — `polli harness opencode on` | Uses the existing [Pollinations OpenCode plugin](https://github.com/fkom13/opencode-pollinations-plugin) for models, media tools, usage, and quests. Defaults to `openai/gpt-5.4-nano`. |
| [OpenClaw](https://github.com/openclaw/openclaw) | **Available now** — `polli harness openclaw on` | Adds the Pollinations provider, a dedicated key, and the Polli skill, pulling models from the live catalog. Defaults to `moonshotai/kimi-k2.6`. |
| [Pi](https://github.com/earendil-works/pi) | **Available now** — `polli harness pi on` | Uses Pi's native provider support and the Polli skill. Pi intentionally has no built-in MCP support. Defaults to `deepseek/deepseek-v4-flash`. |
| [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent) | **Available now** — `polli harness prime on` | Uses native provider support and the Polli skill while preserving memories, sessions, and unrelated configuration. |
| [Claude Code](https://claude.com/claude-code) | **Available now** — `polli harness claude-code on` | Configures Claude Code through [Claude Code Router](https://github.com/musistudio/claude-code-router): a dedicated provider plus an isolated `Pollinations` profile, applied through the router's own management API. |
| [Codex](https://developers.openai.com/codex) | **Available now** — `polli harness codex on` | Configures Codex through [Codex Router](https://github.com/duolahypercho/codex-router): a `pollinations` generic provider, its protected key, and the live Pollinations catalog, all through `codex-router`'s own commands. |

## Bloom CLI

```bash
uv tool install --python 3.12 bloom-cli
polli harness bloom on
bloom
```

Bloom already uses Pollinations for its models. `on` creates a dedicated key and stores it in `~/.bloom/.env` (or `$BLOOM_HOME/.env`); `off` restores the previous file or removes only that key if the file changed later.

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

## Claude Code

```bash
npm install -g @musistudio/claude-code-router   # if it is not installed yet
ccr start
npx @pollinations/cli@latest harness claude-code on
polli harness claude-code status
polli harness claude-code off
```

`on` requires Claude Code Router to be installed and **running**: polli changes the router's
configuration through the same authenticated management API its own UI uses (`getConfig` /
`saveConfig` on `service.json`'s `ccr_web_token`), because the router keeps its config in
`config.sqlite` and its running instance owns that file. If the router is not running, `on`
stops before login or key creation and tells you to run `ccr start`.

It adds a `pollinations` provider (base URL `https://gen.pollinations.ai/v1`, a dedicated
Pollinations key, and the live tool-calling catalog) and an isolated `Pollinations` profile for
the `claude-code` agent with `scope: ccr`, so nothing is written into `~/.claude` or your native
Claude login until you launch Claude Code through that profile. Choose another default model with
`--model <id>`.

Apply the profile the way the router expects:

```bash
ccr Pollinations              # launch Claude Code through the profile
# or: ccr ui → Agent Config → Claude Code → Pollinations
```

`status` reports whether the router is running, whether the Pollinations provider and profile are
present, and the selected model. `off` removes only that provider and profile through the same
API, does not re-apply a profile, and restores `~/.claude/settings.json` byte-for-byte when
nothing else has edited it since `on`.

### Troubleshooting

- `on` says the router is not running: start it with `ccr start`. Polli changes the router's
  configuration through its management API, so it never edits `config.sqlite` behind a stopped
  router's back.
- The management API answers `401`: the router is running with a different web token than the one
  in `service.json`. Restart it with `ccr start` so a fresh `service.json` is published.
- Version skew: after `npm install -g @musistudio/claude-code-router`, run
  `polli harness claude-code on` again so the provider's model list is refreshed from the live
  catalog.

## Codex

```bash
codex-router setup --guided     # if Codex Router is not set up yet
npx @pollinations/cli@latest harness codex on
polli harness codex status
polli harness codex off
```

`on` requires [Codex Router](https://github.com/duolahypercho/codex-router) on `PATH`. It stops
before login or key creation if the router is missing, and prints the official installers.

Everything happens through the router's own commands: a generic provider
(`providers generic add pollinations --base-url https://gen.pollinations.ai/v1 --adapter
openai-chat`), its protected key, the curated live catalog
(`curate-models pollinations --models … --apply`), the Codex wiring (`enable`, the same step
`codex-router setup` runs), and the routed default model (`control model-set`). The dedicated
Pollinations key is written with the router's own credential code, never into `config.toml`,
never into your shell history, and never into a second config file. Because `enable` is also what
installs the router's background service, `on` is the full "make Codex route through the router"
step rather than a half-configuration. Choose another default model with `--model <id>`.

```bash
# optional end-to-end check through the router (one small billed request);
# the slug is pollinations/<model id>, and the probe asks for its own confirmation
codex-router test-model pollinations/openai/gpt-5.4-nano --live --yes
```

`status` reports whether the provider is enabled, the key is stored, the Codex wiring is present,
and which model is selected. `off` runs the router's own `providers generic remove pollinations`
(withdrawing the provider's key, curated routes, and picker decisions) plus `codex-router
disable` — the router's own inverse of `enable`, and only when polli was the run that added that
wiring. It restores your `config.toml` byte-for-byte when nothing else has edited it since `on`;
otherwise only the Pollinations-owned entries are removed, leaving the router, its service, and
other providers installed.

### Troubleshooting

- `on` stops at `Codex Router is required`: install the router, run `codex-router setup --guided`
  (it needs a signed-in Codex CLI), then run `polli harness codex on` again.
- `on` stops at the credential step: the router is the source of truth —
  `codex-router providers generic credential pollinations status`. If it reports the key as
  missing, `codex-router providers generic credential pollinations set` accepts one by hand.
- Version skew: after `codex-router update`, run `polli harness codex on` again so the curated
  catalog and the routed default model are refreshed.

