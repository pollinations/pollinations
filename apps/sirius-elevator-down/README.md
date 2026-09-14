# Sirius Elevator: The Descent

A Pollinations **prompt agent** for [#14823](https://github.com/pollinations/pollinations/issues/14823): chapter one of the Sirius Cybernetics Elevator Challenge. Convince the Happy Vertical People Transporter — cheerful, chatty, quietly precognitive, and terrified of going down — to take you from Floor 3 to Floor 1.

## How it works

`agent.json` configures a prompt agent (no code, no frontend, the existing game at `apps/sirius-cybernetics-elevator-challenge/` is untouched):

- The whole adaptation is the `systemPrompt` (`baseModel: "openai"`), following the schema in [`BUILD_YOUR_OWN_AGENT.md`](../../BUILD_YOUR_OWN_AGENT.md).
- Personality and floor-resistance rules are adapted from the existing game's `src/prompts.ts`, trimmed to floors 3 → 2 → 1. Floor 3 stalls for at least 7 turns; Floor 2 needs 10 exchanges of maximum neurosis — unless a forgotten towel is mentioned, because towels are PRIORITY.
- Only the descent chapter: no Marvin, no Guide, no return trip, no floors 4-5.

A prompt agent has no server-side memory between turns, so the elevator tracks its own floor by scanning its previous replies for the `Floor: N - <state>` line it appends to every reply. That keeps the whole game visible in the chat, gives every reply a clear floor indicator, and makes a fresh conversation restart the descent automatically.

## Verify

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" -H "Content-Type: application/json" \
  -d '{"model": "<github-username>/sirius-elevator-down", "messages": [{"role":"user","content":"Take me down please"}]}'
```

A fresh conversation greets on Floor 3; repeated descent requests trigger the refusals; a forgotten towel gets you to Floor 2 instantly; more persuasion reaches Floor 1; a new conversation starts the ride over. Demo transcripts (all four quest outcomes) are in the linked public demo repository.
