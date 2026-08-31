# Coding Harnesses

Use `polli harness` to connect a supported coding harness to Pollinations. It handles Polli login, a dedicated API key, model setup, and any Pollinations capabilities supported by that harness.

All five profiles are integrated: DeepSeek Harness, OpenCode, Pi, Prime Agent, and OpenClaw.

## Use a harness

Every integrated harness follows the same lifecycle:

```bash
polli harness --help
polli harness <harness> on
polli harness <harness> status
polli harness <harness> off
```

- `on` connects the harness to Pollinations.
- `status` shows whether the harness is ready to use Pollinations.
- `off` removes only the Pollinations setup and preserves unrelated configuration.

If Polli is not installed yet, run the first setup through `npx @pollinations/cli`. Login uses the browser device flow by default. Each harness receives its own API key instead of reusing the account key stored by `polli auth login`.

## Harnesses

| Harness | Status | What is unique |
| --- | --- | --- |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) | **Available now** — `polli harness dsh on` | Adds the Pollinations provider, hosted Pollinations MCP, and Polli skill. Uses `deepseek` by default. |
| [OpenCode](https://opencode.ai) (`opencode`) | **Available now** — `polli harness opencode on` | Enables the existing [Pollinations OpenCode plugin](https://github.com/fkom13/opencode-pollinations-plugin) for models, media tools, usage, and quests. |
| [Pi](https://github.com/earendil-works/pi) (`pi`) | **Available now** — `polli harness pi on` | Uses native Pi provider support and the Polli skill; Pi does not include built-in MCP support. |
| [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent) | Coming soon | Will add Pollinations while preserving the agent's memories, sessions, and skills. |
| [OpenClaw](https://github.com/openclaw/openclaw) (`openclaw`) | **Available now** — `polli harness openclaw on` | Brings the [existing Pollinations setup](./apps/openclaw/README.md) into the shared `polli harness` workflow with a live model catalog. |

## DeepSeek Harness

```bash
npx @pollinations/cli harness dsh on
polli harness dsh status
polli harness dsh off
```

Choose another default model with `--model <id>`. Add `--no-mcp` if you do not want the hosted Pollinations media tools.

## OpenCode

```bash
polli harness opencode on
polli harness opencode status
polli harness opencode off
```

`on` enables the Pollinations OpenCode plugin in `~/.config/opencode/opencode.json` (or $OPENCODE_CONFIG_DIR), stores a dedicated key for the plugin, sets the default model, and installs the Polli skill. The plugin provides the live model catalog plus media, usage, and quest tools, so no second login is needed. If OpenCode is missing, the official install command is shown. `off` disables the plugin entry, clears the stored key, and restores your previous configuration.

## Pi

```bash
polli harness pi on
polli harness pi status
polli harness pi off
```

`on` writes the Pollinations provider with the current tool-calling model list to `~/.pi/agent/models.json` (or $PI_CODING_AGENT_DIR), stores a dedicated key in `auth.json`, sets the startup model in `settings.json`, and installs the Polli skill. Existing providers, settings, and auth entries are preserved. Pi has no built-in MCP support, and bridging one is outside this profile. `off` removes only the Pollinations provider, key, startup model, and skill.

## Prime Agent

```bash
polli harness prime on
polli harness prime status
polli harness prime off
```

`on` uses native Prime Agent provider support under `~/.prime/agent` (or $PRIME_AGENT_CODING_AGENT_DIR): the Pollinations provider with a live model list in `models.json`, a dedicated key in `auth.json`, the startup model in `settings.json`, and the Polli skill. Memories, sessions, skills, and unrelated configuration are preserved. `off` disconnects Pollinations without touching Prime Agent state.

## OpenClaw

```bash
polli harness openclaw on
polli harness openclaw status
polli harness openclaw off
```

`on` writes `models.providers.pollinations` into `~/.openclaw/openclaw.json` (or $OPENCLAW_STATE_DIR) with the current compatible models instead of a hardcoded catalog, stores a dedicated key, installs the Polli skill, and sets `agents.defaults.model.primary` when none is configured. An existing default model is kept; switch with `openclaw models set pollinations/<id>`. `off` removes the provider, a `pollinations/*` primary model, and the skill.
