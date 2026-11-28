# Weaver · Project Manager

Weaver classifies newly opened issues and PRs, and manual backfills, from its [policy](system-prompt.md): Area, Type, Priority and Model work. The organizer workflow validates each answer and makes every GitHub write.

It is a private prompt agent owned by `polli@pollinations.ai` (GitHub user `pollinations-ai`), callable as `community/pollinations-ai/weaver`, listing `636a81d6-12e5-4379-9b98-1054bc44982b`. The organizer's inference key belongs to the same account, which is what lets it call a private agent. Managed agents reject JSON mode, so the hosted request asks for JSON in the prompt and the workflow validates the fields.

## Change the policy

1. Edit `system-prompt.md`. It must stay under 8,000 characters and keep its Area headings; the organizer reads the Area names from them.
2. Regenerate the manifest: `bash apps/agent-weaver/config.sh assemble > /tmp/weaver-agent.json && cp /tmp/weaver-agent.json apps/agent-weaver/agent.json`. CI checks that both files agree.
3. After step 4, preview the edit on a few real items: run **Repo / Organize issues and PRs** with issue or PR numbers and `dry_run` on. It logs Weaver's classification without writing.
4. After merge, update the saved agent and read it back with an owner session that has `account:keys`:

```bash
set -euo pipefail
id=636a81d6-12e5-4379-9b98-1054bc44982b
config=$(mktemp)
trap 'rm -f "$config"' EXIT
bash apps/agent-weaver/config.sh assemble > "$config"
polli --json agents update "$id" --config "$config"
polli --json agents get "$id" | bash apps/agent-weaver/config.sh verify "$id" community/pollinations-ai/weaver
```

Until step 4 runs, Weaver keeps the old policy while the organizer validates against the new Area names, so a renamed or added Area fails classification. Do it right after the merge.

A newly created or updated listing can return HTTP 400 for a few minutes (#19013). A rejected request fails the organizer run and skips that item's reward comment, so avoid opening-heavy moments.

## Roll back

Remove `WEAVER_MODEL` from the organizer job in `.github/workflows/repo-organize-issues-prs.yml`. Classification then uses the base model directly with the same policy.

## Release evidence

Registered from `50efde2c8a`, prompt SHA-256 `78de4634536b0bb3ce0a97dc9619c810fbd49fee5b68cd69da14fc7140e63627`. On 18 frozen development cases and 5 held-out items, three fresh answers each, the hosted agent matched 39/39 scored development answers against 36/39 for the previous direct classifier, and 12/15 holdout answers for both, with no invalid answers. [Hosted preview](https://github.com/pollinations/pollinations/actions/runs/46149834036) · [Evaluation tooling as merged in #20608](https://github.com/pollinations/pollinations/tree/50efde2c8a/apps/agent-weaver)
