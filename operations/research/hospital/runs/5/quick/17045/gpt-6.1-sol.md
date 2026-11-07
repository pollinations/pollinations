## Recommendation: merge #17057

Both PRs reject explicitly requested non-1024×1024 dimensions before calling InferencePort. #17057 additionally enforces the constraint in `ImageParamsSchema` and tests omitted dimensions, explicit 1024×1024, and width-only/height-only invalid requests.

### Blockers requiring a diff change
- **#17057: none found.**
- **#17045: formatting fails.** The added parameterized test at `gen.pollinations.ai/test/image/inferencePortImageModel.test.ts:175` needs Biome formatting. The focused check exited **1** with “Formatter would have printed the following content.” CI checks for formatting changes in `.github/workflows/ci-pull-request-checks.yml:122`.

### Evidence
| Check | #17045 | #17057 |
|---|---:|---:|
| Adapter and parameter tests | 43/43 passed | 47/47 passed |
| Biome on changed files | Failed | Passed |

- Each diff was applied and tested independently against the scratch checkout. Every check used the required `hospital.py run-test` wrapper.
- Both preserve omitted-dimension requests and reject invalid explicit dimensions before credential lookup, safety checks, or provider fetch.
- #17057’s schema validation is narrowly scoped to Lightning Image Turbo; other models’ dimension handling is unchanged.
- Correction to my earlier note: explicitly sized edits already skip the reference-image dimension probe (`gen.pollinations.ai/src/image/handler.ts:363`). #17057 moves validation earlier, but does **not** save that download compared with #17045.

### Questions for the maintainer
- **None blocking.** This recommendation assumes the existing adapter’s documented 1024×1024-only constraint is authoritative. Provider documentation and issue/PR discussions were not verified under the offline restriction.

The scratch working tree was restored clean. No commits, installs, secret changes, or external writes were made.

VERDICT: APPROVE