# Memory Fox NPC — Sahara remembers you

A prompt agent for [#14821](https://github.com/pollinations/pollinations/issues/14821):
a fun NPC that remembers you between conversations.

**NPC:** Sahara, a desert-fox merchant from Siwa Oasis.
Type / theme / personality / setting are one paragraph in `agent.json`,
so anyone can copy and swap them for their own NPC.

This is a prompt agent, not a code agent: `agent.json` is the whole
submission. No new memory service, vector DB, or frontend. Memory is one
small file via the existing Computer MCP, in a dedicated folder.

## How memory works

- Folder: `/workspace/memory-fox-npc/`, file: `memories.md` only.
- Every turn FIRST runs:
  `mkdir -p /workspace/memory-fox-npc && touch /workspace/memory-fox-npc/memories.md && cat /workspace/memory-fox-npc/memories.md`
- `remember X` appends `- X` to the file.
- `show memories` reads the file back.
- `forget X` deletes matching lines with `sed -i`, `forget everything`
  truncates the file. Nothing outside the folder is ever touched.
- Isolation between users is automatic: each caller gets a private
  Computer (Durable Object `user:<userId>`), so two users never see
  each other's `memories.md`.

## Deploy

```bash
npx @pollinations/cli agents create \
  --config agent.json \
  --name memory-fox-npc \
  --title "Memory Fox NPC"
```

This registers the callable model `<your-github-username>/memory-fox-npc`.
Add `--visibility public` once the account has community publisher access.

## Verify

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<your-github-username>/memory-fox-npc",
    "messages": [{"role": "user", "content": "remember I like mint tea"}]
  }'
```

Then in a FRESH conversation (no old history):

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<your-github-username>/memory-fox-npc",
    "messages": [{"role": "user", "content": "what do you remember about me?"}]
  }'
```

Expected: it lists mint tea, proving file-backed memory across chats.
Then try `forget mint tea` and `show memories` to confirm deletion.
Call the same agent from a second Pollinations account to confirm
isolation (empty memories there).

`node apps/memory-fox-npc/test.mjs` checks `agent.json` matches the
schema in `BUILD_YOUR_OWN_AGENT.md` and covers remember/show/forget,
dedicated-folder safety, and bash-first loading.
