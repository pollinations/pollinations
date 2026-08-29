# Coding Harnesses

Coding harnesses — agentic coding tools such as DeepSeek Harness, OpenCode, Pi, or OpenClaw — can run on Pollinations models. `polli harness` edits the harness's own config so it calls `https://gen.pollinations.ai/v1` with a dedicated API key. No proxy, no fork, and the change is reversible.

## Connect a harness

```bash
npx @pollinations/cli harness dsh on
```

What `on` does:

1. Logs you in with the browser device flow if `polli` has no stored key (`polli auth login`).
2. Mints a secret key named `polli-harness-<id>` for the harness. A key already in the harness config is reused if it is still valid.
3. Loads `GET /v1/models` and registers every first-party text model with tool calling as a provider.
4. Backs up the files it is about to change to `~/.pollinations/harnesses/<id>.json`, then writes the provider, the default model, and the key.

```bash
polli harness list                    # supported harnesses and whether they are on
polli harness dsh on --model kimi     # pick the default model (default: deepseek)
polli harness dsh on --no-browser     # print the login URL instead of opening it
polli harness dsh status
polli harness dsh off                 # remove Pollinations again
```

`off` restores the backed-up files byte-for-byte when they are unchanged since `on`. If you edited them in between, only the Pollinations entries are removed.

The account key stored by `polli auth login` is never written into a harness; each harness gets its own child key, so revoking it (`polli keys revoke <id>`) does not affect anything else.

## Supported harnesses

| Harness | Command | Files | Notes |
| --- | --- | --- | --- |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) | `polli harness dsh on` | `$DSH_HOME/settings.yaml`, `$DSH_HOME/.credentials.yaml` (default `~/.dsh`) | Adds provider `pollinations` under `llm-pi-ai.providers` and sets `agent-default-model`. The key goes into the `refs` map of the credentials document. Restart `dsh` afterwards. |
| [OpenClaw](https://github.com/openclaw/openclaw) | `apps/openclaw/setup-pollinations.sh` | `~/.openclaw/openclaw.json` | Shell script in this repo, not yet a `polli harness` profile. See [apps/openclaw](./apps/openclaw/README.md). |
| [OpenCode](https://opencode.ai) | `opencode-pollinations-plugin` | `opencode.json` | Community plugin that registers a Pollinations provider. Not yet a `polli harness` profile. |

Any harness that accepts an OpenAI-compatible chat completions provider works with `base_url = https://gen.pollinations.ai/v1` and `Authorization: Bearer sk_…` set by hand. Codex CLI (needs `/v1/responses`) and Claude Code (needs `/v1/messages`) are not supported until those endpoints exist.

## Add a harness

New harness profiles are welcome and are usually posted as [quests](https://github.com/pollinations/pollinations/issues?q=is%3Aissue+label%3APOLLEN-QUEST+harness). One profile is one file:

1. Add `packages/polli-cli/src/harnesses/<id>.ts` exporting a `HarnessProfile` (`packages/polli-cli/src/harnesses/types.ts`):
   - `files(ctx)` — every config file `enable` touches. The engine backs these up.
   - `readKey(ctx)` — the Pollinations key already in the config, so reruns reuse it.
   - `enable(ctx, { apiKey, model, models })` — write the provider, default model, and key. Edit in place; keep the user's other entries and comments.
   - `disable(ctx)` — remove only what `enable` added.
   - `status(ctx)` — whether Pollinations is the active provider and which model.
2. Register it in `packages/polli-cli/src/harnesses/index.ts`.
3. Add `<id>.test.ts` next to it. Tests run against a temporary home (`ctx.home`) and never touch the real config — see `dsh.test.ts`.
4. Add a row to the table above.

Rules: resolve the harness home from its own env var (`DSH_HOME`, `OPENCODE_CONFIG_DIR`, …) before falling back to `ctx.home`; write secrets with mode `0600`; never print the key; use `writeTextAtomic` from `harnesses/fs.ts` for every write.
