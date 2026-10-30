# Case 17085
All timestamps UTC. Notes below are append-only and sentinel tagged. Source, prompts, raw logs, test evidence and machine state live beside this chart.

<!-- HOSPITAL:ADMISSION -->
2026-10-11 18:32:43 UTC

Kind: bug
Start: 2026-10-11 18:32:43 UTC
Branch: hospital/17085
Base: 953c897635352bdcdc5811c4cb0824566e74f321
Source: https://github.com/pollinations/pollinations/issues/17085
polli gen audio --help example fails: --voice callum is rejected by the default model

<!-- HOSPITAL:TRIAGE -->
2026-10-11 18:34:29 UTC

## Triage note: Case 17085

**Kind:** bug (issue, not a PR). It isn't a quest: the issue has no labels and no POLLEN-QUEST reference.
**Size:** trivial, a one-line help-text fix plus one regression test.
**Admission:** APPROVE for the fast path.

### Patient summary
`polli gen audio --help` shows this example with no `--model`:
```
echo "the sky today" | polli gen audio --voice callum --play
```
The API rejects it with 400 Bad Request. Without a model it uses `openai/tts-1`, and that model only accepts alloy, echo, fable, onyx, nova and shimmer. `callum` is an ElevenLabs voice.

### Evidence (read offline at base 953c897)
- **The example string:** `packages/polli-cli/src/commands/gen/audio.ts:85`, inside `.addHelpText("after", ...)`.
- **The default model:** `shared/registry/audio.ts:313` sets `DEFAULT_AUDIO_MODEL = "openai/tts-1"`. The comment above it says requests without a model must work on Quest Pollen.
- **The default model's voices:** `shared/registry/audio.ts:799` lists `voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]` for `openai/tts-1` (aliases `tts-1`, `tts`; `paidOnly: false`).
- **callum is ElevenLabs only:** `shared/registry/audio.ts:42` maps `callum` to an ElevenLabs voice ID. The ElevenLabs models are `paidOnly: true`. `elevenlabs/eleven-v3` has the alias `elevenlabs` (line 384).
- **The rest of the docs already use tts-1 voices.** `packages/polli-cli/README.md:64` and `packages/polli-cli/SKILL.md:107-108` use `--voice nova`, so the help text is the only outlier. No other `callum` reference exists in the CLI sources.
- **Same class of bug as before:** #16833, fixed by 57e9d7481 ("let the API pick the default voice for gen audio").

### Fast path
1. **Fix:** in `audio.ts:85`, change `--voice callum` to `--voice nova`. This matches the README and SKILL.md and keeps the example usable on Quest Pollen. Adding `--model elevenlabs` would make the copied example paid-only and contradict the default-model comment, so I recommend against it.
2. **Regression test:** extend the existing `packages/polli-cli/src/commands/gen/audio.test.ts`; don't create a new file. One way is to assert that `createAudioCommand().helpInformation()` doesn't contain `callum`. A stronger way is to assert that every `--voice X` in the help examples that has no `--model` is in the `openai/tts-1` voice list from `shared/registry/audio.ts`. The fellow should first check whether polli-cli can import `shared/` (grep found no current imports). If it can't, use a literal assertion like `chat.test.ts:188`, which already tests `helpInformation()`.
3. **Runner:** from `packages/polli-cli`, run one file only: `npx vitest run src/commands/gen/audio.test.ts`. It needs no network, secrets or VCR, because the help text renders locally and the existing tests mock `fetch`.
4. **Gate:** temporarily revert the `audio.ts` change and confirm the new test fails because the help text contains callum. Then restore it and confirm green.

### Risks and open points
- **Risk:** very low. Only help text changes; API behaviour, billing and auth are untouched.
- **Version bump:** AGENTS.md says a PR that changes what `packages/polli-cli` ships must bump its `version` (currently `0.1.40`) and its own `package-lock.json`. Help text ships, so the fellow plan should say whether it includes a 0.1.41 bump. The repo has handled this before as a separate release commit (4b6d9e889), so leaving the bump out of this change is fine as long as the plan says so.
- **Possible duplicate PR:** the reporter says they "will open a PR". None is cached, so this case is handled as a bug fix. If a PR shows up, prefer it to avoid duplicate work.
- **No other docs need editing:** README and SKILL.md already show working examples.

No escalation is needed, and no precedent applies beyond P1–P3. The work is offline, uses no secrets and makes no GitHub writes.

VERDICT: APPROVE


<!-- HOSPITAL:PLAN -->
2026-10-11 18:36:17 UTC

## Fellow plan: Case 17085 (bug, trivial)

**Base:** `953c897635352bdcdc5811c4cb0824566e74f321`, verified with `git log -1`. **Branch:** `hospital/17085` (clean).

