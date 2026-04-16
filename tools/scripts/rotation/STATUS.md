# Rotation Scripts — Status

Snapshot of what has been tested, what is theoretical, and known gaps. Updated as scripts progress from "written" to "verified end-to-end".

## Tested & verified (dry-run passes locally)

All scripts below have been rewritten under the unified full-cycle local flow (pre-flight → create new → SOPS → PR → main→production → deploy → health → delete old). Dry-runs were run locally; no `--execute` path has been exercised.

| Script | Pre-flight | Plan preview | Notes |
|---|---|---|---|
| `rotate-infra-enter-token.sh` | ✅ | ✅ | 5 SOPS files verified; wrangler + gh authed |
| `rotate-infra-gpu-token.sh` | ✅ | ✅ | SSH to all 3 GPU hosts reachable; ordering fixed (SSH after EC2 deploy, before Wrangler) |
| `rotate-genai-aws.sh` | ✅ | ✅ | IAM user `portkey-bedrock-access` |
| `rotate-genai-perplexity.sh` | ✅ | ✅ | current key valid, healthy |
| `rotate-genai-fireworks.sh` | ✅ | ✅ | account+user from SOPS |
| `rotate-genai-xai.sh` | ✅ | ✅ | admin key can list, ACL cloning works |
| `rotate-genai-elevenlabs.sh` | ✅ | ✅ | admin key works, SA has 0 keys (ready for first-run) |
| `rotate-ops-tinybird.sh` | ✅ | ✅ | admin token OK, workspace has 10 tokens |
| `rotate-genai-azure.sh` | ⚠️ partial | ✅ for 2/3 | East US + Sweden OK; **Content Safety resource not visible in default `az` subscription** |
| `rotate-genai-gcp.sh` | ❌ | — | **Local `gcloud` (elliot@myceli.ai) can't list keys on the pollinations GCP project**; needs different auth |

### Not rewritten (intentionally)

| Script | State | Reason |
|---|---|---|
| `rotate-ops-cloudflare.sh` | Still the narrowed-to-observability version from earlier refactor, not brought under the full-cycle flow | Operator chose to skip in Batch 7 — observability token rotation is low-priority and the existing script is still functional |

## Never tested end-to-end

Nothing has actually mutated production. The following are theoretical until someone runs `--execute`:

- `gh pr merge --auto --squash` — repo auto-merge behavior (waits for required checks? which checks?)
- `git push origin main:production` — admin push under branch-protection config (confirmed allowed in principle; not exercised)
- `gh run watch --exit-status` correctly identifying the right deploy run after the promotion push
- Deploy workflows actually picking up new SOPS values (SCP + systemd restart for EC2, Wrangler deploy for worker)
- Health check endpoints returning expected codes after the rotated key is live (verified the endpoints respond, not that the rotated key works downstream)
- Infra scripts: EC2→worker rejection window (seconds) closing correctly between deploy-enter-services completion and `wrangler secret put`
- GPU token: SSH fan-out + worker restart sequence across 3 hosts actually transitioning cleanly with the new token
- xAI: new API path (`POST /auth/api-keys` with cloned ACLs) produces a functional key with the expected permissions

## Known gaps & environmental issues

1. **gcp — local auth.** Operator needs `gcloud auth login` with an account holding SA-admin perms on `stellar-verve-465920-b7`, or to run the script from a CI-like environment with service-account credentials. Not a script bug.
2. **azure safety — cross-subscription.** `gptimagemain1-resource` is not visible under the default `az` subscription on the operator's machine. Workaround: `az account set --subscription <other-sub>` or a separate `az login` before running with `--resource safety`. `--resource east` and `--resource sweden` work standalone.
3. **`TINYBIRD_LEGACY_READ_TOKEN`** — lives in the retired `pollinations_ai` Tinybird workspace. Consumed by `apps/operation/economics`. Not rotated by `rotate-ops-tinybird.sh` (current admin token can't reach that workspace). Rotate manually or migrate economics off the legacy workspace.
4. **ElevenLabs first-run edge case** — the current runtime `ELEVENLABS_API_KEY` is Thomas's personal key, not under the rotate SA. First `--execute` will create a new SA key, switch SOPS to it, but **skip deleting** the personal key (the admin key can only manage keys under the SA). Operator revokes the personal key manually in the ElevenLabs UI after rotation. The script warns in that case.
5. **Health checks are basic.** They verify the production endpoint is reachable (HTTP 200 or 401), not that the *specific rotated provider* actually works end-to-end. A targeted check would call a known model routed to that provider. Upgrade path documented per-script.
6. **`rotate-ops-cloudflare.sh` not under the full-cycle flow.** Still uses the older in-place rotation approach without PR/production promotion; fine for observability token rotation but inconsistent with the rest of the suite. Convert later if needed.

## Invariant that holds so far

Despite the gaps above, nothing has actually broken in production:

- All pre-flight failures exit cleanly before mutating anything.
- Scripts preserve zero-downtime where the provider allows it: if rotation fails mid-flight after new-key creation, the old key stays valid and deletion is skipped.
- For infra tokens (where we own both sides of the trust boundary), rejection windows are bounded to seconds (enter-token) or ~2min + ~5s (gpu-token) and are documented in each script's header.
- No real rotation has been attempted — this is all dry-run and plan validation.

## Next steps

1. **First real `--execute` run**: pick the lowest-risk one (`rotate-genai-perplexity.sh` — small blast radius, rolling-safe, isolated to text service) to validate the PR→merge→production→deploy→health-check plumbing end-to-end.
2. **Upgrade health checks** to be provider-specific (call a known model routed through the rotated provider).
3. **Address gcp local auth** (either document the `gcloud auth login` recipe or delegate gcp rotations to CI).
4. **Decide cloudflare-obs rotation fate** — bring under full-cycle flow, delete, or leave as-is.
5. **Modularize** once all scripts are battle-tested: extract the shared git + PR + deploy-watch tail into a helper file (currently duplicated across 10 scripts as per the explicit "make them each 100% self-contained" constraint).
