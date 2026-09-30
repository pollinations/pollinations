# Idea Judge

A Pollinations **code agent** where Jev (`typesafe/jev-1.13`) makes the decision
and a text model writes the reasoning. Send it an idea and Jev answers
**KILL**, **FIX**, or **SHIP**, plus the biggest risk and a novelty probability.

- Source repository: https://github.com/Guest453/pollinations-idea-judge
- Callable model: `<your-github-username>/idea-judge` (the repository name)

## How it decides

One `POST /alpha/decisions` call asks Jev three questions — `verdict` (choice:
kill/fix/ship), `biggest_risk` (choice: market/tech/timing/competition) and
`novel` (`noul`). A text model then writes the verdict and 2–4 sentences using
only the idea and Jev's answers; it never re-decides. `agent.ts` is the whole
agent.
