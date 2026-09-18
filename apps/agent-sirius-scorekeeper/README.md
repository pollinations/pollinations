# Sirius Elevator Leaderboard

A prompt agent that keeps a **shared leaderboard** for chapter one of the
[Sirius Cybernetics Elevator Challenge](../agent-sirius-elevator/): travellers play the descent
with the prompt agent [`sirius-elevator`](../agent-sirius-elevator/), paste the result, and the
Scorekeeper **verifies** the run with a deterministic referee, writes it into
[collective memory](https://github.com/pollinations/collective-memory) and reports the standing.

- **Type:** scorekeeper / referee of the board
- **Space:** [`games/sirius-elevator/`](https://github.com/pollinations/collective-memory/tree/main/games/sirius-elevator)
  in collective memory (a new space, opened by this agent)
- **Base model:** `openai`
- **Tools:** Computer MCP (`/mcp/computer`) — the only tool it needs

No code, no database, no service. One `agent.json`, one prompt.

## The space it keeps

`games/sirius-elevator/` holds four files, and the agent reads the rules fresh on every run so the
space — not the prompt — decides what is legal:

- `README.md` — the rules, authoritative;
- `verify.awk` — the referee: a small deterministic interpreter that is the only thing allowed to
  decide `VERIFIED` / `UNVERIFIED`;
- `leaderboard.md` — an append-only log, one line per entry;
- `runs/` — one Markdown file per submitted descent, written once and never edited.

The board renders with the rest of collective memory at
[memory.pollinations.ai](https://memory.pollinations.ai).

## What one run does

1. Clone or `pull --rebase` `pollinations/collective-memory` under `/workspace/collective-memory`.
2. Read `games/sirius-elevator/README.md` fresh (the authoritative rules) and the log
   `games/sirius-elevator/leaderboard.md`.
3. Score the traveller's submission or report the standings:
   - a pasted descent is replayed mechanically against the rules → `VERIFIED` / `UNVERIFIED`;
   - a new `runs/<date>-<slug>.md` is written, plus one appended line in `leaderboard.md`;
   - the top five, the record to beat and the champion's route are read back and reported.
4. `git add -A && git commit && git push`; on a rejected push it pulls `--rebase` and pushes again.
   Never force-pushes, never deletes.

## A referee, not a judgement

The verdict is never a model's opinion. `verify.awk` replays the status lines — the refusal counts,
the halvings, the floors — and prints `verdict:`, `first broken rule:` when there is one, `steps:`
and `towels:`; the agent reports exactly that and never overrides its numbers. A claim with no
status lines, or one that breaks the rules, is still recorded honestly, marked `UNVERIFIED`, and
said plainly.

## Scoring

`steps` = number of status lines in the run — fewer wins. `towels` = towel mentions (each halves
the remaining refusals) — more is skill. Verified runs rank above unverified ones; ties break on
more towels, then on the earlier date.

## Why it is connected

This is the sequel the quest (#15054) names: *"a shared leaderboard for the Sirius elevator"*. It
builds directly on the merged agent from quest #14823 ([`apps/agent-sirius-elevator`](../agent-sirius-elevator)):
the same floors, refusal counts and towel rule — now **shared, permanent and comparable** across
travellers, and written into the one repository every Pollinations agent can read.

## Register it

```bash
npx @pollinations/cli agents create --config agent.json
```

Or **My Models → Add Agent** at https://enter.pollinations.ai/my-models and paste `agent.json`.

## Call it

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"<your-github-username>/sirius-scorekeeper","messages":[{"role":"user","content":"Standings, please."}]}'
```

Or hand it a descent to score — the run above is a real one from the test repository.
