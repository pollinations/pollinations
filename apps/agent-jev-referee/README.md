# jev-referee

A Pollinations **code agent** that lifts one repeated decision out of the agent
loop and hands it to Jev: *"is this run done, in progress, stuck, or blocked?"*

Every tool loop asks that question after every tool call, and most agents
answer it implicitly inside an ever-growing prompt. This agent makes it an
explicit, calibrated, inspectable decision — `POST /alpha/decisions` with a
`choice` question — and then **acts strictly on the verdict**: a normal text
model summarizes the result, names the next step, proposes an alternative, or
asks the user for exactly what is missing.

Callable model: **`community/zilin6666LYNSUN/jev-referee`**

## How a request is handled

The caller sends the current run state in a plain message:

```
Goal: 把周报写到 D:\reports\week30.md
Latest tool output: Error: EACCES: permission denied, open 'D:\reports\week30.md'（连续第 3 次相同错误）
```

If the markers are missing, the whole input is treated as the goal and Jev
still classifies the run.

1. **Ask Jev.** The goal and the latest tool output go into the `state`; one
   `choice` question asks for the run status:

   | Choice | Meaning |
   | --- | --- |
   | `done` | The goal has been fully achieved; the latest tool output shows the final result and no further action is needed |
   | `in-progress` | Work is advancing; partial progress is visible and the next step is clear |
   | `stuck` | The latest tool output shows an error, repeated failure, or an unresolvable obstacle; a different approach is needed |
   | `blocked` | The agent cannot proceed until the user provides something (credentials, a choice, a missing file, clarification) |

2. **Act on the verdict.** The agent picks one of four system prompts and
   forwards goal + output to the requested model (default
   `openai/gpt-5.4-nano`):
   - `done` → summarize the delivered result;
   - `in-progress` → state the single next step;
   - `stuck` → diagnose and propose one concrete alternative;
   - `blocked` → list exactly what the user must provide.

3. **Return with the decision visible.** Every answer carries
   `x-jev-status`, `x-jev-probabilities` and `x-jev-model` headers, and JSON
   bodies include a `jev` object with the same data, so callers can see which
   decision was made and how confident Jev was, without re-running anything.

## Live runs

Four calls against `gen.pollinations.ai`, each with a different run state.
Jev classified all four correctly, with near-certain probabilities, and the
acting model produced the matching output shape:

| Case | Jev verdict | Probabilities | Acting model output |
| --- | --- | --- | --- |
| File written successfully | `done` | `{done: 1.00}` | Summarizes the delivered file (path, size, contents) |
| Directory created, content pending | `in-progress` | `{in-progress: 1.00}` | Names the single next step (write the content to the file) |
| `EACCES` permission denied, 3rd time | `stuck` | `{stuck: 0.99, blocked: 0.01}` | Diagnoses the permission issue and proposes writing to a user-writable path |
| VPN login failed, needs verification code | `blocked` | `{blocked: 1.00}` | Lists exactly what the user must provide (the code, or an alternative) |

Example decision payload Jev returned for the `done` case:

```json
{
  "model": "typesafe/jev-1.13",
  "answers": {
    "status": {
      "type": "choice",
      "choice": "done",
      "probabilities": { "done": 1, "in-progress": 0, "stuck": 0, "blocked": 0 }
    }
  }
}
```

## Repo layout

- `agent.ts` — the code agent (runs at the root of this public repository).
- `agent.test.ts` — unit tests for all four verdict branches plus error
  handling. Run with `node --test agent.test.ts` (Node 22+ runs TypeScript
  directly). 6/6 pass.
- `index.html`, `script.js`, `styles.css` — a static Jev decision-desk demo
  that ships in this repository as a secondary playground.

## Deploy

In [My Models](https://enter.pollinations.ai/my-models), **Add Agent → Code
agent**, set the repository to this GitHub repository, and publish. The
callable model name is derived from the GitHub username and repository name.
