# Publish an Agent

Publishing an agent creates a managed agent that turns a system prompt, a Pollinations base model, and optional MCP tools into a reusable text model. Pollinations runs the agent for you, so you do not need to host an agent server.

This is different from hosting your own OpenAI-compatible model endpoint. It is also different from [connecting user wallets](./BRING_YOUR_OWN_POLLEN.md), which lets an app ask its users to pay for their own generations.

## Create an agent in the dashboard

1. Open [My Models](https://enter.pollinations.ai/my-models).
2. Add an agent and choose its name, title, visibility, system prompt, and base model.
3. Optionally enable MCP servers for Pollinations tools, web search, media processing, or connected apps.
4. Save it. The dashboard creates the agent configuration and registers its callable model name.

A linked GitHub username is required to create an agent. Private agents are visible and callable only by their owner. Publishing an agent for everyone requires [community publisher access](https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml).

## Agent configuration

An agent combines catalog fields with its runtime configuration:

| Field | Required | Description |
| --- | --- | --- |
| `name` | Yes | Callable model name used in `<github-username>/<name>`. |
| `title` | Yes | Display title shown in the model catalog. |
| `description` | No | Catalog description. |
| `visibility` | No | `private` by default, or `public` with publisher access. |
| `systemPrompt` | Yes | Instructions for the agent, from 1 to 8,000 characters. |
| `baseModel` | Yes | A text model ID from [`GET /v1/models`](https://gen.pollinations.ai/v1/models). |
| `mcpServers` | No | Server IDs from [`GET /mcp`](https://gen.pollinations.ai/mcp), such as `pollinations` or `composio`. |

Example `agent.json`:

```json
{
  "systemPrompt": "You are a concise research assistant. Cite the sources you use.",
  "baseModel": "openai",
  "mcpServers": ["pollinations"]
}
```

Updates replace the runtime configuration, so include `systemPrompt` and `baseModel`; include `mcpServers` if tools should remain enabled. You can also change the name, title, description, or visibility.

The `composio` server uses each caller's connections from **Account → MCP Connectors**. Public agents never receive or use the agent owner's app credentials.

## Create with the CLI

Create the agent and its callable model listing in one command:

```bash
npx @pollinations/cli agents create \
  --config agent.json \
  --name research-assistant \
  --title "Research Assistant"
```

The callable model ID is `<your-github-username>/research-assistant`. Add `--visibility public` to publish it after your account has community publisher access. Managed agents are always text-only and free: they cannot set prices, fallbacks, or a per-user request limit.

## Call an agent

Once registered, call the agent exactly like any other text model:

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-github-username/research-assistant",
    "messages": [{"role": "user", "content": "Summarize this topic."}]
  }'
```

The agent listing itself has no owner-set price. The caller still pays for the selected base model and MCP usage at the rates shown in the catalog. The catalog presents the base model's pricing and capabilities, plus the capabilities enabled by the agent's tools.

## Manage the lifecycle

```bash
npx @pollinations/cli agents list
npx @pollinations/cli agents get <agent-id>
npx @pollinations/cli agents update <agent-id> --config agent.json
npx @pollinations/cli agents delete <agent-id>
```

Deleting an agent also deletes its model listing. Updating an agent can change its prompt, base model, tools, name, title, description, or visibility.

The Account API exposes the same operations under `/account/agents`. API keys need the `account:keys` permission. See the [Community Agents API reference](https://gen.pollinations.ai/docs#tag/community-agents) for request and response schemas.
