# Coding Harnesses

Use `polli harness` to connect a supported coding harness to Pollinations. It handles Polli login, a dedicated API key, model setup, and any Pollinations capabilities supported by that harness.

> **Available now:** DeepSeek Harness and Pi are integrated `polli harness` profiles. OpenCode, Prime Agent, and OpenClaw are coming soon.

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

If Polli is not installed yet, run the first setup through `npx @pollinations/cli`. Login uses the browser device flow by default; the account key used to mint a harness key needs `account:keys`. Each harness receives its own uniquely named `polli-harness-<id>-*` API key instead of reusing the account key stored by `polli auth login`.

## Harnesses

| Harness | Status | What is unique |
| --- | --- | --- |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) | **Available now** — `polli harness dsh on` | Adds the Pollinations provider, hosted Pollinations MCP, and Polli skill. Uses `deepseek` by default. |
| [OpenCode](https://opencode.ai) | Coming soon | Will use the existing [Pollinations OpenCode plugin](https://github.com/fkom13/opencode-pollinations-plugin) for models, media tools, usage, and quests. |
| [Pi](https://github.com/earendil-works/pi) (`pi`) | **Available now** — `polli harness pi on` | Uses Pi's native OpenAI-compatible provider config and Polli skill. Pi does not include built-in MCP support. |
| [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent) | Coming soon | Will add Pollinations while preserving the agent's memories, sessions, and skills. |
| [OpenClaw](https://github.com/openclaw/openclaw) | Coming soon | Will bring the [existing Pollinations setup](./apps/openclaw/README.md) into the shared `polli harness` workflow. |

## DeepSeek Harness

```bash
npx @pollinations/cli harness dsh on
polli harness dsh status
polli harness dsh off
```

Choose another default model with `--model <id>`. Add `--no-mcp` if you do not want the hosted Pollinations media tools.

## Pi

```bash
npx @pollinations/cli harness pi on
npx @pollinations/cli harness pi on --model kimi
polli harness pi status
polli harness pi off
```

Pi setup uses the official `~/.pi/agent` directory (or `PI_CODING_AGENT_DIR` when you intentionally use another Pi agent directory). It writes the native `models.json`, `auth.json`, and `settings.json` files: provider/model metadata goes in `models.json`, while the dedicated harness credential goes in `auth.json`. It installs the Polli skill without replacing an existing skill and preserves unrelated providers and settings. Pi has no built-in MCP support, so `--no-mcp` is not needed.

`on` fetches the current tool-capable Pollinations text models. It uses `deepseek` when it is available and otherwise selects a deterministic compatible model; pass `--model <id>` to choose a specific one. `status` checks the provider URL/API, the selected model against the live compatible catalog, the dedicated key, and the Polli skill. `off` restores untouched files byte-for-byte or removes only Pollinations-owned entries after edits.
