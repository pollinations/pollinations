# Coding Harnesses

Coding harnesses — agentic coding tools such as DeepSeek Harness, OpenCode, Pi, or OpenClaw — can run with Pollinations. `polli harness` uses the integration each harness supports: a direct provider configuration or a dedicated plugin.

## Connect a harness

```bash
npx @pollinations/cli harness dsh on
```

For DeepSeek Harness, `on`:

1. Logs you in with the browser device flow if `polli` has no stored key (`polli auth login`).
2. Mints a secret key named `polli-harness-dsh`. A still-valid key already in the DSH config is reused.
3. Loads `GET /v1/models` and registers every first-party text model with tool calling.
4. Saves a private snapshot before changing any DSH files.
5. Enables the hosted Pollinations MCP so DSH can generate images, audio, and video as native tools.
6. Installs the packaged `polli` skill globally for DSH.

```bash
polli harness --help                  # supported harnesses
polli harness dsh on --model kimi     # pick the default model (default: deepseek)
polli harness dsh on --no-mcp         # configure the provider and skill without MCP tools
polli harness dsh on --no-browser     # print the login URL instead of opening it
polli harness dsh status
polli harness dsh off                 # remove Pollinations again
```

`off` restores the backed-up files byte-for-byte when they are unchanged since `on` (`outcome: restored`). If you edited them in between, or the harness home moved, only the Pollinations entries are removed (`stripped`). A harness that was never on reports `unchanged`.

The account key stored by `polli auth login` is never written into a harness; each harness gets its own child key, so revoking it (`polli keys revoke <id>`) does not affect anything else.

## Supported harnesses

| Harness | Command | Files | Notes |
| --- | --- | --- | --- |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) | `polli harness dsh on` | `$DSH_HOME/settings.yaml`, `.env`, `cordis.patch.yml`, and `skills/polli/SKILL.md` (default `~/.dsh`) | Adds the Pollinations provider, hosted Pollinations MCP, and Polli CLI skill globally. One dedicated key in `.env` authenticates both the provider and MCP. Changes apply on the next request. |
| [Pi](https://github.com/earendil-works/pi) (`pi`) | `polli harness pi on` | `~/.pi/agent/models.json`, `auth.json`, `settings.json`, and `skills/polli/SKILL.md` | Adds the Pollinations provider via Pi's custom model config, stores a dedicated key in `auth.json`, sets the startup default model in `settings.json`, and installs the Polli CLI skill. Changes apply on the next Pi session. |
| [OpenClaw](https://github.com/openclaw/openclaw) | `apps/openclaw/setup-pollinations.sh` | `~/.openclaw/openclaw.json` | Shell script in this repo, not yet a `polli harness` profile. See [apps/openclaw](./apps/openclaw/README.md). |
| [OpenCode](https://opencode.ai) | `opencode-pollinations-plugin` | `opencode.json`, `auth.json` | Community plugin that registers a Pollinations provider. A future adapter can install OpenCode when missing, enable the plugin, and store a dedicated child key in OpenCode's native auth file. |

Any harness that accepts an OpenAI-compatible chat completions provider works with `base_url = https://gen.pollinations.ai/v1` and `Authorization: Bearer sk_…` set by hand. Codex CLI (needs `/v1/responses`) and Claude Code (needs `/v1/messages`) are not supported until those endpoints exist.
