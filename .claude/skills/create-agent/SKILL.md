---
name: create-agent
description: "Create and register a no-code prompt agent on Pollinations — a system prompt over a base model, with optional built-in tools and MCP servers, deployed and billed by the platform. Use when asked to build, deploy, or register a Pollinations agent, bee, or my-model of kind agent."
allowed-tools: Bash(polli *)
---

# Create a Pollinations agent

A **prompt agent** is the simplest agent on Pollinations: a system prompt over a
base model, plus optional tools. You write no code — you declare a config and the
platform deploys and runs a template worker for you, billing callers your declared
prices. This is one of three registration modes for `my-models`:

| Mode | You provide | Platform does |
|---|---|---|
| **prompt agent** | `{ systemPrompt, baseModel, tools?, mcpServers? }` | Deploys a managed worker running a tool-calling loop on your key |
| **source** | a single-file worker | Deploys your worker |
| **baseUrl** | a URL + bearer token you host | Proxies to your endpoint |

Use a prompt agent when you want an agent without hosting anything. Use `source`
or `baseUrl` when you need custom code (see the `polli` skill).

## Requirements

- An invite-only account with community endpoints enabled (`communityEndpointsAllowed: true`).
- An API key with the `account:keys` permission, or an authenticated dashboard session.
- `polli` logged in: `polli auth login` (or `printf '%s' "$KEY" | polli auth login --with-token`).

## The config

Write a JSON file with the agent's config:

```json
{
  "systemPrompt": "You are a terse SQL tutor. Answer in at most three sentences.",
  "baseModel": "openai",
  "tools": ["web_search", "image"],
  "mcpServers": [
    { "name": "docs", "url": "https://mcp.example.com/rpc", "auth": "optional-bearer" }
  ]
}
```

Fields:

- **systemPrompt** (required) — the agent's instructions. Prepended to every conversation.
- **baseModel** (required) — the Pollinations model the loop calls. It **must support
  tool-calling** if you declare any `tools` or `mcpServers`. Check `polli models --type text`;
  `openai` is a safe tool-capable default. A prompt-only agent (no tools) works with any text model.
- **tools** (optional) — built-in tools the platform runs on your key. Supported:
  - `web_search` — searches the web and returns relevant facts.
  - `image` — generates an image from a prompt and returns its URL.
- **mcpServers** (optional) — MCP servers **you host**; the agent calls them over HTTP
  (Streamable-HTTP JSON-RPC). Each: `name` (lowercase, namespaces its tools as
  `mcp__<name>__<tool>`), `url`, optional `auth` (sent as a bearer token). The code
  runs on your infra — the platform is just a client.

## Register it

```bash
polli my-models create \
  --name sql-tutor \
  --prompt-agent ./agent.json \
  --completion-text-price 0.1 \
  --tool-price web_search=0.002 \
  --tool-price mcp_call=0.01
```

- `--name` — the model id becomes `<your-github>/<name>`.
- Price flags set what **callers** pay you. Per-token: `--prompt-text-price`,
  `--completion-text-price`, etc. Per tool call: `--tool-price <name>=<pollen>`.
  Built-in tools bill under their own name (`web_search`, `image`); every MCP call
  bills under `mcp_call`. You keep 75% of what callers pay, minus the platform's
  internal costs for the tools' own model/image calls.
- No `--bearer-token` and no `--base-url`/`--source` — a prompt agent manages its own.
  The endpoint's `kind` defaults to `agent`.

The response includes the model id. It becomes callable through the gateway within
~60 seconds (registry cache).

## Test a billed call

Call it like any model, as a **different** user (or with a different key) so billing runs:

```bash
polli --key "$CALLER_KEY" gen text "How do I find duplicate rows?" --model <your-github>/sql-tutor
```

Or via the OpenAI-compatible endpoint:

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $CALLER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"<your-github>/sql-tutor","messages":[{"role":"user","content":"find duplicate rows"}]}'
```

The response `usage` includes `tool_call_counts` (e.g. `{"web_search": 1}`) — that's
what your `--tool-price` fees bill against.

## Manage

```bash
polli my-models list                    # your agents and models
polli my-models delete <id>             # retires the worker and revokes its minted key
```

To change a prompt agent's config, delete and recreate it (config edits redeploy the
whole template). Price and metadata updates work in place via `polli my-models update <id>`.

## How it works (for debugging)

- The platform deploys a fixed template worker with your config injected as secret
  bindings, and mints a dedicated `sk_` key for the agent's internal calls. That key
  is never returned and is revoked when you delete the agent.
- Each request runs a bounded tool-calling loop: call the base model with your tools →
  if it emits tool calls, run them (built-in tools hit Pollinations; MCP tools hit your
  server) → feed results back → repeat, up to a fixed step ceiling → return the answer.
- If a call errors (bad base model, unreachable MCP server), the agent returns a 502
  with the upstream error — check the message and your config.
