# Publish an Agent

Publishing an agent creates a managed agent that turns a system prompt, a Pollinations base model, and optional Pollinations tools into a reusable text model. Pollinations runs the agent for you, so you do not need to host an agent server.

This is different from hosting your own OpenAI-compatible model endpoint. It is also different from [connecting user wallets](./BRING_YOUR_OWN_POLLEN.md), which lets an app ask its users to pay for their own generations.

## Create an agent in the dashboard

1. Open [My Models](https://enter.pollinations.ai/my-models).
2. Add an agent and choose its name, title, and visibility.
3. For a private agent, enter the system prompt, base model, and optional Pollinations tools. For a public agent, enter a public GitHub repository and manifest path.
4. Save it. Pollinations validates the configuration and registers its callable model name.

A linked GitHub username is required to create an agent. Private agents are visible and callable only by their owner. Publishing an agent for everyone requires [community publisher access](https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml).

## Agent configuration

An agent combines catalog fields with its runtime configuration:

| Field | Required | Description |
| --- | --- | --- |
| `name` | Yes | Callable model name used in `<github-username>/<name>`. |
| `title` | Yes | Display title shown in the model catalog. |
| `description` | No | Catalog description. |
| `visibility` | No | `private` by default, or `public` with publisher access. |
| `systemPrompt` | Private/manifest | Instructions for the agent, from 1 to 8,000 characters. |
| `baseModel` | Private/manifest | A text model ID from [`GET /v1/models`](https://gen.pollinations.ai/v1/models). |
| `mcpServers` | No | `[]` or `["pollinations"]` to enable the built-in Pollinations tools. |
| `source.repositoryUrl` | Public | Public repository owned by the account's linked GitHub identity. |
| `source.manifestPath` | Public | Relative JSON manifest path. Defaults to `pollinations-agent.json`. |

Private CLI configuration and public GitHub manifests use the same strict JSON schema:

```json
{
  "systemPrompt": "You are a concise research assistant. Cite the sources you use.",
  "baseModel": "openai",
  "mcpServers": ["pollinations"]
}
```

Public agents run the last valid snapshot stored by Pollinations, not a live GitHub response. Each successful import records the exact commit SHA. Invalid repository updates leave the previous snapshot active.

## Create with the CLI

Create the agent and its callable model listing in one command:

```bash
npx @pollinations/cli agents create \
  --config agent.json \
  --name research-assistant \
  --title "Research Assistant"
```

To publish the same manifest from GitHub:

```bash
npx @pollinations/cli agents create \
  --repo https://github.com/your-name/research-agent \
  --manifest pollinations-agent.json \
  --name research-assistant \
  --title "Research Assistant" \
  --visibility public
```

The callable model ID is `<your-github-username>/research-assistant`. Public publishing requires community publisher access. Managed agents are always text-only and free: they cannot set prices, fallbacks, or a per-user request limit.

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

The agent listing itself has no owner-set price. The caller still pays for the selected base model and for any generations performed by tools. The catalog presents the base model's pricing and capabilities, plus the capabilities enabled by the agent's tools.

## Manage the lifecycle

```bash
npx @pollinations/cli agents list
npx @pollinations/cli agents get <agent-id>
npx @pollinations/cli agents update <agent-id> --config agent.json
npx @pollinations/cli agents sync <agent-id>
npx @pollinations/cli agents delete <agent-id>
```

Deleting an agent also deletes its model listing. Private inline agents can replace their prompt, base model, and tools. Public agents import those fields from GitHub; use `sync` after changing the repository. Listing fields can be updated through the dashboard or API.

The Account API exposes the same operations under `/account/agents`. API keys need the `account:keys` permission. See the [Community Agents API reference](https://gen.pollinations.ai/docs#tag/community-agents) for request and response schemas.