### Diagnosis (checked offline)
- **Where the example lives.** It is in `packages/polli-cli/src/commands/gen/audio.ts:85`, inside the `.addHelpText("after", …)` string: `echo "the sky today" | polli gen audio --voice callum --play`. It passes no `--model`.
- **Why it fails.** The API falls back to `DEFAULT_AUDIO_MODEL = "openai/tts-1"` (`shared/registry/audio.ts:313`). That model only accepts the voices alloy, echo, fable, onyx, nova and shimmer (`audio.ts:799`). `callum` is ElevenLabs-only, and the ElevenLabs models are `paidOnly: true`.
- **It is the only outlier.** `grep -rn callum src README.md SKILL.md` finds only `audio.ts:85`. README and SKILL.md already use `--voice nova`.
- **Two ways to fix it:**
  - **(A)** Use `--voice nova`. The example keeps working on the free default model on Quest Pollen, and it matches the README and SKILL.md. **Chosen.**
  - **(B)** Add `--model elevenlabs`. The copied example would then become paid-only, which goes against the default-model comment. Rejected.

### Test-design finding (important)
In commander, `helpInformation()` does **not** include `addHelpText("after")` content. A probe run under commander 12.1.0 (hoisted at the repo root) printed:
```
helpInformation has it: false
outputHelp has it: true
```
So a test like `expect(helpInformation()).not.toContain("callum")` would pass even before the fix. It would be a vacuous regression test. The pattern in `chat.test.ts:188` only works there because it checks option text, which `helpInformation()` does include.

The test must capture `outputHelp()` through `configureOutput({ writeOut })`. `src/lib/output.test.ts:24` already uses `configureOutput`, so this follows an existing pattern.

### Treatment
1. **`packages/polli-cli/src/commands/gen/audio.ts:85`:** change `--voice callum` to `--voice nova`. One line.
2. **`packages/polli-cli/src/commands/gen/audio.test.ts`:** add one `it` to the existing file.
   - Build the command and capture its full help:
     ```ts
     const cmd = createAudioCommand();
     let help = "";
     cmd.configureOutput({ writeOut: (s) => { help += s; } });
     cmd.outputHelp();
     ```
   - For each example line that contains `--voice` but no `--model`, assert the voice is one of the voices the default model accepts: alloy, echo, fable, onyx, nova, shimmer.
   - Also assert that at least one such line exists. Otherwise the loop could pass without checking anything.
   - Do not import from `shared/`. No polli-cli source imports from it today, and adding a cross-package import is out of scope.
   - About 15 lines.
3. **Version bump to 0.1.41**, in two files:
   - `packages/polli-cli/package.json` (`version`).
   - `packages/polli-cli/package-lock.json`, lines 3 and 9.

   Reason: AGENTS.md requires a bump when shipped content changes, and the help text ships. Triage said a separate release commit was acceptable, but the closest precedents bumped in the fix commit itself: #16837 (same file, same class of bug) and #16904. So I include it here. It is a 4-line change with no install, edited by hand to match how #16837 did it.

**Estimate:** about 20 added and 4 deleted lines across 4 files.

### Runner and gate
- **Baseline (already run):** `cd packages/polli-cli && npx vitest run src/commands/gen/audio.test.ts`. Result: `Test Files 1 passed (1) / Tests 11 passed (11)`.
- **Red:** with the new test added and `audio.ts:85` temporarily set back to `callum`, run the same single file. Expect exactly the new test to fail, with the assertion naming `callum`. Keep a copy of the original file and restore it even if the command fails.
- **Green:** with the fix restored, the same command should report 12 tests passing.
- **Logs:** save commands and output to `/home/user/pollinations-hospital/cases/17085/tests.log`.
- **Formatting:** run `npx biome check --write` on the two edited `.ts` files.

### Risks
- **Very low.** Only help text, a test and the version number change. API behaviour, auth and billing are untouched.
- **The test hardcodes the default model's voice list.** It is an intentional contract check on the examples. If `DEFAULT_AUDIO_MODEL` changes, the test fails loudly, which is the behaviour we want. It is not mutable-catalog drift.
- **Possible duplicate PR.** The reporter said they would open a PR, and none is cached. If one appears, prefer it.
- **Release coordination.** If another polli-cli change also takes 0.1.41 first, this bump needs rebasing.

No escalation is needed. The work is offline, needs no secrets and makes no GitHub writes. P1–P3 are respected.

VERDICT: APPROVE


<!-- HOSPITAL:PLAN_REVIEW -->
2026-10-11 18:36:38 UTC

Missing final note

<!-- HOSPITAL:HANDOFF -->
2026-10-11 18:36:38 UTC

Precedents checked P1-P3. I-PASS: stage stopped; Case exceeded 3 Pollen; inspect stage log; preserve branch; receiver must restate blocker.

<!-- HOSPITAL:COST_RECONCILIATION -->
2026-10-11 18:46:38 UTC

Final observed snapshot 2026-10-11 18:46:38 UTC. Window 2026-10-11 18:32:43 through 2026-10-11 18:36:38 inclusive. Duration 0:03:55. Claude 1.723516; sandbox orchestrator/reviewer 1.482797; other usage 0.005694; total 3.212007 Pollen. Late billing can revise these figures.
