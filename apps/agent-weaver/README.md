# Weaver · Project Manager

Weaver classifies opened issues and PRs for the Dev project. Its [system prompt](system-prompt.md) defines Area, Type, Priority and Model work. The GitHub workflow validates the result and owns all writes. Manual backfills use the direct model. The original direct [baseline prompt](baseline-prompt.md) is frozen for calibration and rollback.

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

## Evaluate and enable

1. Review the [frozen cases](classification-cases.json), expected fields and rationales. Issue update times and PR SHAs identify each source. Bodies are excerpts and the two synthetic variations are identified in their rationales.
2. Dispatch **Repo / Organize issues and PRs** with `weaver_preview=baseline`. The job requests fresh direct generations with `seed=-1`. Hosted agents have a per-run cache partition. A cached reply or repeated completion ID invalidates a trial. The job runs three trials on new or revised cases with the original prompt. Download the run’s `weaver-baseline` artifact and review its `calibration.json` before committing it here. Keep the old record and add a new case ID when revising disputed evidence. The [calibration record](calibration.json) preserves each miss and the source run. The full artifact includes per-trial fields, time and available usage data. The cost estimate uses recorded text usage and the returned catalog rates. Request IDs are retained for reconciling billed amounts.
3. Freeze the qualified cases. Each candidate requires three exact matches per case, including Priority. Missing required scenarios block scoring. Dispatch `weaver_preview=shortened` first. After verifying the deployed listing from the same source, dispatch `weaver_preview=hosted` with `preview_model` set to the callable ID returned by readback. All preview jobs read only frozen evidence and skip the organizer. Review field differences, latency and cost before cutover.
4. After both candidates pass, set the repository Actions variable `WEAVER_MODEL` to the verified callable ID. Check the resulting Dev fields on one newly opened issue and one PR. Removing the variable restores the original direct call and brief. For later policy-only edits, repeat readback and the hosted preview. Preserve the previous reviewed commit for rollback.
5. A transient outage leaves the contributor’s check green and adds a warning to the run summary. Rerun the original opening event to recover a missed reward announcement. Manual backfills only recover field writes.
