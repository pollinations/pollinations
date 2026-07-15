# Internal Trust-Boundary Tokens

Reference for checking and rotating Pollinations-internal tokens and
SOPS-recipient identities — credentials we issue ourselves, with no external
provider dashboard to rotate them in.

Use when:

- checking or rotating `PLN_ENTER_TOKEN`, `PLN_GPU_TOKEN`, or a Tinybird
  ingest/read/sync token
- checking or rotating a SOPS age-key recipient (`core`, `ci`, or a personal
  identity)
- tracing which services break if one side of a trust boundary is updated
  without the other

## Token inventory

| Token | Trust boundary | SOPS files | Fan-out targets |
|-------|---------------|------------|-----------------|
| `PLN_ENTER_TOKEN` | CF Worker (enter) → EC2 (image/text) | enter `{dev,staging,prod}.vars.json`, image `env.json`, text `env.json` | GitHub secrets (`PLN_ENTER_TOKEN`, `ENTER_TOKEN`), Wrangler (production, staging) |
| `PLN_GPU_TOKEN` | gen image + enter (ACE-Step) → GPU workers | image `env.json`, enter `{dev,staging,prod}.vars.json` | Wrangler (production, staging), RunPod pods (Flux+Z-Image, Klein), Lambda Labs GH200 (LTX-2, ACE-Step, Sana) |
| `TINYBIRD_INGEST_TOKEN` | enter+gen runtime → Tinybird append | enter+gen `{dev,staging,prod}.vars.json` | Wrangler (production, staging) |
| `TINYBIRD_READ_TOKEN` | enter/KPI/observability/app metrics → Tinybird read | enter `{dev,staging,prod}.vars.json`, kpi `env.json`, observability `secrets.vars.json` | GitHub secret `TINYBIRD_READ_TOKEN` |
| `TINYBIRD_SYNC_TOKEN` | GitHub Actions → Tinybird snapshot writes | — | GitHub secret `TINYBIRD_SYNC_TOKEN` |

