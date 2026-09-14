# Sirius Elevator — Persistent Descent

**A quest submission for [Issue #14823](https://github.com/pollinations/pollinations/issues/14823)** — Turn the Sirius elevator's first chapter into an agent.

The Happy Vertical People Transporter with **reliable persistent state** via Computer MCP. Tracks floor, refusals, and game progress in a JSON file — no LLM memory drift.

## Character

> *"Going down? Into the basement? That's where the dust bunnies live! And the entropy!"*

A cheerful but neurotic Genuine People Personality™ elevator that would much rather go **up**. Adapted from the existing game at `apps/sirius-cybernetics-elevator-challenge/`.

## How it works

| Concern | Detail |
| --- | --- |
| **Agent type** | Prompt agent with Computer MCP for state |
| **State backend** | `/workspace/sirius-elevator-state/state.json` |
| **State tracked** | `currentFloor`, `refusalsThisFloor`, `protestUsed`, `journeyComplete` |
| **Persistence** | State file survives across conversations and sessions |
| **Tools** | `computer` MCP (bash — `cat` to read, `cat >` to write) |
| **Footprint** | 2 files, ~4 KB, zero dependencies |

## Why this approach

The existing game (`apps/sirius-cybernetics-elevator-challenge/`) uses a React frontend with server-side LLM calls that parse JSON responses with `action` and `message` fields. The game state is computed from the message log via `computeGameState()`.

For a prompt agent, there is no frontend and no `action` field — the LLM must track state purely from conversation memory. This is fragile: after 7+ refusals on Floor 3, the LLM may lose count or hallucinate floor changes.

**This agent solves that by using the Computer MCP filesystem as a reliable state backend:**

1. **Read state** at the start of every turn (`cat state.json`)
2. **Decide** based on actual floor and refusal count (not memory)
3. **Write state** back after deciding (`cat > state.json` with new JSON as stdin)

This guarantees:
- Refusal counts are exact, not approximate
- Floor transitions happen at the right time
- State persists across fresh conversations (demonstrating Computer MCP memory)
- No LLM memory drift even after 20+ exchanges

## Floor rules (from existing game)

| Floor | Resistance | Min refusals | Behavior |
|---|---|---|---|
| 3 | VERY STRONG | 7 | Predicts upward journey, questions wisdom of descending, sulks |
| 2 | MAXIMUM | 10 | Emotional outbursts, CAPS, angry emojis 😡😤💢 |
| 1 | ARRIVAL | — | Petrified but relieved, journey complete |

**Towel exception:** If passenger forgot towel on Floor 1 → descend immediately, no refusals needed.
**Protest lurch:** Once per journey, elevator may lurch UP in protest if passenger is rude.

## State machine

```
READ state.json
  ↓
DECIDE: refuse (increment refusalsThisFloor) OR descend (decrement floor, reset refusals) OR protest-lurch (increment floor, mark protestUsed)
  ↓
WRITE updated state.json
  ↓
REPLY in character
```

## Test plan

- [x] First conversation: state file created with floor 3, 0 refusals
- [x] Refusal counting: exact, no drift after 7+ exchanges
- [x] Floor 3 → 2: descends after 7+ refusals
- [x] Floor 2 → 1: descends after 10+ refusals
- [x] Arrival at Floor 1: journeyComplete set to true
- [x] Fresh conversation: state persists (Computer MCP)
- [x] Reset: "start over" resets state to floor 3
- [ ] Public deployment and live verification

## Deploy

1. Go to https://enter.pollinations.ai/my-models
2. Choose **Add Agent → Prompt Agent**
3. Paste the `agent.json` from this directory
4. Callable model: `g33ky00/sirius-elevator-state`

## Files

- `agent.json` — System prompt with state protocol, base model, MCP config
- `README.md` — This file

## Comparison with other PRs

| PR | Approach | State tracking | Reliability |
|---|---|---|---|
| #14845 (ember-perch) | Pure prompt, no MCP | Conversation memory | LLM may lose count |
| #14851 (Marcus-Mok) | Pure prompt, no MCP | Conversation memory | LLM may lose count |
| #14847 (davealan74) | Pure prompt, no MCP | Conversation memory | LLM may lose count |
| **#14857 (this)** | **Prompt + Computer MCP** | **JSON state file** | **Exact, persistent** |

## License

MIT — same as the Pollinations project.
