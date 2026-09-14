# CatGPT Comic Replies

A Pollinations **prompt agent** for [#14822](https://github.com/pollinations/pollinations/issues/14822): CatGPT answers any question with a short, sarcastic feline reply drawn into a single-panel CatGPT comic, returned inline as a Markdown image.

## How it works

`agent.json` configures a prompt agent (no code, no frontend):

- `baseModel: "claude-fast"` — the model already used for cat replies in `apps/catgpt/ai.js`, supports tool calling.
- `mcpServers: ["pollinations"]` — gives the agent the `generateImage` tool; its result is attached automatically as an inline `![Generated image](...)` link.
- The system prompt reuses the persona from `apps/catgpt/ai.js` and the comic prompt template from [`catgpt-prompt-guide.md`](../catgpt/catgpt-prompt-guide.md), calling `generateImage` with model `nanobanana`, size `1024x1024`, and the original CatGPT artwork as the style reference so every panel matches Tanika Godbole's (@missfitcomics) drawing style.

The agent never describes the comic instead of drawing it, never calls the tool twice, and always keeps the `@missfitcomics` signature — the original creator stays credited in every panel.

## Verify

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" -H "Content-Type: application/json" \
  -d '{"model": "<github-username>/catgpt-comic-replies", "messages": [{"role":"user","content":"Why do boxes call to me?"}]}'
```

Real responses (three verified comic generations) are collected in the linked public demo repository.
