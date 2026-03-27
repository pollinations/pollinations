# `polli` CLI — MVP Proposal

A single command-line tool for humans and AI agents to use the entire Pollinations platform.

## Problem

Using Pollinations today requires multiple surfaces — the web dashboard for auth and keys, the SDK for generation, the MCP server for AI assistants, raw API calls for account management, and GitHub issues for app registration. There's no single entry point, and AI agents have no way to self-serve.

## Solution

`polli` — one CLI that covers auth, keys, generation, apps, deployment, and account management. Designed agent-first with structured output, but equally usable by humans. Ships with a built-in Polly MCP skill so any AI agent can auto-discover and learn everything about Pollinations without reading docs.

```
npm install -g @pollinations_ai/cli
npx polli auth login --token <your-key>
npx polli generate image "a parrot writing code"
npx polli apps register --name "My App" --url "https://myapp.com"
```

## Architecture

```
polli (CLI)
  ├── gen.pollinations.ai      ← generation API (all requests auth'd)
  ├── enter.pollinations.ai    ← account, keys, tiers, usage
  ├── polly-mcp                ← Polly agent as MCP skill (see below)
  ├── commander.js             ← CLI framework
  └── ~/.pollinations/         ← local config + credentials (0600)
```

Lives in `apps/polli-cli/` in the monorepo.

### Polly as MCP Skill

The existing Polly bot (`apps/polly`) is a Discord/GitHub AI agent with deep platform knowledge. We converted Polly's capabilities into an MCP server embedded in the CLI so that:

- AI agents (Claude Code, Cursor, OpenClaw, etc.) can auto-discover Pollinations
- Agents get tools: platform knowledge, model listing, generation, account info, web search
- Any agent can ask "how do I use Pollinations?" and get an expert answer
- No need to read docs — Polly knows everything

This is not the existing `@pollinations_ai/mcp` (which only wraps generation endpoints). This is the full Polly knowledge brain, exposed as 7 MCP tools.

## Implemented Commands

### Auth — `polli auth`

| Command | Description |
|---------|-------------|
| `polli auth login --token <key>` | Store API key (pk_ or sk_), verify against enter API |
| `polli auth logout` | Delete stored credentials |
| `polli auth status` | Current user, tier, balance, key info |

### API Keys — `polli keys`

| Command | Description |
|---------|-------------|
| `polli keys list` | Show current key details (type, budget, rate limiting) |
| `polli keys info` | Detailed key info (permissions, model restrictions, expiry) |
| `polli keys create` | Placeholder — requires device flow (coming soon) |
| `polli keys revoke <id>` | Placeholder — requires device flow (coming soon) |

### Generation — `polli generate` (alias: `polli gen`)

| Command | Description |
|---------|-------------|
| `polli gen image <prompt> [--model flux]` | Generate image, save to file or return URL |
| `polli gen text <prompt> [--model openai]` | Generate text to stdout |
| `polli gen audio <text> [--voice nova]` | Text-to-speech, save mp3 |

All generation requires an API key via enter gateway.

### Apps — `polli apps`

| Command | Description |
|---------|-------------|
| `polli apps list [--status review\|approved\|complete]` | List app submissions from GitHub |
| `polli apps register --name <n> --url <u>` | Submit app for review (creates GitHub issue) |
| `polli apps status <issue>` | Check review status of an app submission |

### Deploy — `polli deploy`

| Command | Description |
|---------|-------------|
| `polli deploy run <app>` | Deploy to {app}.pollinations.ai (Cloudflare Pages) |
| `polli deploy status <app>` | Check deployment status |

### Account

| Command | Description |
|---------|-------------|
| `polli usage [--daily] [--limit N]` | Usage history with cost breakdown |
| `polli pollen` | Quick pollen balance check |
| `polli models [--type image\|text]` | List available models with descriptions |
| `polli whoami` | Identity, tier, balance at a glance |

### Polly MCP — `polli mcp`

| Command | Description |
|---------|-------------|
| `polli mcp` | Start Polly as an MCP server (stdio) |
| `polli mcp --list-tools` | Show available MCP tools |

