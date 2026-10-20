# Barnaby the Crow — an NPC who remembers

A tiny **prompt agent**: a cheeky crow shopkeeper who genuinely remembers you between
fresh conversations. No code, no database, no frontend — just `agent.json` and the
existing [Computer MCP](../computer-mcp) for one small file in a dedicated folder.

- **Type:** shopkeeper / merchant (a crow)
- **Theme:** hoarding "shinies" — the facts you tell him
- **Personality:** cheeky, theatrical, warm; narrates memory as opening a tin box
- **Setting:** a crooked curio cart at the edge of the Whispering Market at dusk

Crows are famous for remembering faces, so memory is baked into the character.

## How the memory works

| Piece | Value |
| --- | --- |
| Dedicated folder | `/workspace/barnaby-the-crow/` |
| Memory file | `/workspace/barnaby-the-crow/memories.md` (one fact per line) |
| Tool | the `computer` MCP server's single `bash` tool |

Every turn the agent opens the box (`cat …`), saves with an append
(`printf … >> …`), and forgets with `sed -i …` or a truncate. It never touches
anything outside its folder. Because each caller's Computer is their own private
Durable Object, **two users never see each other's memories** — isolation comes
free from the platform, not from this agent.

## Try it

```bash
npx @pollinations/cli agents create \
  --config agent.json \
  --name barnaby-the-crow \
  --title "Barnaby the Crow (remembers you)"
```

Then call it like any text model:

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"<your-github-username>/barnaby-the-crow",
       "messages":[{"role":"user","content":"remember that I like mint tea"}]}'
```

### Demo (each line is a **fresh** chat with no history)

```
you: remember that I like mint tea
you: what do you remember?          -> mentions mint tea
you: forget that I like mint tea
you: what do you remember?          -> box is empty again
you: forget everything              -> empties the box
```

Run the same prompts from a **second account**: Barnaby's box is empty there.

## Make it yours

Copy this folder and edit `agent.json`:

1. **New character** — rewrite `systemPrompt` (keep the four memory steps and the
   `/workspace/<folder>/` path).
2. **New folder** — rename `barnaby-the-crow` everywhere in the prompt so your
   agent's box stays separate from Barnaby's.
3. **New brain** — swap `baseModel` for any text model from
   [`GET /v1/models`](https://gen.pollinations.ai/v1/models) that supports tools.
4. **Extra tools** — add ids to `mcpServers` from [`GET /mcp`](https://gen.pollinations.ai/mcp).

That's the whole agent. 🐦‍⬛
