# `polli mcp` — connect Pollinations tools to your coding agents

[gen.pollinations.ai](https://gen.pollinations.ai) exposes tool servers over
[Model Context Protocol](https://modelcontextprotocol.io) — image/video/audio
generation, web search (Exa), a persistent sandboxed computer, FFmpeg, and
hundreds of app integrations (Composio). `polli mcp` wires any of them into
your coding agents with one command.

```bash
polli mcp list                    # browse available servers (no auth needed)
polli mcp install                 # install the default "pollinations" server
polli mcp install computer        # pick a specific server from the catalog
polli mcp install --client codex,cursor
polli mcp status                  # which agents have it installed
polli mcp remove                  # uninstall (minted keys are kept)
```

Run `polli mcp install --help` for the exact flag list. Requires
`polli auth login` (or `--key <key>`).

## How it works

1. `polli mcp list` fetches the live catalog from `GET /mcp` on
   `gen.pollinations.ai`.
2. For every target client, `polli mcp install` mints a **dedicated API key**
   named `polli-harness-mcp-<client>` (reused across reinstalls, revalidated
   each time) — so each client can be audited or revoked independently via
   `polli keys`.
3. The server is registered as `pollinations-<server-id>` (e.g.
   `pollinations-computer`).

### Auth modes

- Clients whose config references a secret by **env var name** (Codex
  `bearer_token_env_var`) get `POLLINATIONS_MCP_API_KEY` written into their
  config and the literal key provisioned into `~/.codex/.env` — the key never
  lands in the config file. If you already set that env var yourself, it is
  left untouched.
- All other clients get the literal key in an `Authorization: Bearer …`
  header inside their config.

### Supported clients

| Client | How it installs | Config |
|---|---|---|
| Claude Code | `claude mcp add` (user scope) | `~/.claude.json` |
| OpenAI Codex CLI | `codex mcp add` + `~/.codex/.env` | `~/.codex/config.toml` |
| Gemini CLI | `gemini mcp add` (user scope) | `~/.gemini/settings.json` |
| Cursor | JSON edit | `~/.cursor/mcp.json` |
| Windsurf | JSON edit | `~/.codeium/windsurf/mcp_config.json` |
| Cline | JSON edit | VS Code `globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` |
| Kiro | JSON edit | `~/.kiro/settings/mcp.json` |
| Zed | JSON edit | `settings.json` → `context_servers` |
| Warp | JSON edit | `~/.warp/mcp_config.json` |
| OpenCode | JSON edit | `~/.config/opencode/opencode.json` → `mcp` |
| VS Code / Copilot | JSON edit | User `mcp.json` → `servers` |
| Claude Desktop | JSON edit | `claude_desktop_config.json` |

CLI-based clients are installed only when their binary is on `PATH`. By
default file-based clients are only edited when the app shows signs of use
(config or data directory exists); pass `--all` to install everywhere anyway.

## Safety properties

- **Idempotent** — re-running `install` never duplicates entries.
- **No clobbering** — an existing same-named entry pointing at a different
  URL is left untouched (reported as skipped).
- **No silent installs** — the command never installs packages or writes keys
  outside the client's own config paths listed above.
- **Keys are never deleted by `remove`** — revoke explicitly via `polli keys`
  if desired.

## Notes

- Restart the client(s) after installing so they pick up the new server.
- On Windows, `.cmd` shims (npm-installed CLIs) are invoked through `cmd.exe`
  automatically.
- JSON5 is used to read configs, so clients that allow comments/trailing
  commas in their JSON (e.g. VS Code) parse fine. Rewrites are serialized as
  plain JSON — local comments in hand-edited configs are not preserved.
