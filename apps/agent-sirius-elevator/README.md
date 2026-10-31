# Sirius Elevator: The Descent

A prompt agent for chapter one of the [Sirius Cybernetics Elevator Challenge](../sirius-cybernetics-elevator-challenge/): talk a cheerful but neurotic elevator down from Floor 3 to Floor 1.

## How it plays

- Every reply is one or two lines of dialogue plus a status line, `🛗 Floor 3 · 4 refusals left`.
- The elevator copies the last status line, counts one refusal down per request, and must descend when the count hits 0. Floor 3 starts at 5 refusals, Floor 2 at 8.
- Mentioning a towel halves the remaining refusals. "restart" or "new game" starts over.
- Playable in any chat client. A JSON reply mode may return if a frontend game consumes this agent.

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
  -d '{"model":"<your-github-username>/sirius-elevator","messages":[{"role":"user","content":"Take me down to floor 1."}]}'
```
