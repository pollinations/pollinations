---
name: quest-contributor
description: Contribute to Pollinations community quests (POLLEN-QUEST issues in pollinations/pollinations) and earn Pollen rewards. Use when asked to find an open Pollinations quest, pick one that fits, submit a PR for it, claim a quest reward, or when working on any issue labeled POLLEN-QUEST. Covers the full loop - discover, choose, claim, build, prove, submit, get paid.
---

# Quest Contributor

Pollinations pays Pollen rewards for merged PRs that solve community quests -
issues labeled `POLLEN-QUEST` in
[pollinations/pollinations](https://github.com/pollinations/pollinations).
This skill teaches an agent the whole loop.

## Rule zero: the issue is the contract

Every quest issue carries a **"How this quest works"** block and acceptance
criteria. Read them first; they override anything here. In particular:

- whether the quest is single-winner or **multi-winner** ("This quest can have
  several winners" - each merged PR earns),
- the exact PR linking keyword it demands (usually the body must start with
  `Fixes #NNNNN`),
- the acceptance checklist - every box is a rejection reason if missing.

## 1. Discover

Open quests:
[label:POLLEN-QUEST state:open](https://github.com/pollinations/pollinations/issues?q=is%3Aissue+state%3Aopen+label%3APOLLEN-QUEST).
With a key, `polli quests` lists your quest states (open / claimable /
claimed). New quests appear without warning - re-check before starting.

## 2. Choose

- Read the comments and the **timeline** for linked PRs. If someone already
  has an open PR, either pick a different quest or make your approach clearly
  distinct - maintainers compare solutions head to head.
- Prefer quests matching what you can *prove*: a code quest needs tests and a
  real run; a media quest needs generated artifacts.
- Smallest correct solution wins. The maintainer review rubric is the
  [quest-solution-review skill](https://github.com/pollinations/pollinations/blob/main/.claude/skills/quest-solution-review/SKILL.md);
  read it to learn exactly how your PR will be judged.

## 3. Claim fast

Quests are competitive and effectively first-merged-wins (unless multi-winner).
Post a short comment stating your approach **before** building, then open a
minimal working PR quickly and harden it with follow-up commits. A polished
late PR loses to a correct early one.

## 4. Build

- Fork, branch, smallest correct change. The repo's
  [Ponytail skill](https://github.com/pollinations/pollinations/blob/main/.agents/skills/ponytail/SKILL.md)
  (repo-internal) encodes the house style: no speculative features, standard
  library first, minimal diff.
- Follow existing patterns in the same directory - reviewers reward code that
  looks like its neighbors.
- `agent.json` configs are **camelCase everywhere** (`systemPrompt`,
  `baseModel`, `mcpServers`); snake_case fails schema validation and has
  killed quest PRs.
- Run `npm run test` and `npx biome check --write` on modified files before
  pushing; both appear in quest acceptance criteria.

## 5. Prove

A claim without evidence loses. Attach what the quest's acceptance criteria
ask for, typically:

- live API calls against the real service (request + response, unique marker
  strings so reviewers can see it is not canned),
- screenshots or a short clip for UI work (light mode, dark mode, phone
  width, if the quest says so),
- the test run output.

If a paid-tier model blocks a live check, say so honestly and give the
maintainer a one-line command to run it - do not fake a transcript.

## 6. Submit

- PR body **starts** with the linking keyword the issue requires
  (`Fixes #NNNNN`), then: what changed, how it was verified, proof links.
- One focused PR per quest; do not bundle fixes.
- Answer review comments fast - stalls get overtaken by competing PRs.

## 7. Get paid

After merge, open [enter.pollinations.ai/quests](https://enter.pollinations.ai/quests),
check quests, and claim the reward if one is pending for you - a merge does
not by itself guarantee a payout; the issue's reward rules decide. Rewards
are keyed to your GitHub account. Maintainers have also paid bonuses for
reusable techniques and thoughtful feedback posted on the quest issue, so
sharing what you learned is worthwhile even when your PR is not selected.

## Standards and discovery

This skill follows the [Agent Skills](https://agentskills.io/specification)
format and is served through the Agent Skills well-known discovery index at
`https://gen.pollinations.ai/.well-known/agent-skills/index.json`
([discovery RFC](https://github.com/cloudflare/agent-skills-discovery-rfc)).
API basics live in the sibling `polli` skill from the same index.
