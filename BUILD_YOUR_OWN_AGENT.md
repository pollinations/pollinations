# Publish an Agent

Publishing an agent creates a reusable text model that Pollinations runs for you. A prompt agent combines instructions, a base model, and optional MCP tools. A code agent deploys one self-contained `agent.ts` file from a public GitHub repository.

This is different from hosting your own OpenAI-compatible model endpoint. It is also different from [connecting user wallets](./BRING_YOUR_OWN_POLLEN.md), which lets an app ask its users to pay for their own generations.

## Create an agent in the dashboard

1. Open [My Models](https://enter.pollinations.ai/my-models).
2. Add an agent and choose **Prompt agent** or **Code agent**.
3. Configure a prompt and base model, or enter a public GitHub repository.
4. Save it. The dashboard creates the agent configuration and registers its callable model name.

A linked GitHub username is required to create an agent. Private agents are visible and callable only by their owner. Public listings require [community publisher access](https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml).

## Prompt agent configuration

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

## Code agent configuration

A code agent uses a public GitHub repository as its source of truth. Put one self-contained `agent.ts` at the repository root. Pollinations removes TypeScript syntax when deploying it; type errors do not block deployment, and plain JavaScript is valid in the same file. The repository name becomes the model ID and title, and its description becomes the catalog description. Repository visibility and agent visibility are independent: a private agent is owner-only even though its source repository is public.

The runtime bundles the actual Vercel AI SDK: `ai` version `7.0.66` and `@ai-sdk/openai-compatible` version `3.0.30`. Import their standard exports directly; repository `package.json` files and arbitrary npm dependencies are not installed.

```ts
import { stepCountIs } from "ai";

export default async function ({ model, respond, mcp }) {
    return respond({
        model: model("openai-fast"),
        instructions: "Answer the user, using tools when needed.",
        tools: await mcp.tools("pollinations"),
        stopWhen: stepCountIs(4),
    });
}
```

`model(id)` creates an SDK language model already connected to Pollinations; select IDs from [the model catalog](https://gen.pollinations.ai/v1/models). `respond(config)` runs the SDK tool loop and returns Responses JSON or SSE, including tool results and usage. It accepts SDK agent settings such as `instructions`, `tools`, and `stopWhen`, defaults to eight steps, and does not retry model requests. `mcp.tools(server)` provides executable SDK tools, limited to sixteen calls per request.

The callback also receives `request`, `pollinations(path, init)`, `mcp.listTools(server)`, and `mcp(server, tool, arguments)` for direct request and tool handling. It must return a `Response`; ordinary Worker APIs, including timers and streams, remain available. Platform model and MCP helpers use the caller's Pollen and permissions without exposing a reusable API key. `respond` does not emit the Vercel UI protocol or introduce a separate endpoint.

Example `code-agent.json`:

```json
{
  "type": "code_agent",
  "repository": "https://github.com/your-name/your-agent"
}
```

Create it with `npx @pollinations/cli agents create --config code-agent.json`. Add `--visibility public` to publish after your account has community publisher access. The API stores the GitHub-derived listing fields, repository, and deployed commit SHA—not the source code. The repository binding and model ID are fixed after creation; syncing refreshes the code, title, and description.

To deploy the newest default-branch revision after a push, add this step to a GitHub Action (replace `AGENT_ID`):

```yaml
- run: curl --fail --retry 2 --retry-delay 30 -X POST https://gen.pollinations.ai/account/agents/AGENT_ID/sync
```

The sync route needs no secret and cannot change which repository is deployed. It redeploys the current commit with the latest bundled runtime even when the source is unchanged, and is limited to once every 30 seconds.

## Create with the CLI

Create a prompt agent and its callable model listing in one command:

```bash
npx @pollinations/cli agents create \
  --config agent.json \
  --name research-assistant \
  --title "Research Assistant"
```

The callable model ID is `<your-github-username>/research-assistant`. Code agents derive their name, title, and description from GitHub; these cannot be overridden through either management API. An empty `description` is accepted and ignored. Add `--visibility public` to publish after your account has community publisher access. Managed agents are always text-only and free: they cannot set prices, fallbacks, or a per-user request limit.

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

Managed agents also expose the stateless Responses API:

```bash
curl https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-github-username/research-assistant",
    "input": "Summarize this topic.",
    "store": false
  }'
```

Responses requests run the same configured prompt and MCP tools as Chat Completions. They do not store response state, and caller-supplied tools are not added to a managed agent. Streaming emits Responses API events, a terminal response event containing usage, and one `data: [DONE]` marker.

The agent listing itself has no owner-set price. The caller still pays for the selected base model and MCP usage at the rates shown in the catalog. The catalog presents the base model's pricing and capabilities, plus the capabilities enabled by the agent's tools.

## Manage the lifecycle

```bash
npx @pollinations/cli agents list
npx @pollinations/cli agents get <agent-id>
npx @pollinations/cli agents update <agent-id> --config agent.json
npx @pollinations/cli agents sync <agent-id>
npx @pollinations/cli agents delete <agent-id>
```

Deleting an agent also deletes its model listing. Prompt-agent updates can change its runtime configuration and listing. Code-agent updates can change visibility and safety policy; `sync` deploys new code and refreshes GitHub metadata.

The Account API exposes the same operations under `/account/agents`. API keys need the `account:keys` permission. See the [Community Agents API reference](https://gen.pollinations.ai/docs#tag/community-agents) for request and response schemas.
