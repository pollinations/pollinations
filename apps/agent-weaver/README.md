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

- **compare-misses** measures the two disputed cases with ten fresh calls per case per direct prompt. The runner alternates prompt order and checks completion IDs across both prompts. Counts this small describe observed variation and leave uncertainty about the true error rates.
- **baseline** and **shortened** run the [development cases](classification-cases.json) three times each with the original or proposed policy. The [calibration record](calibration.json) retains all original misses. Former exclusions and the borderline dashboard priority are marked diagnostic. These items and the other examples used during editing can expose regressions.
- **compare-holdout** evaluates both direct prompts three times on each independently reserved issue or PR. Freeze the candidate and expected fields before the first call. Keep all examples, including disagreements. A prompt edited using these outcomes needs new unseen cases for another generalization check.
- **hosted** uses the ID returned by owner readback and runs the development, diagnostic and held-out cases in distinct report groups. Compare the hosted and direct candidate outcomes at the same prompt digest.

A cache hit, replayed completion, invalid answer or unavailable call fails the preview. A completed run reports observed agreement. Maintainers review field-level rates against the original, particularly priority, queue errors and held-out regressions, before approving release. Keep the direct classifier active when evidence is inconclusive.

## Activate and observe

1. Land the reviewed manifest on `main` while the organizer and its documentation point to the baseline. Register from that commit, save the IDs and prompt digest, and run authenticated readback as described above.
2. Run the hosted preview with the organizer's inference credential. Review the configuration digest, classification results and any disagreements alongside the direct comparison.
3. After approval, use a separate activation PR to set the organizer job's `WEAVER_MODEL` environment value to the exact verified callable ID. Update the policy links in `AGENTS.md`, the issue-maker skill and the operations guides in the same commit. The current workflow ignores a repository variable of that name. Manual backfills continue to use the direct model.
4. Have the release owner watch the first newly opened issue and PR through completion. Inspect the actual Dev fields, preservation of populated fields, and eligible reward announcement. On failure, revert the activation commit to restore the direct classifier and its documentation. Rerun a missed opening announcement from its original opening event.
5. After those live checks succeed, remove the one-time owner-check job, its `check_weaver_owner` and `probe_model_digest` inputs and `probe_agent.py`. Keep the preview for future policy edits. For subsequent policy releases, read back the updated listing and run the hosted preview before accepting the change.

## Initial evaluation evidence

The original direct classifier qualified 14 of 18 frozen cases on three independent generations per case. The calibration record keeps the four exclusions, their trial numbers and their field differences. Earlier cached trials are retained as diagnostics. [Baseline](https://github.com/pollinations/pollinations/actions/runs/46029736886) · [Replacement Update case](https://github.com/pollinations/pollinations/actions/runs/46030181660)

The first independently scored shortened prompt matched 40 of 42 answers. On one trial each, issue #18704 landed in API & reliability and PR #13677 received Bug. All priority and queue answers matched. The next prompt clarifies account sign-in failures and the work type for routine price maintenance. The fixtures and scored set are identical. [Shortened-prompt results](https://github.com/pollinations/pollinations/actions/runs/46030363547)

The second direct preview corrected both previous misses. Two of the three CLI device-login trials went to Accounts & keys. The revised prompt identifies the CLI device flow as Developer tools and distinguishes the account service’s sign-in endpoints. [Second direct preview](https://github.com/pollinations/pollinations/actions/runs/46030743116)

At `d79edc4814` the direct candidate matched 40 of 42 independent answers. All CLI login trials matched. In one of three trials each, #12870 (blank dashboard model table, working catalog API) received High instead of Medium, and #19013 (new agent temporarily unavailable after registration) went to Community models instead of Agents & agent tools. Every Type and Model work answer matched. The median trial took 4.76 s and the catalog estimate for all 42 calls was 0.00236 Pollen. The comparable original baseline took 6.13 s at the median and an estimated 0.00274 Pollen. [Third direct preview](https://github.com/pollinations/pollinations/actions/runs/46031034555)

The dashboard case retains Medium because the blank browser limits discovery while generation remains available. It is diagnostic. The reviewed follow-up narrows Community models to publisher and listing work.
