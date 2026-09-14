# CatGPT Comic Replies

A Pollinations **prompt agent** for [#14822](https://github.com/pollinations/pollinations/issues/14822): CatGPT answers the user's question with a short, sarcastic feline reply drawn into a single-panel CatGPT comic, returned inline as a Markdown image. The existing CatGPT website and Discord bot are unchanged.

## How it works

`agent.json` configures a prompt agent (base model `openai`, one MCP server):

- `mcpServers: ["pollinations"]` — gives the agent the `generateImage` tool; the generated comic is attached automatically as an inline Markdown image link.
- The system prompt reuses the CatGPT personality from `apps/catgpt/ai.js` and the comic prompt template from [`apps/catgpt/catgpt-prompt-guide.md`](../catgpt/catgpt-prompt-guide.md).
- `generateImage` is called with model `gptimage`, size `1024x1024`, and the **original CatGPT artwork** (`apps/catgpt/images/original-catgpt.png`) as the style reference, so every panel matches Tanika Godbole's drawing style and keeps her `@missfitcomics` signature.

The agent draws the comic instead of describing it, calls `generateImage` once per question, and always credits the original creator.

## Verify

The agent is deployed privately as `CryptoRepublic/catgpt-comic-agent`:

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" -H "Content-Type: application/json" \
  -d '{"model": "CryptoRepublic/catgpt-comic-agent",
       "messages": [{"role":"user","content":"What is the meaning of life?"}]}'
```

Three real comic responses (rendered in a Markdown-capable chat client) are in the public demo repository:
[CryptoRepublic/pollination-catgpt-comic](https://github.com/CryptoRepublic/pollination-catgpt-comic)

## Customize

The reply persona and the comic template are small, self-contained strings at the top of the system prompt — swap the persona to change the tone, or edit the template to change the art style. Credit to Tanika Godbole (@missfitcomics) is preserved in every panel by design.