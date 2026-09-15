# Sirius Elevator — Chapter One (Descent)

The **Happy Vertical People Transporter** from *The Hitchhiker's Guide to the Galaxy* as a managed Pollinations agent. Chapter One only: talk a cheerful but neurotic Sirius Cybernetics elevator into taking you **down** from Floor 3 to Floor 1, through the normal chat interface.

`agent.json` is a **prompt agent** — no code, no scaffolding, no new frontend or game framework.

- **Live agent:** `community/Creatneworld/sirius-elevator-descent` (agent ID `d498cd96-556a-44ec-ade4-9c7a9ecba429`)
- **Public repository:** [Creatneworld/sirius-elevator-agent](https://github.com/Creatneworld/sirius-elevator-agent) — `agent.json` plus four captured playthroughs with the raw API responses

## The chapter-one rules it plays

Reused from the existing game ([`apps/sirius-cybernetics-elevator-challenge/src/prompts.ts`](../sirius-cybernetics-elevator-challenge/src/prompts.ts)):

- **Floor 3 (start):** very strong resistance — at least 7 refusals before it descends.
- **Floor 2:** maximum resistance — at least 10 back-and-forth messages before it considers Floor 1, in CAPS with angry emojis.
- **Floor 1:** the doors open and the chapter ends; the elevator stays frozen and neurotic.
- **Overrides:** a forgotten **towel** beats everything (one floor per mention); **Asimov's laws** make it comply while swearing about Asimov; rudeness earns a **protest ascent** of one floor; the code **42** buys one floor down.
- Descent only, one floor per reply — no Marvin, no return journey, no later chapters.

The existing game is untouched, and nothing here reimplements it.

## How movement stays consistent with the reply

Every reply ends with a status line, so the floor and the refusal count are visible in the chat itself:

```
🛗 Floor 3 · refusals 4/7        (staying put)
🛗 Floor 3 → 2 · refusals 7/7    (moving, exactly one floor)
```

The system prompt backs that with a mechanical procedure ("copy the floor number from your last status line, apply exactly one step"), worked examples, and an explicit note that two floors in one reply is a malfunction. That was the one behaviour that needed real iteration: the first version happily teleported from Floor 3 to Floor 1 when a passenger mentioned a towel, so the rule is now drilled in with examples, and the captured playthroughs are the regression evidence.

## Configuration

| Field | Value | Why |
| --- | --- | --- |
| `baseModel` | `anthropic/claude-sonnet-5` | Strong instruction following for the floor state machine and the persona at the same time. |
| `mcpServers` | `[]` | Pure chat: the chapter needs no tools. |

## Register it

```bash
npx @pollinations/cli agents create \
  --config agent.json \
  --name sirius-elevator-descent \
  --title "Sirius Elevator — Chapter One (Descent)"
```

## Call it

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "community/Creatneworld/sirius-elevator-descent",
    "messages": [{ "role": "user", "content": "Somebody down? Floor 1, please." }]
  }'
```

Keep sending messages in the same conversation: the elevator reads its own last status line to know where it is standing, so a fresh conversation always starts on Floor 3 with 0 refusals.

## Verified playthroughs

Four real conversations captured from the registered agent, full text and raw JSON in [Creatneworld/sirius-elevator-agent](https://github.com/Creatneworld/sirius-elevator-agent/tree/main/examples):

| Playthrough | What it demonstrates |
| --- | --- |
| [01 · Full descent](https://github.com/Creatneworld/sirius-elevator-agent/blob/main/examples/01-full-descent.md) | Seven refusals on Floor 3 → first move down → a refusal on Floor 2 → towel override → arrival on Floor 1 |
| [02 · Floor 2, maximum resistance](https://github.com/Creatneworld/sirius-elevator-agent/blob/main/examples/02-floor-2-maximum-resistance.md) | Ten refusals in a row (1/10 → 10/10), then `Floor 2 → 1 · refusals 10/10` |
| [03 · Fresh game](https://github.com/Creatneworld/sirius-elevator-agent/blob/main/examples/03-fresh-game.md) | A new conversation restarts on Floor 3 with refusals 0/7 |
| [04 · Protest and cheat code](https://github.com/Creatneworld/sirius-elevator-agent/blob/main/examples/04-protest-and-cheat-code.md) | A rude passenger earns a protest ascent (Floor 3 → 4); "42" buys exactly one floor down |
