# Coding Harnesses

Use `polli harness` to connect a supported coding harness to Pollinations. It handles Polli login, a dedicated API key, model setup, and any Pollinations capabilities supported by that harness.

Integrated harnesses: **DeepSeek Harness (`dsh`), OpenCode, Pi, Prime Agent, and OpenClaw**.

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

Every adapter fetches the live tool-calling model catalog from `gen.pollinations.ai/v1/models` — there is no hardcoded model list to maintain. Pick the default with `--model <id>` and keep the hosted Pollinations media tools with the default settings (`--no-mcp` skips plugin/MCP tool configuration).

Config files are merged, never rewritten, so existing agents, memories, sessions, skills, and unrelated settings survive. Before writing, `on` snapshots every file it may touch under `~/.pollinations/harnesses/`; `off` restores that snapshot byte-for-byte when the files were not edited since, otherwise it surgically strips only Pollinations-owned entries.

## Harnesses

| Harness | Command | What is unique |
| --- | --- | --- |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) | `polli harness dsh on` | Adds the Pollinations provider, hosted Pollinations MCP, and Polli skill under `$DSH_HOME` (default `~/.dsh`). Uses `deepseek` by default. |
| [OpenCode](https://opencode.ai) | `polli harness opencode on` | Writes an OpenAI-compatible Pollinations provider and enables the existing [Pollinations OpenCode plugin](https://github.com/fkom13/opencode-pollinations-plugin) in `~/.config/opencode/opencode.json` (`$OPENCODE_CONFIG_DIR`). The plugin reads the same key for media tools, usage, and quests. Uses `openai` by default. |
| [Pi](https://github.com/earendil-works/pi) | `polli harness pi on` | Writes `~/.pi/agent/models.json` (provider + models), `settings.json` (startup provider/model), and the Polli skill (`~/.pi/agent/skills/polli/SKILL.md`). Pi has no built-in MCP support, so media capabilities arrive through the skill. Uses `deepseek` by default. |
| [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent) | `polli harness prime on` | Writes `~/.prime/agent/models.json` and `settings.json` the same way, leaving memories, sessions, and skills untouched. Uses `deepseek` by default. |
| [OpenClaw](https://github.com/openclaw/openclaw) | `polli harness openclaw on` | Writes `models.providers.pollinations` in `~/.openclaw/openclaw.json`, sets the primary model (`agents.defaults.model.primary`), and installs the managed Polli skill. Uses `kimi` by default. |

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

The adapter writes the Pollinations provider (OpenAI-compatible, `gen.pollinations.ai/v1`) and enables `opencode-pollinations-plugin` in `opencode.json`, so Polli login serves both the chat provider and the plugin's media, usage, and quest tools — no second login. Restart OpenCode to refresh the model list. Add `--no-mcp` to skip the plugin.

## Pi

```bash
polli harness pi on
polli harness pi status
polli harness pi off
```

Pi picks up changes on its next session. If `pi` is missing, the official install command is printed (`npm install -g --ignore-scripts @earendil-works/pi-coding-agent`).

## Prime Agent

```bash
polli harness prime on
polli harness prime status
polli harness prime off
```

Only the agent's config files are merged; memories, sessions, skills, and unrelated configuration are never touched. If `~/.prime` is missing, the official install command is printed (`curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh`).

## OpenClaw

```bash
polli harness openclaw on
polli harness openclaw status
polli harness openclaw off
```

The adapter brings the [existing Pollinations setup](./apps/openclaw/README.md) into the shared workflow: `models.providers.pollinations`, `models.mode = "merge"`, a primary model, and the managed Polli skill. Run `openclaw gateway restart` after `on`. If `openclaw` is missing, the official install command is printed (`curl -fsSL https://openclaw.ai/install.sh | bash`).
