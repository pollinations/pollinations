# Weaver · Project Manager

The organizer currently uses the [direct classifier policy](baseline-prompt.md) for opened items and manual backfills. Weaver’s [candidate policy](system-prompt.md) covers Area, Type, Priority and Model work. The GitHub workflow validates classifications and owns the writes.

The shared owner is `polli@pollinations.ai`, linked to GitHub user `pollinations-ai`. The organizer’s existing inference key authenticated as that user and invoked an existing private agent with no tools. The paired Chat Completions probe returned HTTP 400 with JSON mode and HTTP 200 with a JSON object when the option was omitted. [Owner check](https://github.com/pollinations/pollinations/actions/runs/46027018143) · [Transport probe](https://github.com/pollinations/pollinations/actions/runs/46027402093)

Edit classification policy in `system-prompt.md`. After editing, regenerate the CLI-ready manifest with `bash apps/agent-weaver/config.sh assemble > /tmp/weaver-agent.json && cp /tmp/weaver-agent.json apps/agent-weaver/agent.json`. CI checks that the committed manifest and the assembled configuration are identical.

## Register and verify

Use the authorized owner session with `account:keys` and the reviewed manifest commit on `main`. Run these commands from the repository root. Record the source commit, listing ID, callable model and normalized prompt SHA-256 in the release evidence.

```bash
set -euo pipefail
git rev-parse HEAD
config=$(mktemp)
trap 'rm -f "$config"' EXIT
bash apps/agent-weaver/config.sh assemble > "$config"
jq -jr .systemPrompt "$config" | shasum -a 256
listing=$(polli --json agents create --config "$config")
id=$(jq -er .id <<<"$listing")
model=$(jq -er .model <<<"$listing")
printf 'Listing %s, callable model %s\n' "$id" "$model"
polli --json agents get "$id" | bash apps/agent-weaver/config.sh verify "$id" "$model"
```

For updates, use `polli --json agents update "$id" --config "$config"` on the original listing and repeat the authenticated readback. The verifier compares the stored prompt, listing and callable IDs, metadata, base model, visibility and tools. If the inference key cannot read settings, use the authorized owner session for readback. A missing or mismatched readback blocks release. Keep the direct classifier selected while updating the listing.

## Evaluate

Run **Repo / Organize issues and PRs** from the source revision under review and select a Weaver preview. Each run records the model, prompt and case digests, per-field differences, timings, token usage and catalog cost estimates in the Actions artifact. Preview reads frozen item evidence and skips the writer.

### Cutover rule

**The candidate passes when it scores at least as many exact matches as the original direct classifier on paired fresh runs. Ties pass.** An exact match requires the expected Area, Type, Priority and Model work, including nulls. Apply this comparison separately to the scored development cases and the frozen holdout. Both sets must pass. A single miss affects the count. Diagnostic-only cases stay visible and contribute no points.

The **shortened** and **hosted** release previews use this same rule. Each takes three fresh answers per arm per item, interleaves the original and candidate calls on identical evidence, and records both denominators and scores in the run summary and artifact. The original uses the baseline brief and JSON mode. The shortened arm uses the frozen candidate policy directly with JSON mode. The hosted arm sends only item facts to the verified private agent, omits JSON mode, and validates its returned fields. Missing pairs, cached or repeated completions, malformed answers and unavailable trials prevent a pass, including on diagnostic cases.

This gate compares observed accuracy in a finite sample. The five holdout items have now been seen. Keep the candidate prompt frozen through hosted evaluation. If the prompt changes again, reserve new unseen items and freeze their expected fields before scoring the revision.

- **baseline** runs the [development cases](classification-cases.json) with the original policy alone. The [calibration record](calibration.json) preserves the original misses and exclusions.
- **compare-misses** interleaves ten fresh direct calls per arm for the disputed cases. **compare-holdout** interleaves three per arm for each [held-out item](holdout-cases.json). These runs report field-level disagreements for investigation.

## Activate and observe

1. Land the reviewed manifest on `main` while the organizer and its documentation point to the baseline. Register from that commit, save the IDs and prompt digest, and run authenticated readback as described above.
2. Verify the shortened release preview passes, then run the hosted release preview with the organizer's inference credential and the callable ID from readback. Require both paired gates to pass on the frozen prompt and cases before activation.
3. After approval, use a separate activation PR to set the organizer job's `WEAVER_MODEL` environment value to the exact verified callable ID. Update the policy links in `AGENTS.md`, the issue-maker skill and the operations guides in the same commit. The current workflow ignores a repository variable of that name. Manual backfills continue to use the direct model.
4. Have the release owner watch the first newly opened issue and PR through completion. Inspect the actual Dev fields, preservation of populated fields, and eligible reward announcement. On failure, revert the activation commit to restore the direct classifier and its documentation. Rerun a missed opening announcement from its original opening event.
5. After those live checks succeed, remove the one-time owner-check job, its `check_weaver_owner` and `probe_model_digest` inputs and `probe_agent.py`. Keep the preview for future policy edits. For subsequent policy releases, read back the updated listing and run the hosted preview before accepting the change.

The first holdout was reserved at `f4ebb023e6`. Within the most recent 100 issues and 100 PRs opened November 5–20, 2026, we excluded training sources, bot accounts and routine submissions, quests, censuses and promotions. We sorted eligible IDs by the SHA-256 of `0d56352a95:<number>` and took three issues and two PRs. The candidate was frozen at `ce9c2a852c` before the cases were labeled. The fixtures contain public source snapshots or summaries and proposed expected fields for maintainer review.

## Repeated comparisons, November 27

Each cell is exact matches across Area, Type, Priority and Model work. Both direct prompts ran ten times per case in each comparison. Each comparison had its own baseline sample.

| Case | Original | Candidate at `0d56352a95` | Original rerun | Revised candidate |
| --- | ---: | ---: | ---: | ---: |
| #12870, blank dashboard model table | 10/10 | 8/10 | 9/10 | 10/10 |
| #19013, newly registered agent briefly unavailable | 9/10 | 8/10 | 9/10 | 10/10 |

The dashboard misses were High instead of Medium. The agent misses were Community models instead of Agents & agent tools. Ten trials per arm leave uncertainty about the underlying rates. [Reviewed prompt comparison](https://github.com/pollinations/pollinations/actions/runs/46032692571) · [Revised prompt comparison](https://github.com/pollinations/pollinations/actions/runs/46033143088)

On five held-out items with three trials per item, the original matched 12/15 and the revised candidate matched 14/15. All differences came from #19893, a hosted-agent metadata edit that failed after its base model became unavailable. The original chose Community models on all three trials and the candidate chose it once. Both matched every field on the other four items. The expected fields are proposed references. These results cover five distinct items. [Holdout comparison](https://github.com/pollinations/pollinations/actions/runs/46033134684)

The complete revised development preview matched 38/39 scored answers and 12/15 diagnostic answers. The scored miss rated CLI device login High instead of Medium despite working token login (#17867). All three diagnostic misses concerned the classification of the model-specific failure in #19529. The prompt remains frozen for review. All 164 calls across the four runs returned distinct, uncached completions. [Development preview](https://github.com/pollinations/pollinations/actions/runs/46033149799)

## Initial evaluation evidence

The original direct classifier qualified 14 of 18 frozen cases on three independent generations per case. The calibration record keeps the four exclusions, their trial numbers and their field differences. Earlier cached trials are retained as diagnostics. [Baseline](https://github.com/pollinations/pollinations/actions/runs/46029736886) · [Replacement Update case](https://github.com/pollinations/pollinations/actions/runs/46030181660)

The first independently scored shortened prompt matched 40 of 42 answers. On one trial each, issue #18704 landed in API & reliability and PR #13677 received Bug. All priority and queue answers matched. The next prompt clarifies account sign-in failures and the work type for routine price maintenance. The fixtures and scored set are identical. [Shortened-prompt results](https://github.com/pollinations/pollinations/actions/runs/46030363547)

The second direct preview corrected both previous misses. Two of the three CLI device-login trials went to Accounts & keys. The revised prompt identifies the CLI device flow as Developer tools and distinguishes the account service’s sign-in endpoints. [Second direct preview](https://github.com/pollinations/pollinations/actions/runs/46030743116)

At `d79edc4814` the direct candidate matched 40 of 42 independent answers. All CLI login trials matched. In one of three trials each, #12870 (blank dashboard model table, working catalog API) received High instead of Medium, and #19013 (new agent temporarily unavailable after registration) went to Community models instead of Agents & agent tools. Every Type and Model work answer matched. The median trial took 4.76 s and the catalog estimate for all 42 calls was 0.00236 Pollen. The comparable original baseline took 6.13 s at the median and an estimated 0.00274 Pollen. [Third direct preview](https://github.com/pollinations/pollinations/actions/runs/46031034555)

The dashboard case retains Medium because the blank browser limits discovery while generation remains available. It is diagnostic. The reviewed follow-up narrows Community models to publisher and listing work.
