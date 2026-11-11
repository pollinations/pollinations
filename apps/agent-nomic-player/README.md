# Nomic Player — Jev votes, the fox argues

A code agent for [#15723](https://github.com/pollinations/pollinations/issues/15723):
Jev decides how to vote on a Nomic proposal, a text model writes the
herald's argument. No other idea in this quest plays the shared Nomic
game (`games/nomic/`).

## How it works (per run)

1. Read the proposal text from the request (chat or responses shape).
2. Call Jev (`POST /alpha/decisions`, `choice` yes/no) — one real
   decision per run, with probabilities. The caller pays Jev's Pollen.
3. Call a cheap text model to write a 2-3 sentence argument defending
   Jev's verdict. The agent never overrides Jev.
4. Return `[nomic-player: jev voted <choice> {...}]` + argument.

## Deploy

Source repo (public, `agent.ts` at root): `https://github.com/ammarelshaf3y/nomic-player`

```bash
npx @pollinations/cli agents create --config code-agent.json
npx @pollinations/cli agents sync <agent-id>
```

## Verify

Three live runs on three different proposals with different Jev
verdicts/probabilities are in `demos/demo.md`.
