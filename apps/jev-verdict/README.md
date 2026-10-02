# Jev Verdict — Ship, Fix or Kill

A static web app where **Jev makes the decision and the app's code executes it.**

Paste a startup idea. Jev (`typesafe/jev-1.13`) answers bounded questions through `POST /alpha/decisions`
— scores novelty / feasibility / demand / differentiation, returns an urgency probability and picks one
verdict (`ship` / `fix` / `kill`) — then this app's code turns those answers into an executed outcome:
a verdict banner, score bars with probabilities and confidence, and a concrete action list.

Users pay with their **own Pollen** through the [Bring your own Pollen](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)
consent flow. No server, no stored keys, no cookies.

## How it works

1. **Connect Pollen** — the app opens the `enter.pollinations.ai/authorize` consent screen. After approval the
   browser receives a scoped `sk_...` key, kept only in `sessionStorage`.
2. **Get Jev's Verdict** — the app calls `POST https://gen.pollinations.ai/alpha/decisions` with the user's idea
   as `state` and six typed questions (4 × `score`, 1 × `noul`, 1 × `choice`), using the user's key:
   ```json
   {
     "state": "<the user's idea>",
     "questions": {
       "novelty":       { "type": "score", "instructions": "...", "criteria": ["completely derivative", "common pattern", "fresh twist", "truly novel"] },
       "feasibility":   { "type": "score", "instructions": "...", "criteria": ["nearly impossible", "hard", "doable", "very easy"] },
       "demand":        { "type": "score", "instructions": "...", "criteria": ["nobody wants it", "weak interest", "clear pull", "strong must-have"] },
       "differentiation": { "type": "score", "instructions": "...", "criteria": ["same as others", "slightly different", "noticeably unique", "unmatched edge"] },
       "urgency":       { "type": "noul",  "instructions": "Should the developer act on this idea today?" },
       "verdict":       { "type": "choice", "instructions": "Pick the best single next action",
                          "criteria": { "ship": "Build and launch it this week", "fix": "Rework the concept, then ship", "kill": "Drop it and move on" } }
     }
   }
   ```
3. **Code executes the decision** — the app maps `verdict.choice` to one of three outcomes and renders it:
   - `ship` → green launch board with a build plan (code generates a 3-step timeline from the scores)
   - `fix` → amber rework board listing the weakest scored dimensions and what to change
   - `kill` → red drop board turning the low scores into a post-mortem
   Score bars show each `score`, `legend`, `probabilities` and `confidence`; the raw request/response JSON is
   always visible under *Decision evidence*. An optional poster can be generated from the verdict.

## Running locally

Just serve the folder as static files (no build step):

```bash
python -m http.server 8080
# open http://localhost:8080
```

## Deploy

This directory is configured for GitHub Pages via the pollinations apps catalog
(`deploy.json`: `target: pages`, subdomain `jev-verdict`). The live app is at
`https://jev-verdict.pollinations.ai`.

## Quest

Submitted for [Quest #15722 — Build an app that uses Jev decisions](https://github.com/pollinations/pollinations/issues/15722)
(Fixes #15722). Real decision-call evidence is included in the PR.
