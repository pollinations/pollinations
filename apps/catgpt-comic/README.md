# CatGPT Comic Agent

A reusable Pollinations [prompt agent](../../BUILD_YOUR_OWN_AGENT.md) that answers any question with a CatGPT comic: your question and a short, sarcastic feline reply drawn as a single-panel webcomic and returned inline as a Markdown image.

It reuses the persona, comic prompt style, and reference artwork from [`apps/catgpt`](../catgpt) — the original creator is Tanika Godbole ([@missfitcomics](https://www.instagram.com/tanikagodbole/)). This agent adds no new frontend or backend; the CatGPT website and Discord bot are unchanged.

## How it works

`agent.json` configures a prompt agent (no code needed):

- `baseModel: "claude-fast"` — matches the model already used for cat replies in `apps/catgpt/ai.js` and `apps/catgpt-bot/bot.ts`, and supports tool calling.
- `mcpServers: ["pollinations"]` — gives the agent the `generateImage` tool.
- `systemPrompt` — the CatGPT persona plus instructions to write a short sarcastic reply, then call `generateImage` with the comic prompt template from [`catgpt-prompt-guide.md`](../catgpt/catgpt-prompt-guide.md), passing the original CatGPT artwork as a style reference.

Pollinations automatically turns a `generateImage` tool call's result into an inline `![Generated image](...)` Markdown link in the response, so the agent doesn't need to format the image link itself.

## Register it

```bash
npx @pollinations/cli agents create \
  --config agent.json \
  --name catgpt-comic \
  --title "CatGPT Comic"
```

This registers the callable model `<your-github-username>/catgpt-comic`.

## Call it

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<your-github-username>/catgpt-comic",
    "messages": [{"role": "user", "content": "Why do boxes call to me?"}]
  }'
```

The response contains the cat's short reply followed by the generated comic as a Markdown image link, renderable in any Markdown-capable chat client.
