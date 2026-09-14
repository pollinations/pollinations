# Sirius Elevator: The Descent

A Pollinations **prompt agent** for [#14823](https://github.com/pollinations/pollinations/issues/14823): chapter one of the Sirius Cybernetics Elevator Challenge as a playable agent. Convince the Happy Vertical People Transporter — cheerful, chatty, vaguely precognitive, and terrified of going down — to take you from Floor 3 to Floor 1.

## How it works

The whole adaptation is the `systemPrompt` (`baseModel: "openai"`, no MCP servers), following the schema in [`BUILD_YOUR_OWN_AGENT.md`](../../BUILD_YOUR_OWN_AGENT.md). Personality and floor-resistance rules are adapted from the existing game's [`src/prompts.ts`](../sirius-cybernetics-elevator-challenge/src/prompts.ts), trimmed to floors 3 → 2 → 1:

- **Floor 3** stalls cheerfully at least 7 times before conceding Floor 2.
- **Floor 2** demands ~10 exchanges of maximum neurosis before even considering Floor 1 — unless the rider mentions a forgotten towel, because **towels are PRIORITY**.
- **Floor 1** is a dramatic, petrified arrival: the chapter ends.
- No Marvin, no Guide, no return journey, no floors 4–5. Opening a fresh conversation restarts the descent.

A prompt agent has no server-side memory between turns, so the elevator tracks its own floor by scanning its previous replies for the `Floor: N - <state>` line it appends to every reply. That keeps the current floor and state clearly visible in the chat, keeps movement consistent with the replies, and makes a fresh game completely natural.

## Verify

The agent is deployed privately as `CryptoRepublic/sirius-elevator-descent`:

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" -H "Content-Type: application/json" \
  -d '{"model": "CryptoRepublic/sirius-elevator-descent",
       "messages": [{"role":"user","content":"Good day, elevator."}]}'
```

Real conversations demonstrating refusal, successful persuasion, the towel shortcut, arrival on the ground floor, and a fresh game are in the public demo repository:
[CryptoRepublic/pollination-sirius-elevator](https://github.com/CryptoRepublic/pollination-sirius-elevator)

## Customize

The resistance turn counts, the towel exception, and the elevator's tone live in one system-prompt string — raise or lower the counts to change difficulty, or rewrite the persona to change the voice.