# Rotation Scripts — Status

Snapshot of what has been tested, what is theoretical, and known gaps. Updated as scripts progress from "written" to "verified end-to-end".

## Tested & verified (dry-run passes locally)

| Script | Pre-flight | Plan preview | Notes |
|---|---|---|---|
| `rotate-genai-aws.sh` | ✅ | ✅ | IAM user `portkey-bedrock-access` |
| `rotate-genai-perplexity.sh` | ✅ | ✅ | current key valid, healthy |
| `rotate-genai-fireworks.sh` | ✅ | ✅ | account+user from SOPS |
| `rotate-genai-xai.sh` | ✅ | ✅ | admin key can list, ACL cloning works |
| `rotate-genai-elevenlabs.sh` | ✅ | ✅ | admin key works, SA has 0 keys (ready) |
| `rotate-genai-azure.sh` | ⚠️ partial | ✅ for 2/3 | East US + Sweden OK; **Content Safety resource not visible in default `az` subscription** |
| `rotate-genai-gcp.sh` | ❌ | — | **Local `gcloud` (elliot@myceli.ai) can't list keys on the pollinations GCP project**; needs different auth |
| `rotate-infra-enter-token.sh` | ✅ (old version) | — | Not yet rewritten for full-cycle flow (Batch 6 pending) |
| `rotate-infra-gpu-token.sh` | ✅ (old version) | — | Not yet rewritten (Batch 6 pending); has known ordering bug |
| `rotate-ops-cloudflare.sh` | ✅ (old version) | — | Not yet rewritten (Batch 7 pending) |
| `rotate-ops-tinybird.sh` | ✅ (old version) | — | Not yet rewritten (Batch 7 pending) |

## Never tested end-to-end

Nothing has actually mutated production. The following are theoretical until someone runs `--execute`:

- `gh pr merge --auto --squash` — repo auto-merge behavior (does it wait for required checks?)
- `git push origin main:production` — admin push under branch-protection config
- `gh run watch --exit-status` correctly identifying the right deploy run after the promotion push
- Deploy workflows actually picking up new SOPS values (SCP + systemd restart for EC2, wrangler deploy for worker)
- Health check endpoints returning expected codes after the rotated key is live (verified the endpoints respond, not that the rotated key works downstream)

## Known gaps & environmental issues

1. **gcp — local auth.** Operator needs `gcloud auth login` with an account holding SA-admin perms on `stellar-verve-465920-b7`, or to run the script from a CI-like environment with service-account credentials. Not a script bug.
2. **azure safety — cross-subscription.** `gptimagemain1-resource` is not visible under the default `az` subscription on the operator's machine. Workaround: `az account set --subscription <other-sub>` or a separate `az login` before running with `--resource safety`. `--resource east` and `--resource sweden` work standalone.
3. **`TINYBIRD_LEGACY_READ_TOKEN`** — lives in the retired `pollinations_ai` Tinybird workspace. Consumed by `apps/operation/economics`. Not rotated by `rotate-ops-tinybird.sh` (current admin token can't reach that workspace). Rotate manually or migrate economics off the legacy workspace.
4. **`rotate-infra-gpu-token.sh` ordering bug** — current version does Wrangler `secret put` *before* SSH fan-out to GPU hosts. Result: enter worker switches to the new token while GPU hosts still have the old one → rejection window for the duration of the SSH fan-out (minutes). Fix in Batch 6: reverse to SSH-first, Wrangler-last.
5. **Extra ElevenLabs SA key created during debugging** — while investigating the admin-key permission story, an extra SA key was created via API and then revoked. Current admin key in use is `sk_e60048…`.
6. **ElevenLabs first-run edge case** — the current runtime `ELEVENLABS_API_KEY` is Thomas's personal key, not under the rotate SA. First `--execute` will create a new SA key, switch SOPS to it, but **skip deleting** the personal key (the admin key can only manage keys under the SA). Operator revokes the personal key manually in the ElevenLabs UI after rotation. The script warns in that case.
7. **Health checks are basic.** They verify the production endpoint is reachable (HTTP 200 or 401), not that the *specific rotated provider* actually works end-to-end. A targeted check would call a known model routed to that provider. Upgrade path documented per-script.

## Invariant that holds so far

Despite the gaps above, nothing has actually broken in production:

- All pre-flight failures exit cleanly before mutating anything.
- Scripts preserve zero-downtime: if rotation fails mid-flight after new-key creation, the old key stays valid and deletion is skipped.
- No real rotation has been attempted — this is all dry-run and plan validation.

## Next steps

1. Finish Batch 6 (infra scripts) and Batch 7 (worker-consumed ops) to bring every script under the unified full-cycle flow.
2. First real `--execute` run: pick the lowest-risk one (`perplexity` or `fireworks` — small blast radius, rolling-safe) to validate the PR→merge→production→deploy→health-check plumbing end-to-end.
3. Iterate on health checks to be provider-specific.
4. Fix the gpu-token ordering as part of Batch 6.