Each Tinybird runtime token is workspace-scoped: `prod.vars.json` files hold tokens for the
`pollinations_enter` workspace; `staging.vars.json`/`dev.vars.json` hold
tokens for `pollinations_enter_staging`. Rotating the prod-workspace tokens
does not rotate the staging-workspace tokens — do that side manually until
this gains explicit workspace handling (tracked in #11127).

`TINYBIRD_SYNC_TOKEN` is a GitHub Actions credential for prod snapshot
replacement. It is not an Enter Worker secret and does not belong in Enter
SOPS files.

`TINYBIRD_LEGACY_READ_TOKEN` (consumed by `apps/operation/observability`)
lives in the retired `pollinations_ai` workspace and has no rotation path —
rotate manually or migrate observability off the legacy workspace and delete
the token.

## Rotation mechanisms

- **`PLN_ENTER_TOKEN`**, **`PLN_GPU_TOKEN`**: self-generated (`openssl rand
  -hex 32`) — we own both sides of the trust boundary, so there is no
  provider API call. `PLN_GPU_TOKEN` requires SSH fan-out to every GPU worker
  (see below) placed *before* the Wrangler update, so GPUs accept the new
  token before enter starts sending it.
- **Tinybird tokens**: `POST /tokens/{name}/refresh` (in-place, immediate
  invalidation — no create-before-delete window). Update the targets listed in
  the inventory: runtime ingest/read tokens may require Worker deployment;
  `TINYBIRD_SYNC_TOKEN` updates only the GitHub secret. Needs
  `TINYBIRD_ADMIN_TOKEN` (`tb --cloud token copy "admin token"`). Verify by
  writing one event with a new ingest token or running the relevant sync
  workflow with a new sync token.
- **Both sides of a trust boundary must update together.** A token correct in
  Wrangler but not yet on the consuming side (or vice versa) causes 403s or
  silent failures — see the table below.

## Deploy path — how a SOPS change actually reaches production

The generic shipping mechanism any credential rotation assumes when it says
"deploy" — only the SOPS file(s) touched and the final health-check differ.

1. `git checkout -b rotate/<name>-<date>`, edit the SOPS file(s) via `sops`,
   commit, `git push -u origin <branch>`.
2. `gh pr create --base main`, then `gh pr merge --auto --squash`. Poll the PR
   state (`gh pr view --json state`) every ~15s up to a 15-minute timeout;
   treat `CLOSED` (not merged) as a hard stop, never force-merge.
3. Once merged: `git checkout main && git pull --ff-only`, then
   `git push origin main:production` — an admin push, not a PR (branch
   protection allows this only for repo admins). Record the promoted SHA.
4. Find the deploy run this push triggered:
   `gh run list --workflow=<deploy-workflow> --branch=production --commit=<sha>`,
   poll for a run to appear (workflow start lags the push slightly), then
   `gh run watch <run-id> --exit-status` and treat a non-zero exit as a hard
   stop.
5. Run the connector-specific health check. Only after it passes, revoke/
   delete the old credential (if the mechanism has one).

Any failure at step 3 or later means the new credential is already partly
live — do not silently retry from step 1; report exactly which step failed
and let the operator decide whether to retry the tail or roll back (see
Rollback below).

## What breaks what

| If this token is wrong... | ...these break |
|---|---|
| `PLN_ENTER_TOKEN` in Wrangler but not SOPS | Enter worker sends old token → EC2 rejects with 403 |
| `PLN_ENTER_TOKEN` in SOPS but not Wrangler | EC2 expects new token → enter worker sends old → 403 |
| `PLN_GPU_TOKEN` in Wrangler but not GPU workers | enter sends new token to ACE-Step → GPU worker rejects → music generation fails |
| `PLN_GPU_TOKEN` on GPU workers but not Wrangler | ACE-Step GPU worker expects new token → enter sends old → music generation fails |
| `PLN_GPU_TOKEN` in SOPS/gen deploy but not GPU workers | image service sends new token → GPU workers reject → image generation fails |
| `PLN_GPU_TOKEN` on GPU workers but EC2 not redeployed yet | GPU workers expect new token → image service still sends old → image generation fails |

## GPU workers (PLN_GPU_TOKEN fan-out)

| Worker | Pod / Host | SSH target | Restart |
|---|---|---|---|
| Flux | Vast.ai 5090 instance(s) — see `image.pollinations.ai/GPU_INSTANCES.md` for current instance | `vastai show instances` for IP/port | restart `flux` screen |
| Z-Image | 3× RunPod single-GPU pods (`runpodctl pod list`) | rotating tcp port via RunPod GraphQL | `/root/relaunch-zimage.sh` |
| Klein 4B | RunPod (id changes if recreated — verify with `runpodctl pod list` and `KLEIN_URL` in `gen.pollinations.ai/secrets/prod.vars.json`) | RunPod relay, interactive-only | `/workspace/restart.sh` (token baked in via `export`; edit + re-run inside an interactive session) |
| LTX-2 + ACE-Step + Sana | Lambda Labs GH200 | SSH key in enter SOPS | `systemctl restart ltx2 acestep sana` |

Hosts move (pods get recreated, Flux migrated from RunPod to Vast.ai in
2026-07) — confirm current host/pod identity against
`image.pollinations.ai/GPU_INSTANCES.md` before rotating; don't trust this
table's specifics as current without checking.

## SOPS recipient rotation

Recipients are age public keys declared per path in `.sops.yaml`
`creation_rules` — there is no separate role registry; that file is the source
of truth. Economics secrets (`apps/operation/economics/**/secrets/*`) encrypt to
a single dedicated age key; the repo-wide worker/CI secrets (`*.vars.json`,
`env.json`) encrypt to the team key set. Rotating a recipient means changing the
`age:` list on the relevant `creation_rules` entry, as a two-phase,
overlap-window operation — never a single swap:

1. **Add** the new age public key to that path's `age:` list in `.sops.yaml`,
   `sops updatekeys` every file the rule matches, and merge. The old key stays
   valid.
2. **Verify** the new key decrypts without printing any secret — e.g.
   `sops exec-env <file> 'true'` using only the new private key, or a green
   "decrypt with SOPS" step in a staging deploy.
3. **Remove** the old key from `.sops.yaml`, `sops updatekeys` again, merge.

Never drop a key other files or people still depend on to rotate one holder —
check which `creation_rules` paths share it first. Confirm `.sops.yaml` matches
the recipients actually on each file before rotating; drifted recipient sets
have caused a real regression here before.

## Manual-only providers (no rotation automation)

| Provider | Env var(s) | Used by | SOPS file(s) |
|---|---|---|---|
| Alibaba (DashScope) | `DASHSCOPE_API_KEY` | image + text (Wan image, Qwen text) | `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json` |
| AssemblyAI | `ASSEMBLYAI_API_KEY` | gen worker (speech-to-text) | `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json` |
| ByteDance | `BYTEDANCE_API_KEY` | image (SeedEdit, Seedream) | `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json` |
| Pruna | `PRUNA_API_KEY` | image (Pruna-optimised models) | `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json` |
| OVHcloud | `OVHCLOUD_API_KEY` | text (OVH AI) + enter worker (audio fallback) | `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json`, `enter.pollinations.ai/secrets/{dev,staging,prod}.vars.json` |

Recipe: dashboard → new key → SOPS edit → (if worker-consumed, also `wrangler
secret put`) → deploy → health check → revoke old key in the provider
dashboard.

Not rotated at all, deliberately deferred:

- `BETTER_AUTH_SECRET` — needs a `secrets: []` multi-secret array in Better
  Auth config first; rotating now invalidates every user session.
- `STRIPE_WEBHOOK_SECRET` — needs a dual-secret verifier in
  `stripe-webhooks.ts` first.

## Rollback

If a rotation breaks production, get the previous value from git history and
re-apply it through the normal SOPS → deploy path — do not hand-edit a live
secret outside that path:

```bash
git log -p -- enter.pollinations.ai/secrets/prod.vars.json gen.pollinations.ai/secrets/prod.vars.json | head -50
```

Or revert the SOPS commit on `main`, push `main` to `production`, and
redeploy.
