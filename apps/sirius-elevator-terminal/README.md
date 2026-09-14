# Sirius Cybernetics Elevator Challenge — Terminal Edition

A full terminal version of the [Sirius Cybernetics Elevator Challenge](../sirius-cybernetics-elevator-challenge),
built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal)
and powered by [Pollinations](https://pollinations.ai). Sign in with **BYOP
device login** — no API key to copy/paste.

```
┌─ 🛗 Sirius Cybernetics Elevator Challenge ──────── @you · 42.00 pollen ─┐
│ Floor: ▓▓▓░░ 3/5                                       moves left: 14   │
└────────────────────────────────────────────────────────────────────────┘
```

## Run

```bash
npm install
npm run build
npm start
```

Or in one step during development:

```bash
npm run dev
```

On first run you'll be sent through device login: the CLI opens your browser to
`enter.pollinations.ai/device`, shows you a short code to confirm, and waits.
The minted key is cached in `~/.config/sirius-elevator/config.json`.

## The game

Three chapters, identical mechanics to the web version:

1. **Descend** — talk the neurotic elevator down to the ground floor. (Remember
   your towel.)
2. **Marvin** — convince Marvin the Paranoid Android to board, then reach the
   top floor together.
3. **Role swap** — drink the Pan Galactic Gargle Blaster and wake up *as* the
   elevator. Your passenger is an LLM seeded to be your chapter-1 self; talk
   their desired floor up from 1 to 5. If you ever played the towel card, their
   desire for Floor 1 is now immovable.

## Auth

Uses the OAuth 2.0 Device Authorization Grant (RFC 8628) at
`enter.pollinations.ai/api/device/*`. The resulting `sk_` key calls
`gen.pollinations.ai/v1/chat/completions`.

## Flags / env

- `--model <mistral|openai|deepseek|claude-fast>` — pick the LLM (default
  `mistral`). Persisted to config.
- `--logout` — clear the cached key.
- `POLLINATIONS_API_KEY` — skip device login with an existing key.
