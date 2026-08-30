# Coding Harnesses

Use `polli harness` to connect a supported coding harness to Pollinations. It handles Polli login, a dedicated API key, model setup, and any Pollinations capabilities supported by that harness.

> **Available now:** DeepSeek Harness and Prime Agent are integrated `polli harness` profiles. OpenCode, Pi, and OpenClaw are coming soon.

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
| [OpenCode](https://opencode.ai) | Coming soon | Will use the existing [Pollinations OpenCode plugin](https://github.com/fkom13/opencode-pollinations-plugin) for models, media tools, usage, and quests. |
| [Pi](https://github.com/earendil-works/pi) | Coming soon | Will use its native provider support and the Polli skill; Pi does not include built-in MCP support. |
| [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent) (`prime`) | **Available now** — `polli harness prime on` | Adds the Pollinations OpenAI-compatible provider, live tool-capable text models, and Polli skill while preserving sessions and memories. |
| [OpenClaw](https://github.com/openclaw/openclaw) | Coming soon | Will bring the [existing Pollinations setup](./apps/openclaw/README.md) into the shared `polli harness` workflow. |

## DeepSeek Harness

```bash
npx @pollinations/cli harness dsh on
polli harness dsh status
polli harness dsh off
```

Choose another default model with `--model <id>`. Add `--no-mcp` if you do not want the hosted Pollinations media tools.

## Prime Agent

```bash
npx @pollinations/cli harness prime on
polli harness prime on --model kimi
polli harness prime status
polli harness prime off
```

Prime Agent reads global configuration from `~/.prime/agent` by default. Set
`PRIME_AGENT_CODING_AGENT_DIR` to use another official config directory. The
adapter writes `models.json`, `settings.json`, and `skills/polli/SKILL.md`,
and stores a private reversible snapshot under `~/.pollinations/harnesses/`.
It discovers live Pollinations text models that support tools, sets both
`defaultProvider` and `defaultModel`, and reuses or creates the dedicated
`polli-harness-prime` key without printing it. If Prime Agent is missing, `on`
prints the official install command:

```bash
curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh
```

On Windows, use the official Windows installer instructions at
`https://app.primeintellect.ai/prime-agent/install`; do not pipe the Unix
shell installer into PowerShell or Command Prompt.

`off` restores the snapshot byte-for-byte when untouched. If a user edits the
files after `on`, it surgically removes only Pollinations-owned provider,
default, and skill entries; Prime sessions, memories, and unrelated settings
remain in place.
