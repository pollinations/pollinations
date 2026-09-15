# CatGPT Comic Agent

A [Pollinations prompt agent](https://github.com/pollinations/pollinations/blob/main/BUILD_YOUR_OWN_AGENT.md) that answers any message with a **CatGPT comic**: your question and the cat's short, sarcastic reply drawn into the image. This turns the existing [CatGPT meme generator](https://github.com/pollinations/pollinations/tree/main/apps/catgpt) into a reusable, callable text model — no website needed.

**Callable model:** `rekty/catgpt-comic` (agent id `00ffa15d-e336-45f0-b84e-aed031c74a44`)
**Base model:** `openai-fast` · **Tools:** `pollinations` (`generateImage`, model `nanobanana`)

## The character

The same supremely aloof CatGPT from `apps/catgpt`: replies are 2–8 words of withering feline disdain, and the reply is drawn into a single-panel comic in the hand-drawn marker style of the original — including the `@missfitcomics` signature.

> Credit where due: the CatGPT comic is the creation of **Tanika Godbole (@missfitcomics)**. The agent reuses the existing personality, comic prompt guide, and style; the signature stays in every panel.

## What a reply looks like

The agent's entire textual reply is one Markdown image link (plus the tool-call block a chat client shows for the generation), so comics render inline in any Markdown-capable client:

```markdown
![CatGPT comic](https://media.pollinations.ai/1e4edc8c28b88a70feec7f2e570d84f8c483a64bfabb7f5a44e61034e304a91f)
```

Real examples from the live agent (see TESTING.md for the full transcripts):

![What is the meaning of life? — Nap through it.](https://media.pollinations.ai/1e4edc8c28b88a70feec7f2e570d84f8c483a64bfabb7f5a44e61034e304a91f)

![Should I learn to code? — Nap through it.](https://media.pollinations.ai/ae25848acfe25fbd04bc30c695e7709ed13adf28c5aabf9de8dc28b3c0e0406d)

![Do you love me? — Love? I nap through it.](https://media.pollinations.ai/d80d0ed8236da3226ea9a7e024ce5807ab015d284bb7490b42d20279c33d80d0)

## Try it

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "rekty/catgpt-comic", "messages": [{"role": "user", "content": "What is the meaning of life?"}]}'
```

The caller pays for their own generation (`nanobanana` via the Pollinations MCP tool) — the agent adds no price of its own.

Copy this folder's `agent.json` to make your own: `npx @pollinations/cli agents create --config agent.json --name <your-name> --title "CatGPT Comic"`.

## How it works (one file, no code)

`agent.json` wires three things the repo already had:

1. **Personality** — the `CAT_SYSTEM` voice from `apps/catgpt/ai.js` (short, sarcastic, never helpful).
2. **Comic template** — the single-panel style spec from `apps/catgpt/catgpt-prompt-guide.md` (thick marker strokes, dot-eyed human with bob and burgundy sweater, patched white cat, CATGPT title, @missfitcomics signature).
3. **One tool recipe** — call `generateImage` (Pollinations MCP) with `model: nanobanana`, `size: 1024x1024`, and the filled template; return the resulting media URL as `![CatGPT comic](<url>)` and nothing else.

## Files

- `agent.json` — system prompt (character + comic template + tool recipe), base model, MCP servers.
