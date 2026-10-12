# Case 16359
All timestamps UTC. Notes below are append-only and sentinel tagged. Source, prompts, raw logs, test evidence and machine state live beside this chart.

<!-- HOSPITAL:ADMISSION -->
2026-10-12 22:53:47 UTC

Kind: pr
Start: 2026-10-12 22:53:47 UTC
Branch: hospital/16359
Base: 43c9d81f59ebe92f45f2e066fab24609fd06f42f
Source: https://github.com/pollinations/pollinations/pull/16359
fix(play): wait for model metadata before generation
Open PRs that mention this case: none in cache

<!-- HOSPITAL:WORKUP -->
2026-10-12 22:56:08 UTC

# Workup note: Case 16359 (PR #16359, "fix(play): wait for model metadata before generation")

I did not edit anything and ran no tests. The verdict rests on reading the code and on `git apply --check`. No test is needed to reach it.

## Admission
- The PR is open, not a quest, and was written by a collaborator. It fixes issue #16356, which is also open. It is small: 33 lines added and 1 removed across two files, under `pollinations.ai/`. It does not touch the sdk, ui or polli-cli packages, so no version bump applies. No other cached PR mentions it.
- I read PRECEDENTS.md. None of P1–P5 covers a PR whose target file no longer exists.

## Findings
1. **The diff does not apply to base `43c9d81f5`.**
   `git apply --check cache/pr-16359.diff` fails with:
   `error: pollinations.ai/src/ui/components/play/PlayGenerator.tsx: No such file or directory`
   No file named `PlayGenerator` exists anywhere in the base tree (`git ls-files | grep -i playgenerator` returns nothing). The PR edits that file and imports it in its new test. The file's history ends at `5cc4b5114 feat: Play page from website v2 (#16213)`, dated 2026-10-10, which is an ancestor of base. That PR replaced the old component with `pollinations.ai/src/ui/play/Playground.tsx`.

2. **Base already prevents the bug in the replacement component.**
   - `Playground.tsx:1081`: `if (isGenerating || !apiKey || !currentModel || blockedReason) return;` means a selected model with no metadata never dispatches.
   - `Playground.tsx:938-941`: `selectedModelAllowed` requires `!!currentModel`. If it is false, `blockedReason` (`:1219-1220`) is set to "This key cannot use the selected model", which drives the button tooltip and the early return.
   - The dispatch branches are video (`:1098`), image (`:1130`) and audio (`:1143`, which returns at its end). There is no text fallback to `/v1/chat/completions`, so the `flux` → chat-completions path the issue describes does not exist in the current code.
   - One small UX difference remains. The new button uses `aria-disabled` only while generating (`:1783`); this is a deliberate design choice explained in a code comment. While metadata is missing, the button is not visually disabled, but clicking it does nothing. That is a design choice of #16213, not the bug this PR fixes.

3. **Rebasing would not save the PR.** Its test renders a `PlayGenerator` with props (`selectedModel`, `currentModel`, `onLoginRequired`) that no longer exist. Porting it would mean writing a different test against a different component, which this hospital is not allowed to invent for a PR case.

## Plan
Nothing can be implemented here: the cached diff cannot be applied, and the behaviour it adds is already on base. Recommended maintainer action:
- Close #16359 as superseded by #16213, citing `Playground.tsx:1081` and `:938-941`.
- Close #16356 as fixed by #16213, after an optional manual check in the browser.
- If the author still wants Generate to look disabled before the catalog loads, that is a separate UX change and needs a new PR against `Playground.tsx`.

## Risk
Low. Merging is impossible as it stands, and closing the PR loses no behaviour.

VERDICT: CHANGES

<!-- HOSPITAL:HANDOFF -->
2026-10-12 22:56:08 UTC

# Workup note: Case 16359 (PR #16359, "fix(play): wait for model metadata before generation")

I did not edit anything and ran no tests. The verdict rests on reading the code and on `git apply --check`. No test is needed to reach it.

## Admission
- The PR is open, not a quest, and was written by a collaborator. It fixes issue #16356, which is also open. It is small: 33 lines added and 1 removed across two files, under `pollinations.ai/`. It does not touch the sdk, ui or polli-cli packages, so no version bump applies. No other cached PR mentions it.
- I read PRECEDENTS.md. None of P1–P5 covers a PR whose target file no longer exists.

## Findings
1. **The diff does not apply to base `43c9d81f5`.**
   `git apply --check cache/pr-16359.diff` fails with:
   `error: pollinations.ai/src/ui/components/play/PlayGenerator.tsx: No such file or directory`
   No file named `PlayGenerator` exists anywhere in the base tree (`git ls-files | grep -i playgenerator` returns nothing). The PR edits that file and imports it in its new test. The file's history ends at `5cc4b5114 feat: Play page from website v2 (#16213)`, dated 2026-10-10, which is an ancestor of base. That PR replaced the old component with `pollinations.ai/src/ui/play/Playground.tsx`.

2. **Base already prevents the bug in the replacement component.**
   - `Playground.tsx:1081`: `if (isGenerating || !apiKey || !currentModel || blockedReason) return;` means a selected model with no metadata never dispatches.
   - `Playground.tsx:938-941`: `selectedModelAllowed` requires `!!currentModel`. If it is false, `blockedReason` (`:1219-1220`) is set to "This key cannot use the selected model", which drives the button tooltip and the early return.
   - The dispatch branches are video (`:1098`), image (`:1130`) and audio (`:1143`, which returns at its end). There is no text fallback to `/v1/chat/completions`, so the `flux` → chat-completions path the issue describes does not exist in the current code.
   - One small UX difference remains. The new button uses `aria-disabled` only while generating (`:1783`); this is a deliberate design choice explained in a code comment. While metadata is missing, the button is not visually disabled, but clicking it does nothing. That is a design choice of #16213, not the bug this PR fixes.

3. **Rebasing would not save the PR.** Its test renders a `PlayGenerator` with props (`selectedModel`, `currentModel`, `onLoginRequired`) that no longer exist. Porting it would mean writing a different test against a different component, which this hospital is not allowed to invent for a PR case.

## Plan
Nothing can be implemented here: the cached diff cannot be applied, and the behaviour it adds is already on base. Recommended maintainer action:
- Close #16359 as superseded by #16213, citing `Playground.tsx:1081` and `:938-941`.
- Close #16356 as fixed by #16213, after an optional manual check in the browser.
- If the author still wants Generate to look disabled before the catalog loads, that is a separate UX change and needs a new PR against `Playground.tsx`.

## Risk
Low. Merging is impossible as it stands, and closing the PR loses no behaviour.

VERDICT: CHANGES
