# Case 17087
All timestamps UTC. Notes below are append-only and sentinel tagged. Source, prompts, raw logs, test evidence and machine state live beside this chart.

<!-- HOSPITAL:ADMISSION -->
2026-10-11 18:36:46 UTC

Kind: feature
Start: 2026-10-11 18:36:46 UTC
Branch: hospital/17087
Base: 953c897635352bdcdc5811c4cb0824566e74f321
Source: https://github.com/pollinations/pollinations/pull/17087
feat(sdk): add videoModels, audioModels, and embeddingModels discovery methods

<!-- HOSPITAL:TRIAGE -->
2026-10-11 18:38:31 UTC

# Triage note: Case 17087 (PR #17087, feature)

**Patient:** `feat(sdk): add videoModels, audioModels, and embeddingModels discovery methods`. The author is Saauf (CONTRIBUTOR, id 128448668). The PR has no labels and isn't a quest. Head commit `91a399b4d` is available locally, and its merge base is `902498e85`.

## Admission criteria

| Check | Finding |
|---|---|
| Small | 5 files, +107/−7 (`git diff --stat 902498e85 91a399b4d`) |
| Non-quest | No `POLLEN-QUEST` label or reference. No quest skill applies. |
| Meaningful | The gen router already serves `/video/models`, `/audio/models` and `/embeddings/models` (`gen.pollinations.ai/src/routes/proxy.ts:579,623,646`). The SDK only covers `/text/models`, `/image/models` and `/models` (`packages/sdk/src/client.ts:1129-1155`). `polli-cli` fetches the audio and embedding lists itself (`packages/polli-cli/src/commands/models.ts:170-177`), which shows there is real demand. |
| Verifiable offline | The tests stub `fetch` with `vi.stubGlobal` (`client.test.ts:85-91`). No network, secrets or Enter vars are needed. |
| Applies to base | I saved the PR diff to `cases/17087/pr-17087.diff`. `git apply --check` against `953c89763` passes (APPLIES_CLEAN). No SDK commits landed between the merge base and the base commit. |

## Files in the PR
- `packages/sdk/src/client.ts`: adds three `getJson` methods, following the same pattern as `textModels` and `imageModels`.
- `packages/sdk/src/helpers.ts`: adds `getVideoModels`, `getAudioModels` and `getEmbeddingModels` wrappers.
- `packages/sdk/src/index.ts`: re-exports the new helpers.
- `packages/sdk/README.md`: updates the example and the helper table.
- `packages/sdk/src/client.test.ts`: turns the single `models()` test into `it.each` over six client methods and six helpers.

## Runner
Run from `cwd=/home/user/pollinations/packages/sdk`:
`npx vitest run src/client.test.ts`
This is one file. The local binary exists at `node_modules/.bin/vitest`, so nothing needs installing.

**Required regression proof for review:** keep the added tests, revert the `client.ts`, `helpers.ts` and `index.ts` changes, and confirm the new cases fail for the intended reason (missing method or export). Then restore the changes and confirm green. The existing cases for `models`, `textModels` and `imageModels` should pass in both states.

## Risk
Low. The change is additive public API on a prerelease SDK, with no auth or billing paths touched.

## Gaps for fellow/attending (not admission blockers)
1. **No version bump or CHANGELOG entry.** `AGENTS.md` says a PR that changes what `packages/sdk` ships must bump the version (currently `5.1.0-alpha.14`, so next would be `5.1.0-alpha.15`). That includes `packages/sdk/package-lock.json` and an `[Unreleased] ### Added` entry in `CHANGELOG.md`. Without the bump, CI won't publish the change. Review should flag this as a finding. Per protocol, a PR case applies the cached diff, so this is advisory rather than a silent fix.
2. **Image/video overlap.** `/image/models` also returns video models (`proxy.ts:561-563`, "Video models are included here"). The new `imageModels` docs don't need to change, but the README could mention it. This is optional.
3. **Test rewrite.** The PR replaces the existing `"returns the model array from the registry endpoint"` test with a parametrized version. It covers the same assertion for `models()` (the URL check and `toEqual` on the array), but with different fixture data. That's a structural rewrite, not a weakening. The attending should confirm this.
4. **Formatting.** Biome formatting of the new `it.each` titles hasn't been checked yet: run `npx biome check` on the changed files during review.

## Fast path
Trivial case. Steps:
1. Short fellow plan: apply `cases/17087/pr-17087.diff` as-is.
2. Attending approves.
3. Apply the diff.
4. Run the single-file vitest before and after the temporary reversal, plus Biome on the changed files.
5. Advisory review that records gaps 1–4.

