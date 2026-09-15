# Memory Fox NPC — live demo transcript

Agent: `ammarelshaf3y/memory-fox-npc` (agent ID `3eb102f7-d9af-4618-b379-cc6f47b3bba6`)
Base model `openai`, MCP `computer`. Every CLI call below is a **fresh
conversation** (stateless), so recall proves file-backed memory.

## Round 1 — remember + fresh recall + forget + show (mint tea)

1. `remember I like mint tea`
   - tool: `echo '- likes mint tea' >> /workspace/memory-fox-npc/memories.md`
   - reply: Saved! I've noted that you like mint tea.

2. Fresh chat: `what do you remember about me?`
   - tool: `cat /workspace/memory-fox-npc/memories.md` -> `- likes mint tea`
   - reply: my satchel says you like mint tea.

3. `forget mint tea`
   - tool: `sed -i '/mint tea/d' /workspace/memory-fox-npc/memories.md`
   - reply: swept "mint tea" out of my satchel memory.

4. `show memories`
   - tool: `cat /workspace/memory-fox-npc/memories.md` -> empty
   - reply: Your satchel is empty, wanderer.

## Round 2 — second fact + forget-everything (camel Baraka)

5. `please remember this: my camel's name is Baraka`
   - tool: `echo "- my camel's name is Baraka" >> memories.md && cat`
   - reply: I'll never forget your camel, Baraka.

6. Fresh chat: `list everything you have stored about me right now`
   - tool: `cat memories.md` -> `- my camel's name is Baraka`
   - reply: my satchel remembers one thing: my camel's name is Baraka.

7. `forget everything you know about me`
   - tool: `: > /workspace/memory-fox-npc/memories.md`
   - reply: your slate is wiped clean, satchel is empty now.

8. Fresh chat: `do you still recall anything from our earlier talks?`
   - tool: `mkdir -p ... && touch ... && cat ...` -> empty
   - reply: satchel is empty, I don't recall anything.

## Isolation + safety

- Isolation is architectural: each caller gets a private Computer
  (Durable Object `user:<userId>`), so user B can never read user A's
  `memories.md`. The prompt never asks for a user id.
- Safety: every command is scoped to `/workspace/memory-fox-npc/`.
  No `rm -rf /`, no reads/writes outside the folder (asserted in
  `test.mjs`, 8/8 green). Uses `/workspace` (persistent), never `/tmp`
  (wiped after every Computer MCP call per its README).
