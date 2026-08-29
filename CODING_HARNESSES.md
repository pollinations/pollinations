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
4. Saves a private snapshot before writing the provider, default model, and key.

```bash
polli harness --help                  # supported harnesses
polli harness dsh on --model kimi     # pick the default model (default: deepseek)
polli harness dsh on --no-browser     # print the login URL instead of opening it
polli harness dsh status
polli harness dsh off                 # remove Pollinations again
```

`off` restores the backed-up files byte-for-byte when they are unchanged since `on` (`outcome: restored`). If you edited them in between, or the harness home moved, only the Pollinations entries are removed (`stripped`). A harness that was never on reports `unchanged`.

The account key stored by `polli auth login` is never written into a harness; each harness gets its own child key, so revoking it (`polli keys revoke <id>`) does not affect anything else.

## Supported harnesses

| Harness | Command | Files | Notes |
| --- | --- | --- | --- |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) | `polli harness dsh on` | `$DSH_HOME/settings.yaml`, `$DSH_HOME/.credentials.yaml` (default `~/.dsh`) | Adds provider `pollinations` under `llm-pi-ai.providers` and sets `agent-default-model`. The key goes into the `refs` map of the credentials document. Changes apply on the next request. |
| [OpenClaw](https://github.com/openclaw/openclaw) | `apps/openclaw/setup-pollinations.sh` | `~/.openclaw/openclaw.json` | Shell script in this repo, not yet a `polli harness` profile. See [apps/openclaw](./apps/openclaw/README.md). |
| [OpenCode](https://opencode.ai) | `opencode-pollinations-plugin` | `opencode.json`, `auth.json` | Community plugin that registers a Pollinations provider. A future adapter can install OpenCode when missing, enable the plugin, and store a dedicated child key in OpenCode's native auth file. |

Any harness that accepts an OpenAI-compatible chat completions provider works with `base_url = https://gen.pollinations.ai/v1` and `Authorization: Bearer sk_…` set by hand. Codex CLI (needs `/v1/responses`) and Claude Code (needs `/v1/messages`) are not supported until those endpoints exist.

## Add a harness

New harness adapters are welcome and are usually posted as [quests](https://github.com/pollinations/pollinations/issues?q=is%3Aissue+label%3APOLLEN-QUEST+harness). One adapter is one file:

1. Add `packages/polli-cli/src/harnesses/<id>.ts` exporting a `HarnessAdapter` (`packages/polli-cli/src/harnesses/types.ts`) with `on`, `off`, and `status` methods.
   - Keep installation, authentication, and configuration inside the adapter.
   - Direct-provider harnesses can reuse the key, model, and snapshot helpers used by `dsh.ts`.
   - Plugin-based harnesses can run their official installer directly and reuse the key helper when the plugin accepts a Pollinations key.
   - Preserve unrelated settings. Use `applyWithSnapshot` for reversible file changes, or remove only entries the adapter owns.
2. Register it in `packages/polli-cli/src/harnesses/index.ts`.
3. Add `<id>.test.ts` next to it. Tests run against a temporary home (`ctx.home`) and never touch the real config — see `dsh.test.ts`.
4. Add a row to the table above.

Rules: resolve the harness home from its own env var (`DSH_HOME`, `OPENCODE_CONFIG_DIR`, …) before falling back to `ctx.home`; write secrets with mode `0600`; never print the key; use `writeTextAtomic` from `harnesses/fs.ts` for every write.
