# polli CLI — Agent Reference

Thin CLI wrapper around the Pollinations API (`gen.pollinations.ai`).
Auth required for most commands. Run `polli auth login` first.

## Global flags
`--json` JSON output | `--key <key>` override API key

## Commands

### Auth & Account
`polli auth login` — device-flow login
`polli auth logout` — clear credentials
`polli auth status` — show tier, balance, auth state
`polli keys list|info|create|revoke <id>` — manage API keys
`polli usage` — show pollen balance (default)
`polli usage --history` — individual request log (`--limit <n>`)
`polli usage --daily` — daily cost summary

### Generation (`polli gen <cmd>`)
`polli gen text [prompt]` — text generation, streams by default
  opts: `--model` `--system` `--temperature` `--max-tokens` `--top-p` `--frequency-penalty` `--presence-penalty` `--seed` `--json` `--thinking` `--output <path>` `--no-stream`
  stdin: `echo ctx | polli gen text "question"` (stdin becomes context)

`polli gen image <prompt>` — image generation → file
  opts: `--model` `--width` `--height` `--seed` `--enhance` `--negative` `--nologo` `--output <path>`

`polli gen audio <text>` — TTS / text-to-music → file
  opts: `--voice` `--model` `--output <path>`

`polli gen video <prompt>` — video generation → file
  opts: `--model` `--width` `--height` `--duration` `--aspect-ratio` `--audio` `--seed` `--enhance` `--negative` `--image <url>` `--output <path>`

`polli gen chat` — interactive multi-turn chat, streams
  opts: `--model` `--system` `--temperature` `--max-tokens` `--save <path>`
  slash: `/exit` `/clear` `/save <path>`

`polli gen transcribe <file>` — speech-to-text
  opts: `--model` `--language` `--output <path>`

### Discovery
`polli models` — list all models (`--type text|image|audio|video|all`)
`polli stats` — model health & perf (`--type` `--window 5m|60m|24h|7d`)
`polli docs [endpoint]` — print API docs to terminal (`--open` for browser)

### MCP
`polli mcp` — start MCP server (stdio) for AI agent tool use (`--list-tools`)

## Output
Default: `key: value` pairs, tab-separated tables with header row.
`--json`: full JSON to stdout, messages to stderr.

## API mapping
CLI → API: `gen text` → `POST /v1/chat/completions` | `gen image` → `GET /image/:prompt` | `gen audio` → `GET /audio/:text` | `gen video` → `GET /video/:prompt` | `gen transcribe` → `POST /v1/audio/transcriptions` | `models` → `GET /{text,image,audio}/models` | `usage` → `GET /api/account/{balance,usage,usage/daily}` | `stats` → `GET /api/model-stats/` | `docs` → `GET /api/docs/llm.txt`