**MCP Tools (7):**
- `pollinations_knowledge` — Full platform docs (architecture, API, models, tiers, pricing)
- `pollinations_list_models` — Real-time model listing with pricing
- `pollinations_generate_text` — Text generation (OpenAI-compatible)
- `pollinations_generate_image` — Image generation with URL return
- `pollinations_account` — Profile, balance, tier, usage
- `pollinations_web_search` — Web search via Perplexity/Gemini
- `pollinations_key_info` — Current API key details

Also exposes knowledge as an MCP resource at `pollinations://knowledge`.

## Agent-First Design

Every command supports global flags for agent/script/CI consumption:

| Flag | Purpose |
|------|---------|
| `--json` | Structured JSON to stdout, human messages to stderr |
| `--quiet` | Bare values only, one per line, zero decoration |
| `--yes` | Skip all interactive confirmations |
| `--key <key>` | Override stored credentials for this invocation |

Example — an AI agent onboarding:

```bash
polli auth login --token sk_abc123
polli pollen --json                    # → {"pollen":0.15}
polli gen image "logo" --output logo.png --quiet  # → logo.png
polli apps register --name "My App" --url "https://my.app" --yes --json
polli mcp                              # Start MCP server for Claude/Cursor
```

## Security

- Credentials stored at `~/.pollinations/credentials.json` with `0600` permissions
- Config directory created with `0700` permissions
- Corrupt credential files handled gracefully (fallback to empty)
- API keys validated on login, errors surfaced clearly
- No referrer hacks — all requests use proper Bearer token auth

## Package Structure

```
apps/polli-cli/
├── package.json          # @pollinations_ai/cli, bin: polli
├── bin/polli.js          # Entry point
├── tsup.config.ts        # Build config (ESM, node20 target)
├── src/
│   ├── index.ts          # Commander setup, 11 commands registered
│   ├── commands/
│   │   ├── auth.ts       # login, logout, status
│   │   ├── whoami.ts     # identity check
│   │   ├── keys.ts       # list, info, create, revoke
│   │   ├── generate.ts   # image, text, audio
│   │   ├── usage.ts      # usage history + pollen balance
│   │   ├── models.ts     # model listing
│   │   ├── apps.ts       # list, register, status
│   │   ├── deploy.ts     # deploy run, deploy status
│   │   └── mcp.ts        # start MCP server
│   ├── mcp/
│   │   ├── server.ts     # McpServer setup (stdio transport)
│   │   ├── tools.ts      # 7 Polly MCP tools
│   │   └── knowledge.ts  # Platform knowledge base
│   ├── lib/
│   │   ├── api.ts        # HTTP client (gen + enter APIs)
│   │   ├── config.ts     # ~/.pollinations/ credentials
│   │   └── output.ts     # json/quiet/table formatters
│   └── tsconfig.json
└── dist/                 # Built output (41KB bundle)
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server for Polly skill |
| `commander` | CLI framework |
| `chalk` | Terminal colors (human mode only) |
| `ora` | Spinners (human mode only) |
| `open` | Browser open for future device flow |
| `zod` | Schema validation for MCP tools |

## Backend Requirements

One new feature needed on `enter.pollinations.ai`:

- **Device authorization endpoints** — `POST /api/auth/device/code` and `POST /api/auth/device/token` for browser-based CLI login. Until then, users authenticate with `--token <key>`.

## What's NOT in MVP

- `polli chat` — interactive Polly conversation in terminal
- `--ui` flag — browser-based interactive mode
- Streaming output for generation commands
- Device flow auth (browser-based login)
- Full Polly tool parity (Discord search, web scraping, code embeddings)

## Open Questions

1. **Package name** — `@pollinations_ai/cli` with `polli` as the binary?
2. **Device flow** — confirms we need the new backend endpoints on enter?
3. **App registration** — keep GitHub-issue-based (requires GITHUB_TOKEN), or add a direct API?
4. **Polly MCP scope** — current 7 tools sufficient, or add code search / doc search?
5. **Monorepo placement** — `apps/polli-cli/` is current location, move to `packages/cli/`?
