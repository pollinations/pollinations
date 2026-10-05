# Model catalog manager pilot

A private Pollinations prompt agent and Pollinations VM, using the same APIs available to clients under `pollinationsagent@gmail.com`. API-only collection; no browser automation.

## Outcome and boundaries

Daily research leads cover discovery, checkout/deployed public-price differences, alternative sourcing and retirement notices. Successful assessments appear in [the public pilot issue](https://github.com/pollinations/pollinations/issues/16517). The agent stays private. Research does not approve capabilities, reconcile provider bills, confirm retirements, change models, open PRs or deploy. Health monitoring belongs elsewhere.

Each day selects up to five currently qualifying, unsuppressed findings. Two slots are reserved for discovery when available; remaining slots prioritize retirement, public-price differences, configured-model revisions, sourcing, then further discovery and unmatched lifecycle notices. Unused slots are filled from other findings. Successfully assessed fingerprints are suppressed for 30 days; changed revisions, prices, providers or deadlines reopen them.

There is no persistent pending queue. All findings remain in that run's encrypted report, but only the selected ones are marked assessed. Unselected findings qualify again only while current evidence triggers them; a one-day release/version event may never be assessed. The report states selected and unselected counts. This bounds the pilot without promising exhaustive coverage.

The dashboard owns the private agent's prompt, base model and empty tool selection at `community/pollinations-ai/model-manager-agent`. [agent.json](agent.json) is its initial registration payload, not a runtime override. The runner sends at most five findings within 12,000 JSON bytes, up to six relevant checkout models per category (12 total), and requests at most 1,200 output tokens. The prompt treats upstream descriptions as untrusted evidence and requests up to five specific actions without padding. Generated text is unverified research; markup escaping protects rendering, not semantic accuracy.

## Discovery and comparisons

Use native platform signals, not a combined popularity score. Exact ID/alias matches are leads, not proof of checkpoint or route equivalence.

| Source | Collection | Trigger |
| --- | --- | --- |
| Hugging Face | Top 50 global trends, top 20 per supported task; up to 200 newest records, overlapping the last run by 48 hours or seven days on cold start. | Global rank ≤10 or task rank ≤5 immediately; global ≤50 or task ≤20 on two distinct daily observations 18–36 hours apart; first-observed newest entries after a baseline. |
| Replicate | Curated text/image/video/speech collections; recent model/version lists, capped at 200 each; exact-model run counts for up to 200 watched IDs. | New curated membership (editorial evidence), first-observed listings, changed versions, or ≥100 observed runs/day and ≥2× baseline growth. |
| OpenRouter | Catalog with all output modalities, first 50 newest and first 20 weekly-ranked entries. | First-observed IDs, changed versions, weekly top 20 on two daily observations 18–36 hours apart, matched expiration dates, or qualifying sourcing comparisons below. |
| fal | Public endpoint catalog, at most 20 pages of 100. | First-observed endpoints, changed metadata revisions and deprecated endpoints. Highlighting is editorial evidence. |

Replicate momentum uses `(current_count − previous_count) × 24 / elapsed_hours`, divided by `max(median(last seven earlier valid daily rates), 10)`. Require three earlier valid rates. Only 18–36-hour intervals with nonnegative deltas qualify; counter resets, cold starts and wider gaps cannot establish momentum. Runs do not measure unique users, successful outputs or revenue.

Compare identities/revisions against their last actual observation across 14 retained daily snapshots. Missing entries in partial scans are not removals or new releases. Each source has a 45-second deadline; completed observations survive failures and pagination/deadline gaps remain visible. Same-day retries never count as a second trend observation.

Sourcing excludes models already using OpenRouter: aggregate catalog minima cannot verify our pinned endpoint's price. For other exact ID/alias matches with both text-token costs and no cost variants, compare input and output separately after applying the registry's standard 5.5% credit-purchase fee. Both must be no higher, with at least one lower. Mixed rates require a workload and produce no cheaper-provider lead. Missing/invalid rates cannot become zero. The lead includes both rate tables and current provider. Endpoint/checkpoint equivalence, cached/reasoning/media usage, account terms, purchase minimums, credits and capabilities still require investigation; no savings estimate or route change is approved.

Official interfaces: [Hugging Face](https://huggingface.co/docs/huggingface_hub/main/en/package_reference/hf_api), [Replicate](https://replicate.com/docs/reference/http), [OpenRouter catalog](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties), [OpenRouter fees](https://openrouter.ai/pricing), [fal](https://fal.ai/docs/platform-apis/v1/models). Remaining coverage gaps include HF download backstops, Replicate task persistence, official lab/lifecycle announcements, verified identities/licenses, account-price reconciliation and capability probes.

## Execution and recovery

[The workflow](../../.github/workflows/models-manager-pilot.yml) runs on upstream `main`, daily at 06:00 UTC, with one concurrency group. CI schedules and launches the VM; Pollinations hosts inference. The trusted host bundles the collector, analyzer and existing registry helpers into one executable. The daily VM uses its existing Node runtime; it does not install or build Enter/Gen.

The VM is rented through `https://gen.pollinations.ai/alpha/e2b`, with verified ownership/template/resources and a ten-minute kill-on-timeout lease. The launcher exports collection before starting inference and kills the VM in `finally`. An existing pilot VM blocks another paid run. There is no Computer copy.

Save the paid assessment before suppression/rendering, then export it with the checkpoint. Recovery settles a saved complete response without another inference, including when suppression was interrupted. Same-day assessment retries reuse saved input; the next day collects fresh evidence. Failed inference is not marked assessed or complete and may incur another charge on an explicit retry. A completed Berlin day starts no new VM or inference.

The scan job has read-only contents/actions permissions. Only a separate publisher job has issue-write access; it downloads sanitized Markdown, has no checkout/install or SOPS credentials, and deduplicates comments by observation timestamp. Its 30-day readable artifact allows **Re-run failed jobs** to retry publication on later days without rerunning scan/inference. Full workflow reruns follow normal daily collection rules. Publication failure does not invalidate a completed assessment.

The encrypted checkpoint retains compact history, suppression, exact selected input, paid response, pilot accounting and redacted execution proof. Restore only this workflow's trusted `main` artifacts, including previous attempts. Missing/expired evidence cannot silently restart a paid pilot. Only successful current-day execution can prepare a readable artifact. Public output excludes account metadata, credentials, raw responses and logs; the CI summary uses the same sanitized report.

The pilot stops after 14 Berlin calendar days or 2 Pollen. Reserve 0.1222 Pollen per run: 0.0222 for ten minutes of 2-vCPU/2-GiB compute plus 0.1 for inference. Check live agent availability/rates before each inference, bounding prompt size at 32,000 bytes plus evidence and output at 1,200 tokens. Reconcile interrupted spending from the dedicated key ledger; unverified spending consumes the reservation. An exceeded reservation stops further paid work for review.

## Credentials and manual integration validation

SOPS stays on the trusted host. Existing inputs are `POLLINATIONS_API_KEY_AGENT_MODEL_MANAGER` from `operations/model-manager/secrets/prod.vars.json`, `REPLICATE_API_TOKEN` from Gen's production SOPS file, and Actions `SOPS_AGE_KEY`. The dedicated key permits profile/usage/machines, excludes key management and restricts inference to the private agent and its base model. No runtime Keychain dependency or new credentials.

`node operations/model-manager/launch.mjs --verify-stack --out /absolute/private/output` (or manual `verify_stack: true`) uploads the trusted tracked working checkout, including candidate edits, to a Pollinations VM. This is a source copy based on `main`, not a GitHub fork. It does not activate daily research or publish.

The sandbox installs checksum-verified Node 24.10.0 and lockfile dependencies with lifecycle scripts disabled, runs the existing Gen agent-run-token, prompt-agent Responses, text-cache and billing-deduction tests unchanged, builds SDK/UI and Enter/Gen, migrates isolated local D1 and starts both workers. Build/test scripts execute the supplied checkout, so only trusted candidate code may use this credentialed path.

Test inputs come from existing dev SOPS files: Azure provider access (`AZURE_MYCELI_PROD_API_KEY`), Better Auth secrets and verified staging Tinybird ingest/read access. **Local application state and staging telemetry do not make the provider credential a staging credential:** the probe uses a real Azure provider account and can incur its normal inference charges. The host verifies Tinybird workspace names before injection. No production databases or deployments are used; secret material and the SOPS identity are never in source uploads or public reports.

Seed only the hash of the authorized runtime key in disposable D1, register the private agent through local Enter and call it through local Gen. Require actual usage, wallet settlement, identical-request cache retrieval without another debit, and exactly one charged staging Tinybird event whose total price matches the wallet. The free parent agent also emits an event. Both workers and the VM are cleaned up; manual validation has a 20-minute lease and 0.1-Pollen compute reservation. Evidence is encrypted by CI. This validates the development stack, not every model capability.

## Activation and later model changes

Merge the reviewed PR, then separately dispatch `initialize: true` to activate the first pilot. Verify Actions decryption, restoration and VM cleanup on that first run. Review lead usefulness, coverage and spend at the 14-day/budget stop; disable the schedule at review. Preparation and local validation do not activate it.

For later additions, updates, routing or retirement PRs, use the maintained [model-management skill](../../.claude/skills/model-management/SKILL.md): confirm exact model/provider contract and lifecycle evidence, implement from current `origin/main`, and run its applicable capability and billing test matrix against the real Enter/Gen checkout in the VM. Human merge, production promotion and scoped secret approvals remain separate. Add automation for those changes only after useful pilot evidence; no generic orchestration layer is needed.

Inspect an encrypted checkpoint with an existing authorized SOPS identity:

```sh
node operations/model-manager/state.mjs restore --file /absolute/path/state.vars.json --data /absolute/private/output
```