No escalation is needed. No precedent is involved: the case is offline, non-quest, needs no secrets and is well under 1,000 lines.

VERDICT: APPROVE


<!-- HOSPITAL:PLAN -->
2026-10-11 18:39:45 UTC

# Fellow plan: Case 17087 (PR #17087, feature)

## Patient
This PR adds `videoModels()`, `audioModels()` and `embeddingModels()` to the SDK's `Pollinations` client. It also adds the matching `getVideoModels`, `getAudioModels` and `getEmbeddingModels` helpers and re-exports them. The cached diff is `cases/17087/pr-17087.diff`: 5 files, +107/−7.

## Call path (verified)
- **Gen routes already exist:**
  - `/video/models`, `/audio/models` and `/embeddings/models` live in `gen.pollinations.ai/src/routes/proxy.ts`, roughly lines 579–660.
  - Each one returns `ModelInfoListSchema` through `modelsListHandler`, the same contract as `/text/models` and `/image/models`.
  - This is not a new API. It closes a gap in SDK coverage.
- **SDK client today:** `packages/sdk/src/client.ts:1129-1155` only has `textModels`, `imageModels` and `models`. Each is a single-line `this.getJson<ModelInfo[]>(url)`.
- **The new methods copy that pattern exactly:** same `getJson` call, same `ModelInfo[]` type, same JSDoc shape. `ModelInfo` (`types.ts:1121`) already has an index signature, and it carries fields that matter for video, audio and embeddings (`video_capabilities`, `output_modalities` and others). No type changes are needed.
- **Helpers** (`helpers.ts:357-375`) are one-line `getClient().x()` wrappers. The new ones match. The `index.ts` re-exports are alphabetical and slot in correctly.
- **The demand is real:** `packages/polli-cli/src/commands/models.ts` fetches `/audio/models` and `/embeddings/models` by hand. This PR does not change that. It is an optional follow-up, out of scope here.

## Alternatives considered
1. **One generic `modelsFor(kind)` method.** Rejected: it breaks the established per-modality API and adds an abstraction nobody needs.
2. **Tell consumers to filter `/models`.** Rejected: it ignores the server-side per-endpoint filtering, and the endpoints already exist.
3. **The PR as written.** This is the smallest correct option: three methods, three helpers and three exports, with no new logic.

## Treatment
Apply the cached diff as-is. Do not fix or extend it.
```
git -C /home/user/pollinations apply /home/user/pollinations-hospital/cases/17087/pr-17087.diff
```
`git apply --check` against base `953c89763` printed `APPLIES`. Commits touching `packages/sdk` since the PR's merge base (`5fff83114`, `65734c33f`, `3f5794655`) don't conflict.

Files touched:
- `packages/sdk/src/client.ts` (+39)
- `packages/sdk/src/helpers.ts` (+21)
- `packages/sdk/src/index.ts` (+3)
- `packages/sdk/README.md` (+7/−1)
- `packages/sdk/src/client.test.ts` (+37/−6)

Estimated size: about 107 added and 7 deleted lines. That is far below the 1,000-line decomposition threshold.

## Regression behaviour and evaluation
Run from `cwd=/home/user/pollinations/packages/sdk`:
`npx vitest run src/client.test.ts` (single file, offline, `fetch` stubbed with `vi.stubGlobal` at `client.test.ts:89-91`)

1. **Red proof:** apply the diff. Copy the original `client.ts`, `helpers.ts` and `index.ts` to the case folder. Temporarily restore those three files to their base versions and keep the new tests. Expected result:
   - the 3 new `client.%s` cases fail with `client[method] is not a function`;
   - the 3 new `helper %s` cases fail because the import is undefined (`helper is not a function`);
   - the `models`, `textModels`, `imageModels`, `getModels`, `getTextModels` and `getImageModels` cases pass.
   - Restore the files even if a command fails.
2. **Green proof:** with the full diff in place, the whole file passes. Save logs under `cases/17087/`.
3. **Type and format checks:**
   - `npx biome check` on the 4 changed `.ts` files, read-only. The `it.each` titles and the long helper rows may need reformatting. Record this as an advisory finding and do not fix it.
   - `npx tsc --noEmit -p .` if it is cheap. It checks that the `as const` tuple indexing `client[method]()` type-checks.

