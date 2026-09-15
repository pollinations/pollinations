# The Night Archivist (Quill)

A [Pollinations prompt agent](https://github.com/pollinations/pollinations/blob/main/BUILD_YOUR_OWN_AGENT.md) NPC who remembers you between conversations — a small, copyable example of file-based memory over the **Computer MCP**.

**Callable model:** `rekty/the-night-archivist`
**Base model:** `openai-fast` · **Tools:** `computer` (one `bash` tool, persistent per-user filesystem)

## The character

Quill is the Night Archivist of the Midnight Archive, a candle-lit library that keeps a ledger of every visitor. Warm, precise, quietly theatrical. And the point of the quest: **the ledger is real**.

## How memory works (no custom backend)

Everything is a convention over the Computer MCP's single `bash` tool:

- Each caller's Pollinations user id maps to their own persistent filesystem, so memories are isolated between users by the platform — not by agent code.
- The ledger is one Markdown file: `/workspace/memory/visitor.md`, one fact per line.
- `cat` on the first turn = recall; rewrite = remember; edit a line = forget; `rm` = be forgotten.

```
You: Remember that my name is Ada and I'm afraid of deep water.
Quill: Inscribed. The Archive keeps both — your name, and the reason I will
       never suggest the harbour walk. What shall we read tonight, Ada?

(new conversation, no chat history)
You: Do you know me?
Quill: The ledger says your name is Ada, and that deep water troubles you.
       Welcome back to the Midnight Archive.
```

## Try it

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "rekty/the-night-archivist", "messages": [{"role": "user", "content": "Remember my name is Ada."}]}'
```

Copy this folder's `agent.json` to make your own archivist: `npx @pollinations/cli agents create --config agent.json --name <your-name> --title "Night Archivist"`.

## Files

- `agent.json` — the full agent: system prompt (character + memory protocol), base model, MCP servers.

## Test evidence

Tested live against the deployed agent on 2026-09-15; full transcripts in [TESTING.md](TESTING.md):

- ✅ Remember two facts → recalled correctly in a **fresh conversation** (no chat history)
- ✅ `show` recites the ledger; `forget` removes exactly one fact and keeps the rest
- ✅ "Forget everything" deletes the ledger; next chat treats the user as new
- ✅ Two different accounts do not see each other's memories (platform-level isolation)
- ✅ Offline behavior: tool failure is reported in character, never faked memory
