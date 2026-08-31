# Coding Harnesses

Use `polli harness` to connect a supported coding harness to Pollinations. It handles Polli login, a dedicated API key, model setup, and any Pollinations capabilities supported by that harness.

> **Available now:** DeepSeek Harness and OpenCode. Pi, Prime Agent, and OpenClaw are coming soon.

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
| [OpenCode](https://opencode.ai) (`opencode`) | **Available now** — `polli harness opencode on` | Uses the existing [Pollinations OpenCode plugin](https://github.com/fkom13/opencode-pollinations-plugin) for models, media, usage, and quests. Uses `openai` by default. |
| [Pi](https://github.com/earendil-works/pi) | Coming soon | Will use its native provider support and the Polli skill; Pi does not include built-in MCP support. |
| [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent) | Coming soon | Will add Pollinations while preserving the agent's memories, sessions, and skills. |
| [OpenClaw](https://github.com/openclaw/openclaw) | Coming soon | Will bring the [existing Pollinations setup](./apps/openclaw/README.md) into the shared `polli harness` workflow. |

## DeepSeek Harness

```bash
npx @pollinations/cli harness dsh on
polli harness dsh status
polli harness dsh off
```

Choose another default model with `--model <id>`. Add `--no-mcp` if you do not want the hosted Pollinations media tools.

## OpenCode

```bash
npx @pollinations/cli harness opencode on
polli harness opencode status
polli harness opencode off
```

If OpenCode is not installed, you will be offered the official installer. Choose another default model with `--model <id>`.
