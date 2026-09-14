# Sirius Elevator: The Descent

A prompt agent for the first chapter of the Sirius Cybernetics Elevator Challenge: convince the Happy Vertical People Transporter, a cheerful but neurotic elevator that would much rather go up, to take you down from Floor 3 to Floor 1.

This is a prompt agent, not a code agent: `agent.json` is the whole submission, no frontend, database, or game framework, and the existing game at `apps/sirius-cybernetics-elevator-challenge/` is untouched.

## Design

The personality and floor-resistance rules are adapted from `apps/sirius-cybernetics-elevator-challenge/src/prompts.ts`, trimmed to floors 3, 2 and 1 (no Marvin, no Guide, no return trip, no floors 4-5).

A prompt agent has no server-side state between turns, so the elevator tracks its own floor by reading back the `Floor: <number>` line it appended to its own last reply, defaulting to Floor 3 when the conversation has none yet. That also gives every reply a clear, visible floor indicator and a distinct arrival announcement, and makes a fresh conversation start the descent over automatically.

## Deploy

```bash
npx @pollinations/cli agents create \
  --config agent.json \
  --name sirius-elevator-descent \
  --title "Sirius Elevator: The Descent"
```

This registers the callable model `<your-github-username>/sirius-elevator-descent`. Add `--visibility public` once the account has community publisher access.

## Verify

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<your-github-username>/sirius-elevator-descent",
    "messages": [{"role": "user", "content": "Take me down please"}]
  }'
```

Send a fresh conversation to see the Floor 3 greeting; keep asking to descend to see the refusals; mention a forgotten towel on Floor 2 for the fast exception; start a new conversation afterwards to confirm the ride resets.

`node apps/sirius-elevator-descent/test.mjs` checks that `agent.json` matches the schema in `BUILD_YOUR_OWN_AGENT.md` and that the prompt covers the required floors, the towel exception, and the floor-tracking line.
