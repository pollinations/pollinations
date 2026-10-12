# Run 4 (2026-10-12, 22:31–22:56 UTC)

Two PR cases:
- One was discharged in a single pass.
- One closed as changes requested after the workup, because its target file
  no longer exists.

Dry run: nothing was posted to GitHub. After the run the box was killed; its
records were copied first.

## What changed from run 3

- No harness change. This run tests the iteration 3 harness on fresh cases.
- Before admission, the operator dropped three of the four candidates:
  - #17204 is a quest submission.
  - #17043 is superseded by #17058, where a maintainer verified the limit.
  - #17207 merged before the run.

  #16920 and #16359 replaced them.
- The account's paid balance was checked before the run (about 94 paid
  Pollen), as run 3's lessons asked.
- Settings:
  - Key budgets: Claude 6, Codex 4.
  - `trial_limit` 10, `case_limit` 8, `max_cases` 2.

## Cases

| Case | Kind | Stages | Outcome | Pollen |
|---|---|---|---|---:|
| [#16920](cases/16920/CHART.md) | PR: GPT Image fails over to the sibling Azure region on 401/402/403 | workup, plan review, implement, review, discharge | discharged | 5.06 |
| [#16359](cases/16359/CHART.md) | PR: Play waits for model metadata before generating | workup | changes requested | 1.02 |

**#16920: discharged in one pass.**

- **Workup** traced the changed predicate, `isGPTImageRefusedByAzure`, to its
  two callers:
  - the region loop in `callGPTImage`;
  - the OpenAI-direct fallback in `handler.ts:293`.

  It confirmed three things:
  - a real moderation refusal stays terminal;
  - Azure's resource-block wording still counts as a refusal;
  - 408, 5xx and 524 stay terminal.

  It predicted which tests fail without the fix.
- **Plan review** (Codex) approved, and named the three test-table expansions
  as intended contract changes.
  - Caveat: `TEST_VCR_MODE=replay-only` does not block the network.
    `shared/test/mocks/fetch.ts` passes unmatched hosts to the real `fetch`.
  - So the fellow had to check that every host the filtered tests contact is
    mocked.
- **Implement** applied the diff unchanged.
  - Red, with the fix removed and the new tests kept:
    - routing tests: 7 failed and 22 passed, exactly the seven predicted;
    - worker test: the Azure 403 case failed with 502 instead of 200.
  - Green: 29/29 routing tests and 3/3 worker fallback cases.
  - Biome passed on all 3 files.
  - The only URL in the logs is the worker's own incoming request.
- **Review** (Codex) reproduced the same red and green results in its own
  logs. It found no blocker.
- **Discharge** checked 14 items against the logs and the diff; all passed.
  - Minor finding: the implement and review logs show `npx vitest run …`
    without the `TEST_VCR_MODE` variable, because `run-test` logs only the
    command after `--`. The workup's log put `env TEST_VCR_MODE=…` after `--`
    and so shows it.
- Would we be embarrassed to merge? No: one predicate, one status list and
  regression tests.
- Open product question, raised at workup and kept through discharge:
  failing over on 401/402 can hide a bad or unpaid key in one region behind
  the healthy sibling. `logError` still records each regional failure.
- Stage costs:

  | Stage | Pollen |
  |---|---:|
  | workup | 1.33 |
  | plan review | 0.99 |
  | implement | 0.75 |
  | review | 1.34 |
  | discharge | 0.65 |

**#16359: changes requested at workup.**

- The diff does not apply. #16213 (2026-10-10) deleted the component it
  edits, `PlayGenerator.tsx`, and replaced it with
  `pollinations.ai/src/ui/play/Playground.tsx`.
- Base already contains the fix: `Playground.tsx:1081` returns early when
  `currentModel` is missing, and the new code has no text fallback for the
  issue's `flux` → chat-completions path.
- The PR's test renders props that no longer exist. Porting it would mean
  writing a new test, which the hospital may not do for a PR case.
- Recommended maintainer action: close #16359 as superseded by #16213. Then
  close #16356 after a manual check in the browser.
- The operator checked the deleted file and `Playground.tsx:1081` on
  `origin/main`.

## Cost

| Key | Run 4 |
|---|---:|
| Claude roles (`polli-harness-claude-code`) | 3.76 |
| Codex (the sandbox's login key) | 2.32 |
| Box time (one resume with an hour paid in advance) | ~0.1 |
| **Total** | **~6.2** |

The model figures come from the server's key balances (Claude 6 → 2.24,
Codex 4 → 1.68). The driver's ledger matches them to the cent.

## Lessons

- #16920 is the third discharge in four runs. Without a rework it cost 5.06,
  against 3.69 for run 2's #16717 and 8.00 for run 3's #17045.
  - Codex was 2.32 of it: its review ran four test commands, against two for
    run 2's review.
- Two of the four candidates were already stale before admission, and a
  third PR was stale on base. Admission should run `git apply --check`. It is
  free, like the version-bump check, and would have closed #16359 without
  the 1.02 workup.
- Plan review again added a real safety condition: replay-only VCR mode does
  not block the network.
- `run-test` should log the environment variables that change test behaviour,
  or roles should pass them with `env` after `--`.
- No stage hit the time limit, so partial notes are still covered only by
  the offline test.
