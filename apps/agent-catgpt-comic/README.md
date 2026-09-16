# CatGPT Comic

CatGPT answers any question with a short, sarcastic feline reply drawn into a single-panel comic. The comic comes back inline through the platform's Markdown image rendering, so any Markdown-capable chat client shows the comic with the reply.

`agent.json` is a **prompt agent** — no code, no scaffolding, no new frontend or backend.

- **Live agent:** `community/Creatneworld/catgpt-comic` (agent ID `c35c537b-5bda-4919-bc30-b8b710674ad5`)
- **Public repository:** [Creatneworld/catgpt-comic-agent](https://github.com/Creatneworld/catgpt-comic-agent) — `agent.json` plus three captured transcripts with the rendered comics

## What it reuses

| Piece | Source |
| --- | --- |
| Persona | The aloof-cat system prompt from [`apps/catgpt/ai.js`](../catgpt/ai.js) |
| Comic recipe | The single-panel prompt template from [`apps/catgpt/catgpt-prompt-guide.md`](../catgpt/catgpt-prompt-guide.md) |
| Style reference | [`apps/catgpt/images/original-catgpt.png`](../catgpt/images/original-catgpt.png), passed to the image model on every generation |
| Credit | The `@missfitcomics` signature instruction is kept, crediting Tanika Godbole |

The agent does not reimplement CatGPT behaviour: it wraps the existing persona plus the existing comic template in a managed agent, and the CatGPT website and Discord bot are untouched.

## Configuration

| Field | Value | Why |
| --- | --- | --- |
| `baseModel` | `anthropic/claude-haiku-4.5` | The model the CatGPT site already uses for cat replies (`claude-fast` is its alias); supports tool calling. |
| `mcpServers` | `["pollinations"]` | Enables the built-in `generateImage` tool. |
| image model | `google/gemini-3.1-flash-lite-image` | Accepts a reference image, so the original CatGPT artwork drives the style. |

The system prompt tells the agent to write only its short spoken line, then call `generateImage` once with the filled-in comic prompt (1024×1024). The platform attaches the tool result to the reply, so nothing else is needed to return the comic inline.

## Register it

```bash
npx @pollinations/cli agents create \
  --config agent.json \
  --name catgpt-comic \
  --title "CatGPT Comic"
```

The dashboard route is **My Models → Add Agent → paste `agent.json`**.

## Call it

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "community/Creatneworld/catgpt-comic",
    "messages": [{ "role": "user", "content": "Why do boxes call to me?" }]
  }'
```

One request takes roughly 30–40 seconds because the comic is generated inside the same call.

## Verified examples

Three live responses captured from the registered agent, with the rendered comics and raw transcripts, in [Creatneworld/catgpt-comic-agent/examples](https://github.com/Creatneworld/catgpt-comic-agent/tree/main/examples):

| Question | CatGPT says | Comic |
| --- | --- | --- |
| "Why do boxes call to me?" | "They know." | [comic](https://media.pollinations.ai/2cf1ff642ec3aa815fbf357c9786159f8bd645ded019d94428041ae262b16a2a) |
| "What's the meaning of life?" | "Naps. Next question." | [comic](https://media.pollinations.ai/2fe0a2d02b706d5b00f7d69120ffaaaf0bf98a7c32b2b346cb1db0a5c181a2c1) |
| "How do I fix my code?" | "Knock it off the table." | [comic](https://media.pollinations.ai/59cbc57a1500ab015551179a3c0f05da0305f615842cf40cc96b2dac6f6b6557) |

Each rendered comic carries the `CATGPT` title box, the human's question, the cat's answer and the `@missfitcomics` signature.