## Risks and advisory findings for review
1. **No version bump or CHANGELOG (most important).** AGENTS.md requires a PR that changes what `packages/sdk` ships to bump its `version`. It is currently `5.1.0-alpha.14` and should become `5.1.0-alpha.15`, with `packages/sdk/package-lock.json` updated too. It also needs a `CHANGELOG.md` `[Unreleased] ### Added` entry. Without the bump, CI won't publish. Flag this as a required change for the author. Don't add it here.
2. **The existing test was rewritten.** The `"returns the model array from the registry endpoint"` test became `it.each`. The `models()` row keeps the same assertions: the `toEqual` on the resolved array and the exact URL. Only the fixture changed (`openai` became `test-model`). This is coverage-equivalent, not weakened. The attending should confirm.
3. **Image and video overlap.** `/image/models` also returns video models (proxy.ts description). The README could mention this, but it is optional.
4. **Public API surface.** The change is purely additive and touches no auth or billing paths. No React hooks wrap model discovery (grep found no consumers outside `helpers.ts`), so nothing else needs updating.
5. **No `Fixes #` link** in the PR body. This is minor.

## Gaps
- No live API verification, per P1.
- polli-cli is not migrated to the new helpers. That would be a separate change.

No precedent or escalation is needed: the case is offline, non-quest, needs no secrets and is small.

VERDICT: APPROVE


<!-- HOSPITAL:PLAN_REVIEW -->
2026-10-11 18:41:01 UTC

<!-- HOSPITAL:PLAN-REVIEW -->

Plan approved for applying and evaluating the cached PR diff. This is not merge approval.

- **Scope verified:** clean `hospital/17087` branch at `953c897635352bdcdc5811c4cb0824566e74f321`. `git apply --check /home/user/pollinations-hospital/cases/17087/pr-17087.diff` exited 0. The five-file change is bounded and additive.
- **Contract verified:** `gen.pollinations.ai/src/routes/proxy.ts:579,623,646` exposes the exact video, audio and embeddings paths used by the patch, with `ModelInfoListSchema` responses. Existing CLI callers use the audio and embeddings endpoints (`packages/polli-cli/src/commands/models.ts:170,176`).
- **Implementation approach:** the new methods reuse `getJson` (`packages/sdk/src/client.ts:325`), preserving authorization headers, timeout handling and HTTP error handling. Helpers follow the existing singleton-client pattern. The cached `index.ts` additions export all three helpers. No provider, billing or model-routing change is needed.
- **Existing expectations preserved:** the parametrized replacement retains the original `models()` resolved-array and exact-URL assertions. Changing the model fixture does not weaken that contract.
- **Regression procedure:** retaining patched tests while restoring the three production files to the base provides meaningful missing-method/helper failures. Save the **patched** production contents before reversal and restore them in `finally`. Require the six new cases to fail for the intended reasons, existing discovery cases to pass, and restored production code to pass. Missing red/green evidence blocks subsequent implementation approval.

Two verification qualifications:

- The entire test file is **not entirely fetch-stubbed**: `client.test.ts:1777–1823` starts a loopback HTTP server and invokes native fetch. It remains offline, but the runner must distinguish this local fixture from prohibited live API verification.
- Helper tests import `helpers.ts`, while the `index.ts` import is type-only. They do not demonstrate public runtime exports. Those exports are present in the cached diff; record their static inspection separately rather than claiming the regression cases cover them.

**Outstanding merge blocker — I-PASS**

- **Severity:** release blocker; local evaluation may proceed.
- **Patient/evidence:** the patch changes shipped SDK functionality but leaves `packages/sdk/package.json:3` at `5.1.0-alpha.14` and omits lockfile/version and changelog updates.
- **Action:** retain this finding for the author; do not silently extend the cached diff.
- **Situation/risk:** repository release requirements remain unmet; publishing skips an already published version.
- **Synthesis:** the receiving maintainer must confirm the required version, corresponding package lock update and changelog entry before merge.

No files were modified and no tests were run during this plan-review stage.

VERDICT: APPROVE

<!-- HOSPITAL:HANDOFF -->
2026-10-11 18:41:09 UTC

Precedents checked P2. I-PASS: budget stop; preserve branch; no further models; maintainer may resume under a new budget.

<!-- HOSPITAL:COST_RECONCILIATION -->
2026-10-11 18:46:38 UTC

Final observed snapshot 2026-10-11 18:46:38 UTC. Window 2026-10-11 18:36:46 through 2026-10-11 18:41:09 inclusive. Duration 0:04:23. Claude 1.422728; sandbox orchestrator/reviewer 1.817188; other usage 0.005692; total 3.245609 Pollen. Late billing can revise these figures.
