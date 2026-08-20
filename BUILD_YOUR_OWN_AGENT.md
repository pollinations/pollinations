# Community Agents

Community agents are managed agents that turn a system prompt, a Pollinations base model, and optional Pollinations tools into a reusable text model. Pollinations runs the agent for you, so you do not need to host an agent server.

This is different from hosting your own OpenAI-compatible model endpoint. It is also different from [Bring Your Own Pollen](./BRING_YOUR_OWN_POLLEN.md), which lets an app ask its users to pay for their own generations.

## Create an agent in the dashboard

1. Open [My Agents & Models](https://enter.pollinations.ai/my-models).
2. Add an agent and choose its name, title, visibility, system prompt, and base model.
3. Optionally enable Pollinations tools so the agent can generate media, call other models, and inspect the model catalog.
4. Save it. The dashboard creates the agent configuration and registers its callable model name.

Private agents are visible and callable only by their owner. Publishing an agent for everyone requires [community publisher access](https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml).

## Agent configuration

An agent has three configuration fields:

| Field | Required | Description |
| --- | --- | --- |
| `systemPrompt` | Yes | Instructions for the agent, from 1 to 8,000 characters. |
| `baseModel` | Yes | A text model ID from [`GET /v1/models`](https://gen.pollinations.ai/v1/models). |
| `mcpServers` | No | `[]` or `["pollinations"]` to enable the built-in Pollinations tools. |

Example `agent.json`:

```json
{
  "systemPrompt": "You are a concise research assistant. Cite the sources you use.",
  "baseModel": "openai",
  "mcpServers": ["pollinations"]
}
```

Updates replace the complete configuration, so include all three fields you want to keep.

## Create and register with the CLI

Install or run the CLI, then create the agent configuration:

```bash
npx @pollinations/cli agents create --config agent.json --json
```

Copy the returned agent ID and register a model name for it:

```bash
npx @pollinations/cli my-models create \
  --agent-id <agent-id> \
  --name research-assistant \
  --title "Research Assistant"
```

The callable model ID is `<your-github-username>/research-assistant`. Add `--visibility public` to publish it after your account has community publisher access. Managed-agent registrations are always text-only and free: they cannot set prices, fallbacks, or a per-user request limit.

Creating an agent through `POST /account/agents` or `polli agents create` creates only its configuration. Register it through `/account/my-models` to make it callable. The dashboard performs both steps together.

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
npx @pollinations/cli agents delete <agent-id>
```

Deleting an agent also deletes its model registration. Updating an agent changes its prompt, base model, and tools without changing the registered model name.

The Account API exposes the same operations under `/account/agents`. API keys need the `account:keys` permission. See the [API reference](https://gen.pollinations.ai/docs#tag/account) for request and response schemas.
