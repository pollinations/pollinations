# Remembering NPC: Barnaby

A Pollinations **prompt agent** for [#14821](https://github.com/pollinations/pollinations/issues/14821): Barnaby, the night innkeeper of the Wayfarer's Rest, who remembers each guest between conversations — with no code, no database, and no new frontend.

## How it works

`agent.json` configures a prompt agent:

- `mcpServers: ["computer"]` — the agent's private persistent `/workspace` (files survive between runs).
- The system prompt turns that workspace into an innkeeper's **register and file cabinet**, both under `/workspace/memories/`:
  - `register.md` — the room ledger, one line per guest: `Room <N>: <Name>`.
  - `guest-<N>.md` — one file per room, holding that guest's facts as short lines.
- `baseModel: "openai"` — reliable tool calling plus a warm host persona.

The agent stores facts only when explicitly asked ("remember that ..."), recalls them on request, deletes them on command ("forget ..." / "forget everything about me"), and never touches anything outside `/workspace/memories/`.

## Per-user isolation (room keys, not names)

A prompt agent has no caller identity, so guests are keyed by **room numbers, not names** — which also resolves duplicate names:

- A guest claiming a name that is already in the ledger is asked for their room number; a wrong or missing number means a **new room for a new guest** ("busy inns sometimes host two Alices").
- Barnaby never opens a file other than the current guest's room, never reads one guest's facts for another, and never touches unrelated files.

A guest who lost their room number cannot open their book — a proper innkeeper regrets it and offers a fresh page.

## Verify

Call it as the owner (each fresh conversation has no shared history; memory comes only from the guest book):

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer ***" -H "Content-Type: application/json" \
  -d '{"model": "SvirepyiBambr/remembering-npc", "messages": [{"role":"user","content":"Evening, Barnaby! Name is Alice. Remember that I prefer tea."}]}'
```

Demo transcripts (first visit, return across a fresh chat, two-user isolation, forgetting, the duplicate-name collision) are in the linked public demo repository.

## Customize

Swap the persona block (name, inn, personality) at the top of the system prompt — the register-and-rooms memory protocol is generic and works for any remembering NPC: a captain, a ghost librarian, a blacksmith.
