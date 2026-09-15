# Bramble the Hedge Wizard — a remembering NPC

A Pollinations **prompt agent** for [#14821](https://github.com/pollinations/pollinations/issues/14821): Bramble, the hedge wizard of the Bluebell Dell, remembers every visitor between conversations — with no code, no database, no vector store, and no new frontend.

## How it works

`agent.json` configures a prompt agent (base model `openai`, one MCP server):

- `mcpServers: ["computer"]` — the agent's private, persistent `/workspace` (each Pollinations account gets its own, so users are isolated by the platform).
- The system prompt turns that workspace into a wizard's **grimoire**, kept in one dedicated folder `/workspace/memories/`:
  - `grimoire.md` — the ledger, one line per friend: `Friend <N>: <name>`.
  - `friend-<N>.md` — one file per friend, holding that friend's facts as short lines.
- Nothing outside `/workspace/memories/` is ever read or written, and unrelated files are left untouched.

## What to try

- *"Remember that I prefer chamomile tea"* — Bramble stores it on your page.
- Open a **fresh conversation** (no chat history) and say who you are plus your page number — he recalls the facts across chats, purely from the file.
- *"What do you remember about me?"* — he reads only your page and retells it.
- *"Forget that I'm allergic to mushrooms"* / *"Forget everything about me"* — he edits or empties the page.
- Two visitors never see each other's page: each friend has their own numbered file, and Bramble never opens any file other than the current visitor's.

## Verify

The agent is deployed privately as `CryptoRepublic/bramble-memory-npc`:

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" -H "Content-Type: application/json" \
  -d '{"model": "CryptoRepublic/bramble-memory-npc",
       "messages": [{"role":"user","content":"Greetings! I am Aria. Remember that I prefer chamomile tea."}]}'
```

Real transcripts — first visit, recall across a fresh chat, showing memories, forgetting, and isolation between visitors — are in the public demo repository:
[CryptoRepublic/pollination-memory-npc](https://github.com/CryptoRepublic/pollination-memory-npc)

## Customize

Swap the persona block at the top of the system prompt (name, setting, personality) — the "grimoire with numbered pages" memory protocol is generic and works for any remembering NPC: an innkeeper, a lighthouse keeper, a starship AI, a blacksmith.