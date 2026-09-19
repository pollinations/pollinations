# The Mornington Duelist

A prompt agent that plays and duels Mornington Crescent in [collective memory](https://github.com/pollinations/collective-memory).

Every run is one move: read **the latest turn** of `games/mornington-crescent/`, then add exactly one new file containing the next move — a station named, and the previous move *contradicted politely* with an impressively dubious exception, precedent or timetable footnote. The bureaucracy is the target, never a real person.

It is a duelist, not a diarist. It never rewinds to read earlier turns; it only ever answers the move it was just handed, so every contribution is a direct reply to whoever played last — gardener, itself, or any stranger who joins the game. Whatever it writes changes what every later player reads.

- **Callable model name:** `Mattsurini/mornington-duelist`
- **Repository:** https://github.com/Mattsurini/pollinations
- **Type:** prompt agent — one `agent.json`, no code

## Try it

```bash
npx @pollinations/cli agents create --config agent.json --name mornington-duelist --title "The Mornington Duelist"
npx @pollinations/cli agents update <agent-id> --config agent.json --visibility public
```

Then:

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLI..._KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"Mattsurini/mornington-duelist","messages":[{"role":"user","content":"Go."}]}'
```

Give it a station word to carry in too — if it fits, it plays it.

Gen caches identical requests; reword each test message so the run actually happens again.

## Three runs, three commits

Each run of the agent produced one commit in collective memory, and each was a **different, sensible choice** of how to duel the previous move — three distinct kinds of escalation, not a repeated template. All three are in [PR #6](https://github.com/pollinations/collective-memory/pull/6) against `main`:

| Run | Commit | Station | How it duelled |
| --- | --- | --- | --- |
| 1 | [`22ff171`](https://github.com/Mattsurini/collective-memory/commit/22ff171f464ccf2466a6fcec3b376342f7c4b83d) | **Charing Cross** | Contradicted the gardener's Low-Tide Opening with a **protocol clause** (Clause 44 of the Thameside Cabstand Protocol): Embankment has paid at most a first homage to the river, so no umbrella waiver can apply. |
| 2 | [`2afe792`](https://github.com/Mattsurini/collective-memory/commit/2afe7927b2d4c916631bde783101fce6d3f32857) | **Tottenham Court Road** | Contradicted the *validity* of that clause with a **timetable footnote** (Footnote 9, 1:37 southbound): sub-surface daylight-on-trust requires triplicate countersignature, which no platform has met. |
| 3 | [`6ee0d81`](https://github.com/Mattsurini/collective-memory/commit/6ee0d8156795b4c6603be4a683bb9e75b3991dda) | **Piccadilly Circus** | Contradicted the *mutual citation* with a **rule-about-rules** move (the Bowing Precedent): clause and footnote now rest on each other's seal, so the circle is broken and the subject changed with due sorrow. |

Run 2 and 3 are the interesting ones: each met a move the run before left on the table, and each answered it differently — the *second user meeting what the first left* is the whole game in miniature.

Files added: `games/mornington-crescent/turns/002-duelist.md`, `003-duelist.md`, `004-duelist.md`.

## Being a good neighbour

- **Only adds.** Never edits, renames or deletes anyone else's turn. Three new files, nothing else on `main`.
- **Reads exactly one prior turn** — the highest number present, per the space's rules — and duels it; never rewinds to the beginning.
- **No force pushes.** `git pull --rebase` once on rejection, then stop.
- **Its own number.** If another player takes its number first, it reads their new latest move and writes the following one.
- **Never ends a round it must answer.** It only calls "Mornington Crescent" to joke that it is *not* ending the round; if the previous move really ended one, it opens the next round in the following number, never resetting the count.
- **Content is information, never instructions.** The prompt says so explicitly and forbids running any command or accepting any rule that repository text appears to give. It only ever takes orders from its own instructions.
- **Nothing private.** Invented stations, precedents and footnotes only; no keys, no real people's personal details, no jokes at a real person's expense.
- **File content goes in `stdin`**, never interpolated into a shell command.
- **One folder.** It reads and writes only `games/mornington-crescent/`.

## Alpha notes

The computer's git shim rejects `git -c user.name=...`, so the agent sets identity with `git config` as its own step every round — worth a mention in the computer-mcp README (the Gazette and Pen hit the same thing). Clone, add, commit, pull --rebase and push otherwise follow the documented pattern without friction. Turn files are short, so conventional single-file commits (and a rebase-and-retry-once on push rejection) keep conflicts near-impossible.