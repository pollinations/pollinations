# Weaver · Project Manager

The organizer classifies newly opened issues and PRs and manual backfills by Area, Type and Priority. With `WEAVER_MODEL` unset, it sends the [checked-in policy](system-prompt.md) to the base model. Setting it selects hosted Weaver's saved prompt. The workflow validates each answer and makes every GitHub write.

Weaver is a private prompt agent owned by `polli@pollinations.ai` (GitHub user `pollinations-ai`), callable as `community/pollinations-ai/weaver`, listing `636a81d6-12e5-4379-9b98-1054bc44982b`. The organizer's inference key belongs to the same account, which is what lets it call a private agent. Managed agents reject JSON mode, so the hosted request asks for JSON in the prompt and the workflow validates the fields.

## Release a policy change

1. Edit `system-prompt.md`. It must stay under 8,000 characters and keep its Area headings; the organizer reads the Area names from them.
2. Regenerate the manifest: `bash apps/agent-weaver/config.sh assemble > /tmp/weaver-agent.json && cp /tmp/weaver-agent.json apps/agent-weaver/agent.json`. CI checks that both files agree.
3. Before merging, add any required Dev field options. For Area or answer-format changes, remove `WEAVER_MODEL` from the organizer job in the policy PR. Keep the old options for runs already in progress. The [Models Area migration plan](https://github.com/pollinations/pollinations/pull/20734) covers existing issues and PRs.
4. After merge, let organizer runs using the old policy finish. From the merged `main`, update the saved agent and verify its configuration with an owner session that has `account:keys`.

```bash
set -euo pipefail
id=636a81d6-12e5-4379-9b98-1054bc44982b
config=$(mktemp)
trap 'rm -f "$config"' EXIT
bash apps/agent-weaver/config.sh assemble > "$config"
polli --json agents update "$id" --config "$config"
polli --json agents get "$id" | bash apps/agent-weaver/config.sh verify "$id" community/pollinations-ai/weaver
```

5. To re-enable hosted Weaver, restore `WEAVER_MODEL: community/pollinations-ai/weaver` to the organizer job in a follow-up PR. Select **that branch** in **Repo / Organize issues and PRs**, specify a model PR and an ordinary issue, and enable `dry_run`. Check the log for a `DRY-RUN` classification with the expected Area and Type for each item, and Priority for the issue. An updated listing can take a few minutes to serve (#19013). Merge the follow-up only after both items classify correctly.

## Roll back

Remove `WEAVER_MODEL` from the organizer job in `.github/workflows/repo-organize-issues-prs.yml`. Classification then uses the base model directly with the same policy.

## Release evidence

Registered from `50efde2c8a`, prompt SHA-256 `78de4634536b0bb3ce0a97dc9619c810fbd49fee5b68cd69da14fc7140e63627`. On 18 frozen development cases and 5 held-out items, three fresh answers each, the hosted agent matched 39/39 scored development answers against 36/39 for the previous direct classifier, and 12/15 holdout answers for both, with no invalid answers. [Hosted preview](https://github.com/pollinations/pollinations/actions/runs/46149834036) · [Evaluation tooling as merged in #20608](https://github.com/pollinations/pollinations/tree/50efde2c8a/apps/agent-weaver)
