# Case 17084
All timestamps UTC. Notes below are append-only and sentinel tagged. Source, prompts, raw logs, test evidence and machine state live beside this chart.

<!-- HOSPITAL:ADMISSION -->
2026-10-11 18:41:23 UTC

Kind: pr
Start: 2026-10-11 18:41:23 UTC
Branch: hospital/17084
Base: 953c897635352bdcdc5811c4cb0824566e74f321
Source: https://github.com/pollinations/pollinations/pull/17084
fix(sdk): use pipe delimiter for reference image array in query params

<!-- HOSPITAL:TRIAGE -->
2026-10-11 18:42:44 UTC

Triage note — Case 17084 (PR #17084, `fix(sdk): use pipe delimiter for reference image array in query params`)

**Classification:** A small bug-fix PR to the SDK. It is not a quest (no labels, no POLLEN-QUEST link) and not a draft. It can be checked fully offline.

**Patient summary and evidence**
- `packages/sdk/src/client.ts:353-360`: `buildQueryParams` joins array values with `|` only for `reference_images`, `reference_videos` and `reference_audios`. Every other array, including `image` (from `options.referenceImage`, set at `client.ts:403` for image and `:680` for video), is joined with `,`.
- On the server, `gen.pollinations.ai/src/schemas/image.ts:58-64` splits `image` on `|` when present and on `,` otherwise. So `[a, b]` sent as `a,b` happens to work for plain URLs. But a reference URL that contains a comma gets split into the wrong pieces. The existing guidance test already uses a URL like that (`client.test.ts:645`, `ref,one?size=large`). That makes this a real, user-visible correctness bug, and the pipe delimiter matches the server's preferred separator.
- Cached diff `/home/user/pollinations-hospital/cache/pr-17084.diff`: about 14 lines. It adds `"image"` to the pipe list (1 line), changes the existing frame-image test expectation from `join(",")` to `join("|")` (`client.test.ts:693`), and adds one image-generation test with 2 reference URLs.
- `git apply --check` against base 953c897 printed `APPLIES`.
- Runner: `packages/sdk/node_modules/.bin/vitest` exists, and the package script is `vitest run`. Fast path: `npx vitest run src/client.test.ts` with cwd `packages/sdk`, one file, all mocked fetch, no network or secrets.

**Risks and things the fellow and attending must address**
1. **Changed existing expectation.** `client.test.ts:693` changes `join(",")` to `join("|")`. That assertion is the behavior being fixed, not a weakened test, but the protocol requires a test correction to have its own commit and review. The plan must say how to handle this: either treat it as the intended contract change or split it into its own commit. For the reversal proof: with the production line removed, the new image test and the updated array case should fail with `a,b` received where `a|b` was expected. The other cases should stay green.
2. **Release hygiene gap.** Under AGENTS.md, a PR that changes what `packages/sdk` ships must bump `version` (now `5.1.0-alpha.14`, so `5.1.0-alpha.15`), update `packages/sdk/package-lock.json`, and add a `CHANGELOG.md` entry under `[Unreleased] → Fixed`. The cached diff has none of these. This is likely a REWORK finding at review, and it doesn't block admission.
3. **Test weakness (minor).** The new test's URLs (`ref1.png?v=1`) contain no comma, so it doesn't exercise the comma-in-URL case that motivates the fix. A reviewer may want a URL with a comma in it.
4. **Compatibility.** Server parsing accepts both separators and prefers pipe, so existing callers can't break. Other SDK arrays (`tags`, `models`) keep using `,`. A URL containing a literal `|` would now split wrongly, but `reference_images` already has that limitation. Low risk.

**Scope:** 2 files, under 20 lines. No billing, auth, secrets, Enter tests or live APIs involved. Only the SDK package.

**Next action:** Admit. The fellow plans to apply the cached diff as-is, run the reversal proof on `packages/sdk/src/client.test.ts`, and record the version/CHANGELOG gap and the test-correction commit question for attending review.

VERDICT: APPROVE


<!-- HOSPITAL:PLAN -->
2026-10-11 18:43:50 UTC

Fellow plan note — Case 17084 (PR #17084, `fix(sdk): use pipe delimiter for reference image array in query params`)

**Call path (checked at base 953c897)**
- `packages/sdk/src/client.ts:403` (`image()`) and `:680` (`video()`) pass `options.referenceImage` as the query key `image`.
- `buildQueryParams` (`client.ts:352-358`) joins arrays with `|` only for `reference_images`, `reference_videos` and `reference_audios`. Every other array, including `image`, is joined with `,`.
- On the server, `gen.pollinations.ai/src/schemas/image.ts:58-64` (and `model3d.ts:34`) split `image` on `|` if it is present, otherwise on `,`. So an SDK array like `["…ref,one?…", "…/b"]` currently reaches the server as three wrong URLs. Sending `|` matches what the server prefers and what the other reference keys already use.
- No other SDK caller sends an array under `image` (grep found only lines 403 and 680), so the change is limited to `referenceImage` arrays.

**Alternatives considered**
- (a) Add `"image"` to the pipe list. This is the PR's one-line fix and the smallest correct one.
- (b) Send repeated query params. That needs server changes, so it's out of scope.
- (c) Percent-encode commas inside URLs. The server decodes before splitting, so this wouldn't work.

(a) is the right fix.

**Treatment plan (apply the existing diff, don't invent a new fix)**
1. On `hospital/17084`, keep a pristine copy of `packages/sdk/src/client.ts` and `client.test.ts` under `cases/17084/orig/`.
2. Apply the diff with `git apply /home/user/pollinations-hospital/cache/pr-17084.diff`. `--check` already printed `APPLIES` against HEAD 953c897.
3. Diff scope: 2 files, +14/−1 lines.
   - `client.ts`: 1 added line.
   - `client.test.ts`: one changed expectation at `:693` (`join(",")` → `join("|")`) and one new image-generation test.
4. Reversal proof:
   - Temporarily remove only the `"image",` line from `client.ts` and keep both test changes.
   - Run, with cwd `/home/user/pollinations/packages/sdk`: `npx vitest run src/client.test.ts`. Log to `cases/17084/test-reverted.log`.
   - Expected result: exactly 2 failures, both reporting received `a,b` where `a|b` was expected:
     - the array case of "omits guidance and preserves frame images"
     - the new "serializes multiple reference images using pipe delimiter for image generation"
   - Everything else should stay green.
   - Restore `client.ts` from the saved copy, using trap-style restore so it happens even if the command fails. Rerun the same file and log to `cases/17084/test-green.log`; expect all tests to pass.
   - No network, secrets or VCR are involved: the tests stub fetch with `fetchMock`.
5. Baseline: run the same file once on unmodified base and log to `test-base.log`. This shows which tests were already green.

**The changed existing expectation (`client.test.ts:693`)**
This assertion pins the buggy comma join; it is not a weakened check. After the change it is still an equality check on the exact string, with a different separator. That makes it the contract change the PR is about, not a correction to a faulty test.

I recommend treating it as intended behavior inside the PR's own commit, and having the attending confirm that explicitly. If the attending reads the protocol as requiring a separate commit, split it locally (commit A: `client.ts` plus the `:693` change; commit B: the new test) and get a separate review. No GitHub action is needed either way.

**Findings to carry into review (advisory, not fixed by us)**
1. **Release hygiene gap (likely REWORK at review).** AGENTS.md requires an SDK PR that changes what ships to:
   - bump `packages/sdk/package.json` from `5.1.0-alpha.14` to `5.1.0-alpha.15`
   - update `packages/sdk/package-lock.json`
   - add a `CHANGELOG.md` `[Unreleased] → Fixed` entry (for example: "`referenceImage` arrays are sent pipe-delimited so URLs containing commas are not split").
   
   The diff has none of these. We record it and don't add them ourselves.
2. **Test strength (minor).** The new test's URLs (`ref1.png?v=1`) contain no comma. The reversal proof still discriminates, because `,` versus `|` in the join changes the string. But the motivating comma-in-URL case is never exercised. Suggest the author reuse the `ref,one?size=large` URL from `:645`.
3. **Compatibility.** The server accepts both separators, so there is no breaking change for existing callers. A URL containing a literal `|` would now split, which is the same limitation `reference_images` already has. Low risk.
4. **Scope.** SDK only. No billing, auth, Enter, gen runtime, secrets or live APIs. Not a quest. Data-processing docs are unaffected.

**Risks:** minimal. The only process risk is the `:693` expectation question, which goes to the attending for a decision.

**Line estimate:** +14/−1 as cached. If the author fixes the hygiene items, that rises to about +20 (version, lockfile version fields, one CHANGELOG bullet).

**Runner:** `npx vitest run src/client.test.ts` with cwd `packages/sdk`, one file per command, local `node_modules/.bin/vitest` already present, no installs.

No source edits were made in this stage.

VERDICT: APPROVE


<!-- HOSPITAL:PLAN_REVIEW -->
2026-10-11 18:44:50 UTC

<!-- HOSPITAL:PLAN-REVIEW -->

Plan review — Case 17084

The plan is not approved. The proposed production change is bounded, but the verification procedure contains an error and the existing-test conflict requires a maintainer decision.

- **Confirmed scope:** Clean `hospital/17084`, HEAD `953c897635352bdcdc5811c4cb0824566e74f321`. `git apply --check /home/user/pollinations-hospital/cache/pr-17084.diff` succeeded. The cached patch changes only `client.ts` and `client.test.ts`.
- **Diagnosis supported:** `packages/sdk/src/client.ts:403,680` map `referenceImage` to `image`; `buildQueryParams` currently joins that array with commas. `gen.pollinations.ai/src/schemas/image.ts:58–64` prefers pipe splitting when a pipe exists. Adding `"image"` to the existing separator list addresses multiple-reference arrays containing commas.

**Blockers**

1. **Existing expectation requires separate handling.** The patch changes `client.test.ts:693` from comma to pipe equality. This remains a strong assertion, but it is an existing expectation incompatible with the production change. The [protocol](/home/user/pollinations-hospital/PROTOCOL.md) requires a justified faulty-test correction to receive “its own commit and separate review”; the attending instructions explicitly prohibit accepting an incompatible PR expectation without separately reviewed justification. Calling this a contract change does not resolve that gate. The fellow’s suggested split puts production code and the expectation correction together, so it does not provide the required separation. This session also explicitly prohibits commits.

2. **Restore step would remove the fix.** Step 1 saves the unmodified base; step 4 restores `client.ts` from that saved copy before expecting green. That restores comma serialization. A corrected procedure must save the **patched** production file separately, restore it unconditionally after reversal, and verify the final diff still matches the cached patch. Run baseline before applying the patch.

3. **The proposed runner is not entirely mocked.** `client.test.ts:1777–1823` creates a loopback HTTP server and calls `nativeFetch`. The claim that the whole file involves no network is incorrect. Under the protocol’s instruction to avoid network tests, use a test-name filter selecting the affected reference-media group for baseline/red/green; record the resulting coverage limit without editing or disabling existing tests.

**Additional merge blocker:** The cached patch lacks the required SDK version bump, standalone lockfile update, and changelog entry. Keep this advisory; do not expand the cached implementation locally.

**I-PASS**

- **Severity:** Process blocker; no production incident.
- **Patient:** Small SDK serialization fix with an incompatible existing assertion and an invalid restoration plan.
- **Actions:** Maintainer must resolve the separate-review/commit requirement within this no-commit run; fellow must revise restoration and offline verification steps.
- **Situation/risk:** Proceeding would bypass an explicit test gate and produce a misleading green-test expectation.
- **Synthesis:** Confirm the permitted treatment of the existing assertion before implementation. PRECEDENTS P1–P3 provide no exception.

No files changed; no tests run during this plan-only review.

VERDICT: ESCALATE

<!-- HOSPITAL:HANDOFF -->
2026-10-11 18:44:50 UTC

<!-- HOSPITAL:PLAN-REVIEW -->

Plan review — Case 17084

The plan is not approved. The proposed production change is bounded, but the verification procedure contains an error and the existing-test conflict requires a maintainer decision.

- **Confirmed scope:** Clean `hospital/17084`, HEAD `953c897635352bdcdc5811c4cb0824566e74f321`. `git apply --check /home/user/pollinations-hospital/cache/pr-17084.diff` succeeded. The cached patch changes only `client.ts` and `client.test.ts`.
- **Diagnosis supported:** `packages/sdk/src/client.ts:403,680` map `referenceImage` to `image`; `buildQueryParams` currently joins that array with commas. `gen.pollinations.ai/src/schemas/image.ts:58–64` prefers pipe splitting when a pipe exists. Adding `"image"` to the existing separator list addresses multiple-reference arrays containing commas.

**Blockers**

1. **Existing expectation requires separate handling.** The patch changes `client.test.ts:693` from comma to pipe equality. This remains a strong assertion, but it is an existing expectation incompatible with the production change. The [protocol](/home/user/pollinations-hospital/PROTOCOL.md) requires a justified faulty-test correction to receive “its own commit and separate review”; the attending instructions explicitly prohibit accepting an incompatible PR expectation without separately reviewed justification. Calling this a contract change does not resolve that gate. The fellow’s suggested split puts production code and the expectation correction together, so it does not provide the required separation. This session also explicitly prohibits commits.

2. **Restore step would remove the fix.** Step 1 saves the unmodified base; step 4 restores `client.ts` from that saved copy before expecting green. That restores comma serialization. A corrected procedure must save the **patched** production file separately, restore it unconditionally after reversal, and verify the final diff still matches the cached patch. Run baseline before applying the patch.

3. **The proposed runner is not entirely mocked.** `client.test.ts:1777–1823` creates a loopback HTTP server and calls `nativeFetch`. The claim that the whole file involves no network is incorrect. Under the protocol’s instruction to avoid network tests, use a test-name filter selecting the affected reference-media group for baseline/red/green; record the resulting coverage limit without editing or disabling existing tests.

**Additional merge blocker:** The cached patch lacks the required SDK version bump, standalone lockfile update, and changelog entry. Keep this advisory; do not expand the cached implementation locally.

**I-PASS**

- **Severity:** Process blocker; no production incident.
- **Patient:** Small SDK serialization fix with an incompatible existing assertion and an invalid restoration plan.
- **Actions:** Maintainer must resolve the separate-review/commit requirement within this no-commit run; fellow must revise restoration and offline verification steps.
- **Situation/risk:** Proceeding would bypass an explicit test gate and produce a misleading green-test expectation.
- **Synthesis:** Confirm the permitted treatment of the existing assertion before implementation. PRECEDENTS P1–P3 provide no exception.

No files changed; no tests run during this plan-only review.

VERDICT: ESCALATE

<!-- HOSPITAL:COST_RECONCILIATION -->
2026-10-11 18:46:38 UTC

Final observed snapshot 2026-10-11 18:46:38 UTC. Window 2026-10-11 18:41:23 through 2026-10-11 18:44:50 inclusive. Duration 0:03:27. Claude 0.851762; sandbox orchestrator/reviewer 1.299835; other usage 0.005709; total 2.157305 Pollen. Late billing can revise these figures.
