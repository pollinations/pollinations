# Weaver · Project Manager

Weaver classifies newly opened issues and PRs from its [policy](system-prompt.md): Area, Type, Priority and Model work. Manual backfills call the base model directly with the same policy. The [previous policy](baseline-prompt.md) is kept for rollback. The GitHub workflow validates classifications and owns the writes.

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

For updates, use `polli --json agents update "$id" --config "$config"` on the original listing and repeat the authenticated readback. The verifier compares the stored prompt, listing and callable IDs, metadata, base model, visibility and tools. The organizer credential returned HTTP 403 on the owner agents endpoint. Use the authorized shared-owner session for registration and readback, and keep the organizer credential for inference. [Permission check](https://github.com/pollinations/pollinations/actions/runs/46034574350) A missing or mismatched readback blocks release. Keep the direct classifier selected while updating the listing.

## Evaluate

Run **Repo / Organize issues and PRs** from the source revision under review and select a Weaver preview. Each run records the model, prompt and case digests, per-field differences, timings, token usage and catalog cost estimates in the Actions artifact. Preview reads frozen item evidence and skips the writer.

### Cutover rule

**The candidate passes when it scores at least as many exact matches as the original direct classifier on paired fresh runs. Ties pass.** An exact match requires the expected Area, Type, Priority and Model work, including nulls. Apply this comparison separately to the scored development cases and the frozen holdout. Both sets must pass. A single miss affects the count. Diagnostic-only cases stay visible and contribute no points.

The **shortened** and **hosted** release previews use this same rule. Each takes three fresh answers per arm per item, interleaves the original and candidate calls on identical evidence, and records both denominators and scores in the run summary and artifact. The original uses the baseline brief and JSON mode. The shortened arm uses the frozen candidate policy directly with JSON mode. The hosted arm sends only item facts to the verified private agent, omits JSON mode, and validates its returned fields. Missing pairs, cached or repeated completions, malformed answers and unavailable trials prevent a pass, including on diagnostic cases.

This gate compares observed accuracy in a finite sample. The five holdout items have now been seen. Keep the candidate prompt frozen through hosted evaluation. If the prompt changes again, reserve new unseen items and freeze their expected fields before scoring the revision.

- **baseline** runs the [development cases](classification-cases.json) with the original policy alone.

## Activate and observe

1. Land the reviewed manifest on `main` while the organizer and its documentation point to the baseline. Register from that commit, save the IDs and prompt digest, and run authenticated readback as described above.
2. Run the hosted release preview with the organizer's inference credential and the callable ID from readback. Require the shortened and hosted paired gates to pass on the frozen prompt and cases before activation.
3. After approval, use a separate activation PR to set the organizer job's `WEAVER_MODEL` environment value to the exact verified callable ID. Update the policy links in `AGENTS.md`, the issue-maker skill and the operations guides in the same commit. The current workflow ignores a repository variable of that name. Manual backfills continue to use the direct model.
4. Have the release owner watch the first newly opened issue and PR through completion. Inspect the actual Dev fields, preservation of populated fields, and eligible reward announcement. On failure, revert the activation commit to restore the direct classifier and its documentation. Rerun a missed opening announcement from its original opening event.
5. For subsequent policy releases, read back the updated listing and run the hosted preview before accepting the change.

The first holdout was reserved at `f4ebb023e6`. Within the most recent 100 issues and 100 PRs opened November 5–20, 2026, we excluded training sources, bot accounts and routine submissions, quests, censuses and promotions. We sorted eligible IDs by the SHA-256 of `0d56352a95:<number>` and took three issues and two PRs. The candidate was frozen at `ce9c2a852c` before the cases were labeled. The fixtures contain public source snapshots or summaries and proposed expected fields for maintainer review.

## Registration and hosted result, November 28

Registered from `50efde2c8a` as listing `636a81d6-12e5-4379-9b98-1054bc44982b`, callable model `community/pollinations-ai/weaver`, prompt SHA-256 `78de4634536b0bb3ce0a97dc9619c810fbd49fee5b68cd69da14fc7140e63627`. The authenticated readback matched the repository.

The hosted preview passed the paired gate with no invalid answers: **39/39** development answers against **36/39** for the original, and **12/15** holdout answers for both. [Hosted preview](https://github.com/pollinations/pollinations/actions/runs/46149834036)

A preview started within a minute of registration failed: the first 48 hosted calls returned HTTP 400 before the new listing became callable (#19013). Wait a few minutes after creating or updating the listing before running a preview or activating. [Failed first run](https://github.com/pollinations/pollinations/actions/runs/46149624036)

## Direct release result, November 27

The frozen candidate passed the paired gate. It matched **39/39** scored development answers against **37/39** for the original. Both matched **12/15** holdout answers. On all three trials of #19893, both chose Community models for the hosted-agent editing failure. All 138 completions, including diagnostic trials, were distinct cache misses. Hosted registration and preview follow the merge of #20608. [Paired release run](https://github.com/pollinations/pollinations/actions/runs/46034566700)
