# Tiny Fighter Arena

Describe a fighter in one line. The AI brings it to life and sends it up a ladder
of short, loudly commentated battles. Built for quest
[#17250](https://github.com/pollinations/pollinations/issues/17250).

- **Play:** open `index.html` in any static host (or the raw file — it also works
  from `file://`, though sign-in redirect then needs a pasted key). No build step,
  no dependencies, no server.
- **Pay:** players bring their own Pollen. Sign-in uses the
[Bring Your Own Pollen](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)
fragment flow, so the game never ships a key and every player spends their own
balance.

## How a fight goes

1. **Describe a fighter** — one line: *"a cheese grater golem that reflects light
   and hums showtunes"*. A text model turns that into a full fighter sheet:
   name, epithet, portrait prompt, stats (power / defense / speed / chaos),
   2–3 signature abilities, a quirk, a fighting style and trash talk.
   Clever, specific descriptions produce genuinely dangerous fighters; lazy ones
   sit near the bottom of the stat budget on purpose.
2. **Watch it battle** — a ladder of five challengers generated to riff on your
   fighter (an ironic opposite, a natural predator, an escalation). Each fight is
   a deterministic, seeded turn engine — damage, dodges, crits, quirk misfires —
   narrated by an announcer model in 2–3 punchy sentences per round, with
   optional spoken commentary (TTS).
3. **Share the fight** — every battle has a *Copy share link* button that packs
   both fighters plus the seed into the URL (`#f=…`, LZW-compressed), so anyone
   opening the link sees the exact same rematch.

## Files

| File | What it is |
| --- | --- |
| `index.html` | the single page |
| `style.css` | the arena look |
| `app.js` | UI + API layer (chat, image, TTS, auth, share handling) |
| `core.js` | pure game logic: prompts, defensive JSON parsing, seeded battle engine, share codec — importable in Node for headless testing |

## Models

Text defaults to `openai/gpt-5.4-nano`, images to `tongyi-mai/z-image-turbo`,
commentary speech to `openai/tts-1` — all changeable at the top of `core.js`
(`CONFIG`). The live model lists are at
[gen.pollinations.ai/v1/models](https://gen.pollinations.ai/v1/models).

## Bring your own Pollen

- **Sign in** button → redirects to
  `enter.pollinations.ai/authorize?redirect_uri=<this page>&scope=usage`;
  the key returns in the URL *fragment* (never a query string, never logged), is
  kept in `sessionStorage` for the tab only, and is stripped from the URL
  immediately.
- No Pollen app key is embedded, so the game works unmodified on any host;
  hosts who want attribution can add their `pk_` key to the authorize call.
- Fallback: paste an `sk_` key in the sign-in dialog (get one at
  [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys)).

## Testing

`core.js` is dependency-free and Node-loadable, so the exact production prompts,
parser and engine can be verified headless:

```js
const TFA = require('./core.js');
const fighter = TFA.coerceFighter(TFA.extractJSON(rawModelReply), { sourceLine: '…' });
const battle = TFA.newBattle(fighter, foe, 12345);   // same seed → same fight
while (!battle.bout.over) battle.nextRound();
```

Verified against the live API: fighter and challenger JSON round-trips, seeded
battle determinism, announcer replies, portrait generation and share-link
round-trips all pass.
