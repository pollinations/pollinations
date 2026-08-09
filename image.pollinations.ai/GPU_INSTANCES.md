# GPU Instances

Last updated: 2026-08-09

## Capacity Summary

| Model | Workers | GPUs | Provider | Cost/hr | Status |
|-------|---------|------|----------|---------|--------|
| Flux (FP4) | 2 | RTX 5090 + RTX PRO 4000 Blackwell | Vast.ai | $0.591111/hr all-in | **ACTIVE — two production, Vast-only** |
| Z-Image | 2 | 2x RTX 5090 | Vast.ai | $0.742222/hr all-in | **ACTIVE — two production** |
| Klein 4B | 1 | RTX 3090 | Vast.ai | $0.147778/hr all-in | **ACTIVE — Vast production** |
| DreamShaper 8 LCM (`dreamshaper`, alias `sana`) | 2 | 2x RTX 3090 | Vast.ai | $0.303333/hr all-in | **ACTIVE — production** |
| LTX-2 + ACE-Step | 0 active routes | GH200 (historical) | Lambda Labs | Verify provider account | **RETIRED from production** |

At capture time, the seven running Vast instances cost **$1.784444/hr** in total
(**$1,284.80 per 30-day month**).
All seven are production workers; there is no isolated canary left running.

## Provider: Vast.ai — DreamShaper 8 LCM (RTX 3090)

Replaced SANA-Sprint on the GH200 (PR #12900). Model slug is `dreamshaper` with
`sana` kept as an alias; the **registry pool key is still `sana`** because
`/register` rejects unknown types, so a worker cannot join a pool that only
exists after the routing change deploys.

| Worker | Vast instance | Machine / region | GPU | All-in rate | Status |
|--------|---------------|------------------|-----|-------------|--------|
| dreamshaper-vast-01 | 46607014 | 4749 / Oregon, US | RTX 3090 | $0.150000/hr | ACTIVE — named tunnel `dreamshaper-canary-46600159.myceli.ai` |
| dreamshaper-vast-02 | 46387155 | 123712 / California, US | RTX 3090 | $0.153333/hr | ACTIVE — named tunnel `dreamshaper-vast-02.pollinations.ai` |

Config: `Lykon/dreamshaper-8` + fused `lcm-lora-sdv1-5`, `LCMScheduler`, TAESD
tiny decoder, guidance 0.0, 3 steps, 512x512, `WORKERS=3`. Code in
`dreamshaper-lcm/`; Vast runs `/root/onstart.sh` after container start to
restore the worker and named tunnel.

Instance `46607014` replaced `46307858` on 2026-08-02 and reduced the slot from
`$0.175556/hr` to `$0.150000/hr`, saving **$0.025556/hr** or about
**$18.40 per 30-day month**. The Oregon host has Vast reliability `0.9977` and
preserves regional and machine diversity from the California replica.

Qualification passed authentication, fixed-seed byte parity, caller-step
override protection, 512x512 and clamped dimension limits, public tunnel
parity, and a genuine Vast stop/start. A 20.69-second concurrency-8 run served
210 images with zero errors at **10.15 img/s** and **1.54s p95**. After
promotion the host served 358 attributed production generations with zero
5xx, OOM, CUDA, worker, or tunnel failures before the old instance was
destroyed.

The canary also exposed a reusable restart failure: quitting the `screen`
session can leave Uvicorn child workers holding port 8766. `setup-vast.sh` now
uses `fuser` to terminate the existing listener before relaunching, preventing
an `Address already in use` restart loop.

**Run several uvicorn workers per card.** A single process plateaued at
**~4.3 img/s with the GPU only 26-45% busy** — the ceiling is the Python path
(global lock, JPEG + base64 per response), not the GPU or the step count.
Dropping 3 steps to 2 changed nothing, which proved it. With `WORKERS=3` each
3090 sustains **~8 img/s** at concurrency 8 (GPU still only ~36%, so there is
more left). The model is ~2.5 GB, so three copies fit easily in 24 GB.

Measured capacity is ~16 img/s across both cards against a 5.72 img/s peak, so
either card can carry production alone. **Never size this from a single-client
benchmark** — the first rollout did, sized one card at 6.18 img/s, and produced
a latency climb to 57s in production before the GH200 was put back in the pool
as emergency capacity.

Two traps that fail silently:

- gen hardcodes `steps: 4` into every self-hosted request body, so the worker
  **ignores caller-supplied steps**. Honouring them overrides the 3-step config.
- Without `PUBLIC_HOSTNAME` the worker registers its raw Vast `IP:port`, which
  the gen Worker cannot fetch — while the heartbeat still reports healthy. This
  happened during rollout; always confirm the registered URL is the hostname.

## Vast replacement operations

The repository skill
[`manage-vast-gpu-fleet`](../.claude/skills/manage-vast-gpu-fleet/SKILL.md)
is the source of truth for scheduled offer scouting, candidate qualification,
isolated canaries, the human promotion gate, cutover, instance cleanup, and the
post-cutover documentation PR.

## Provider: Vast.ai — Flux (RTX 5090 + RTX PRO 4000 Blackwell, FP4)

Two single-GPU instances, each fronted by a named Cloudflare Tunnel. Flux is
Vast-only and has no external provider fallback. The gen worker dispatches to
the registered `flux` pool through `callSelfHostedServer`.

| Worker | Vast instance | GPU | Listed rate | Status |
|--------|---------------|-----|-------------|--------|
| flux-vast-04 | 46491202 | RTX 5090 | $0.361111/hr | ACTIVE (promoted 2026-08-01) — named tunnel `flux-vast-04.pollinations.ai` |
| flux-vast-06 | 47259458 | RTX PRO 4000 Blackwell 24 GB | $0.230000/hr | ACTIVE (promoted 2026-08-09) — named tunnel `flux-vast-06.pollinations.ai` |

Instance `47259458` replaced `47018211` while instance `46491202` remained
active. The Quebec host is machine `102863`, has Vast reliability `0.99595`,
and costs **$165.60 per 30-day month** in Vast credits. It saves
**$0.057778/hr**, or **$41.60 per 30-day month**, compared with the replaced
slot. The two-worker FLUX pool now costs `$0.591111/hr` all-in.

Qualification on the replacement passed authentication rejection, 512x512,
1024x1024, 1024x768, and 768x1024 generation, four-request burst handling,
model restart recovery in 12 seconds, and shared-tunnel production routing.
Direct generation took 1.30s at 512x512, 1.95s at 1024x1024, and 1.42s for
both wide and tall tests. The worker served **116/116 attributed production
requests** with zero 4xx/5xx, OOM, CUDA, or traceback errors before the old
instance was destroyed. Fixed-seed byte output varied on both the candidate and
the replaced production worker, so it was recorded as existing Nunchaku
behavior rather than a host regression.

The replacement reconfirmed a queue caveat: the synchronous inference call
blocks the FastAPI event loop, so `QUEUE_LIMIT=3` does not currently guarantee
fast 503 shedding under concurrent load. Treat the two-worker Vast pool as the
capacity guard. Queue admission must be hardened separately; there is no
Replicate fallback.

> Instance IDs/IPs/ports change on recreate — check `vastai show instances`.
> CRITICAL: workers MUST be behind a named Cloudflare tunnel created in the
> authoritative Pollinations account. The gen Worker cannot fetch a Vast
> raw-IP/non-standard-port origin, and a successful registry heartbeat alone
> does not prove the data path works. Historical external fallbacks could hide
> either failure, but the current FLUX route is Vast-only.

**The quick-tunnel warning above is not theoretical — it caused the #12254
outage.** flux-vast-03 was left on a `trycloudflare.com` quick tunnel (free,
rate-limited, no SLA). Under production load it degraded until a static `/docs`
fetch took 15–39s while the worker itself served a 1024×1024 image in 3.9s on
localhost. Requests exceeded the CloudFront timeout, so users saw indefinite
hangs, not errors — and the worker kept heartbeating green the whole time.
Never point production at a quick tunnel; use a named tunnel.

Instance `46491202` replaced maintenance-bound instance `44731147`, which was
destroyed after cutover. The California host is machine `138472` with Vast
reliability `0.9971`. Qualification passed 512x512 and 1024x1024 generation,
four concurrent requests, authentication rejection, 17-second restart
recovery, and an external Cloudflare generation in 3.46 seconds. After the old
connector drained, the new worker served 47 production generations with zero
backend errors before final verification.

This host exposed two provisioning edge cases now handled by `setup-vast.sh`:
Hugging Face Xet connections repeatedly stopped advancing and Cloudflare Tunnel
SRV lookups failed through the host resolver. Standard HTTP completed the model
download, while the local DNS-over-HTTPS fallback established four named-tunnel
connections.

**Provision a new instance** (see `nunchaku/setup-vast.sh` header for all env):
```bash
vastai search offers 'gpu_name=RTX_5090 num_gpus=1 verified=true rentable=true reliability>0.99 duration>=30 inet_down>=500 cpu_cores>=8 disk_space>=60' --order dph_total
vastai create instance <OFFER> --image "vastai/base-image:cuda-13.0.2-cudnn-devel-ubuntu24.04-py312" --disk 60 --ssh --direct --env '-p 8765:8765'
vastai attach ssh <INSTANCE> "$(cat ~/.ssh/pollinations_services_2026.pub)"
# Isolated canary: heartbeat and production tunnel are disabled by default.
PLN_GPU_TOKEN=... HF_TOKEN=... PUBLIC_HOSTNAME=flux-vast-NN.pollinations.ai \
GIT_BRANCH=main bash setup-vast.sh
# After verification and explicit human approval, rerun with the scoped tunnel
# token plus HEARTBEAT_ENABLED=true and TUNNEL_ENABLED=true.
PLN_GPU_TOKEN=... HF_TOKEN=... CLOUDFLARED_TUNNEL_TOKEN=... \
PUBLIC_HOSTNAME=flux-vast-NN.pollinations.ai HEARTBEAT_ENABLED=true \
TUNNEL_ENABLED=true GIT_BRANCH=main bash setup-vast.sh
```
Gotchas (all hit in practice): rent hosts with `duration>=30`; verify
`intended_status=running` after create (GPU can be taken between create/start);
some hosts have broken direct SSH (use the `ssh_host:ssh_port` proxy); some
drop bulk CDN downloads mid-transfer (setup-vast.sh passes pip
`--resume-retries` so downloads resume instead of restarting); Hugging Face Xet
can hang with established but idle connections (standard HTTP is the Vast
default); some hosts drop Cloudflare Tunnel SRV responses (setup starts a local
DNS-over-HTTPS resolver only on affected hosts); hosts with
driver < 580 hit CUDA Error 804 with the cuda-13 image (GeForce can't use
forward-compat libs — setup-vast.sh disables them so the host driver is used);
machine-to-machine rsync between vast instances is NOT reliable (hosts kill
bulk SSH streams, the vast agent rewrites authorized_keys); racing 2 candidate
instances and destroying the loser is cheap (~$0.40/hr each).

**Health / restart:**
```bash
curl -s https://<named-tunnel-hostname>/docs -o /dev/null -w "%{http_code}\n"   # control-plane only
curl -s https://gen.pollinations.ai/register -H "Authorization: Bearer $PLN_GPU_TOKEN"  # registry
# on the instance: screen -r flux / screen -r cloudflared; logs /tmp/flux.log /tmp/cloudflared.log
# Vast runs /root/onstart.sh after a container restart to restore both services
POLLINATIONS_API_KEY=... bash image.pollinations.ai/nunchaku/verify-vast.sh  # required before cutover
```

**Key behavior:** FP4 nunchaku, 4 steps, full 1024x1024
(`MAX_PIXELS=1048576`). `QUEUE_LIMIT=3` is configured, but the synchronous
inference path currently prevents it from reliably shedding concurrent load.
FLUX is Vast-only, so both production workers must remain healthy.

## Provider: Vast.ai — Z-Image Turbo (RTX 5090)

Z-Image uses one remotely managed Cloudflare Tunnel shared by the Vast
workers. Cloudflare balances requests across its connectors, while the registry
sees one stable backend URL.

| Worker | Vast instance | Region | Listed rate | Status |
|--------|---------------|--------|-------------|--------|
| zimage-vast-canary | 46003779 | California | $0.351111/hr | ACTIVE — production |
| zimage-vast-03 | 46598648 | Estonia | $0.391111/hr | ACTIVE — production (promoted 2026-08-02) |

The active two-worker fleet costs `$0.742222/hr`. Instance `46598648` replaced
`45313816`, saving `$0.031111/hr` or `$22.40` per 30-day month; the replaced
instance was destroyed immediately after production verification. Compared
with the original `$0.844444/hr` pair, the current fleet saves `$73.60` per
30-day month. Total live Vast fleet burn after this cleanup was
`$1.572222/hr`.

**Replacement validation (2026-08-02):**

- Vast reliability was `0.998151`; the replacement preserved a separate
  machine and moved the replica from South Korea to Estonia.
- A supervised restart restored local health in 14 seconds, external health in
  16 seconds, and all four Cloudflare Tunnel connections.
- Authentication rejection, 512x512, 1024x1024, and 768x1152 generation
  passed; fixed-seed output was byte-identical through the local and external
  routes.
- Sustained qualification completed 135 images in 123.5 seconds with zero
  errors and 3.75-second p95 latency.
- Production verification observed 14 real requests on the replacement: 10
  successful images, four expected 422 validation responses, zero 5xx, zero
  tunnel request failures, and zero GPU/server errors. Five shared-hostname
  health probes also passed after the old instance was destroyed.
- The Estonia host intermittently logged DNS refresh timeouts, but its four
  QUIC connections stayed registered and recovered cleanly after restart.

**Canary validation (2026-07-27):**

- Full reboot restored the model and four Cloudflare Tunnel connections.
- Concurrency 4 for 120 seconds: 102/102 successful, 0.826 images/second,
  4.69s p50, 5.73s p95, and 6.11s p99.
- 512×512, 1024×1024, and 768×1152 outputs passed; fixed-seed output was
  byte-identical.
- Production soak added five successful requests with no 5xx, OOM, traceback,
  or tunnel errors.
- After draining and stopping `45311852`, the retained workers served another
  27 successful requests with zero 5xx or current-hour tunnel errors; five
  shared-hostname health probes also passed.
- Requests above 2,359,296 pixels return HTTP 422.

**Deployment behavior:**

- `HEARTBEAT_ENABLED=false` disables registry registration, not traffic through
  a shared named tunnel. Keep the `tunnel-enabled` marker absent for local-only
  validation.
- `/root/onstart.sh` starts the model first and waits for local `/health` before
  joining the production tunnel.
- Some Vast hosts drop Cloudflare's required SRV DNS responses. The setup
  detects this and conditionally starts a local DNS-over-HTTPS resolver before
  cloudflared; inspect `/root/tunnel-dns.log` on affected hosts.
- Normal PyPI delivered the verified PyTorch 2.9.1 CUDA 12.8 Blackwell wheel
  much faster than the dedicated PyTorch index on the canary.
- See `z-image/README.md`, `z-image/setup-vast.sh`, and
  `z-image/verify-vast.sh` for provisioning and verification.

## Provider: Vast.ai — FLUX.2 Klein 4B (RTX 3090)

Production Klein runs on a dedicated California RTX 3090. The gen Worker reaches
port 8000 through a remotely managed Cloudflare Tunnel bound as the private
`KLEIN_VPC` Workers VPC network; there is no public hostname or raw-IP route.

| Worker | Vast instance | Machine / region | GPU | Listed rate | Tunnel | Status |
|--------|---------------|------------------|-----|-------------|--------|--------|
| klein-vast-01 | 47259457 | 47340 / California, US | RTX 3090 24GB | $0.147778/hr including 60GB disk | `c340d8d9-c1f3-4a13-8115-38b59faac3d5` | Active; 4 HA connections |

Instance `47259457` replaced `44766948` on 2026-08-09. The host has Vast
reliability `0.997194` and saves **$0.017778/hr**, or **$12.80 per 30-day
month**.

**Provisioning:** use `image.pollinations.ai/klein-runpod/setup-vast.sh` with
`pytorch/pytorch:2.5.1-cuda12.1-cudnn9-devel`. The model is public and does not
require `HF_TOKEN`. Pre-create a remotely managed tunnel with catch-all service
`http://localhost:8000`, then pass only its scoped token to the Vast host.

```bash
vastai create instance <OFFER> \
  --image pytorch/pytorch:2.5.1-cuda12.1-cudnn9-devel \
  --disk 60 --ssh --direct --label klein-vast-01 \
  --env '-p 8000:8000' --cancel-unavail
vastai attach ssh <INSTANCE> "$(cat ~/.ssh/id_ed25519.pub)"

PLN_GPU_TOKEN=... CLOUDFLARED_TUNNEL_TOKEN=... TUNNEL_ENABLED=false \
  bash image.pollinations.ai/klein-runpod/setup-vast.sh
```

The setup defaults to an isolated canary. After direct tests and explicit
human approval, enable the stored scoped tunnel token and restart the
supervisor:

```bash
touch /root/.cloudflared_tunnel_enabled
/root/onstart.sh
```

**Routing and rollback:** when `KLEIN_VPC` exists, the Klein handler uses
`http://127.0.0.1:8000/generate` through the binding. `KLEIN_URL` remains the
RunPod URL in production secrets but is ignored while the VPC binding exists.
There is no automatic runtime fallback for Klein. To roll back, remove the
production `KLEIN_VPC` binding and redeploy the gen Worker; it will immediately
resume using `KLEIN_URL`.

Workers VPC tunnel replicas provide high availability, not balanced canary
traffic: requests select the nearest replica. For an end-to-end replacement
test, keep the old GPU server healthy, pause only its `cloudflared` connector,
verify real traffic on the new worker, then restore the old connector until
human promotion approval. See Cloudflare's
[Workers VPC tunnel documentation](https://developers.cloudflare.com/workers-vpc/configuration/tunnel/).

**Health and restart:** Vast runs `/root/onstart.sh` on container startup. It
supervises `klein` and `cloudflared` screen sessions with restart loops. Tokens
are mode-600 files and cloudflared uses `--token-file`, keeping its token out of
process listings.

```bash
vastai show instance 47259457 --raw
# On the host:
screen -ls
tail -f /root/klein.log
tail -f /root/cloudflared.log
curl -s http://127.0.0.1:8000/health
```

**Replacement qualification (2026-08-09):**

- Authentication rejection, invalid-image handling, and the 2,359,296-pixel
  limit returned the expected 403, 400, and 422 responses.
- 512x512, 1024x1024, and 1536x1536 generation passed in 3.02s, 3.57s, and
  8.41s respectively with no OOM.
- Single-reference and two-reference edits passed in 3.89s and 7.07s.
- Three concurrent 512x512 requests all succeeded; a full restart restored
  health in 42 seconds and the first post-restart image completed in 2.56s.
- The tunnel health gate prevented routing during model load. Seven attributed
  production requests completed with zero 4xx/5xx, OOM, or traceback errors;
  three were forced through the new worker by pausing only the old connector.

**Original cutover results (2026-07-14):**

- 512x512 generation: 2.83s; single-reference edit: 2.97s.
- Two-reference edit: 3.36s and both inputs influenced the output.
- 1024x1024 generation: 4.63s.
- Three concurrent 512x512 requests all returned valid images.
- Real 850x1100 production requests completed in 2.37–2.39s.
- Cloudflare showed 4 healthy connections and 0 origin proxy errors.
- Final soak verification observed `provider=vast`, `model_used=klein`,
  successful production traffic, and zero 5xx; the Vast backend had accepted
  521 requests with no recent 5xx.

The successful canary sequence is: local health, authenticated generation,
single-reference edit, multi-reference edit, 1024x1024 render, concurrent
requests, VPC-bound probe, then real `gen.pollinations.ai` traffic. A direct
origin health check alone does not prove the Workers VPC data path.

## Provider: RunPod

Manage via `runpodctl` CLI or GraphQL API at `api.runpod.io/graphql`.
Job invocation at `api.runpod.ai/v2/{endpoint}/run` (note: different domain).

```bash
runpodctl pod list             # list pods
runpodctl pod get <id>         # pod details
```

### Pod jmrbmje2fyuy46 — Klein 4B rollback

> Pod ID changes if recreated. Check `runpodctl pod list` and the `KLEIN_URL` env var (sops: `gen.pollinations.ai/secrets/prod.vars.json`).

- **GPU**: 1x RTX A5000 (24GB) | **Cost**: $0.27/hr via API ($0.29/hr in UI)
- **SSH**: full SSH using `SSH_RUNPOD_KLEIN` from SOPS; current runtime port changes on recreate/start
- **HTTP**: `https://jmrbmje2fyuy46-8000.proxy.runpod.net`
- **Service**: FLUX.2 Klein 4B manual rollback; not in the active production route
- **Auth**: `x-backend-token` header with `PLN_GPU_TOKEN`
- **Code**: `/workspace/handler.py` (mirrors `image.pollinations.ai/klein-runpod/handler.py`)
- **Logs**: `/workspace/klein.log`
- **Restart**: `bash /workspace/restart.sh` (in-pod)

**Rollback health check:**
```bash
curl -s https://jmrbmje2fyuy46-8000.proxy.runpod.net/health
```

Keeping this pod running costs $0.27/hr in addition to Vast. Once the Vast
deployment has met the desired soak period, stop the pod to remove that cost;
retain its `KLEIN_URL` value for a manual restart-and-redeploy rollback.

**Shutdown checklist:** stop the pod; do not terminate it. Then confirm Klein
still reports `provider=vast`, a successful request reaches instance `47259457`,
and the production status window remains free of 5xx. To roll back, restart the
pod, verify its health endpoint, remove `KLEIN_VPC`, and deploy gen through CI.

### Historical Z-Image pods

Flux left RunPod on 2026-07-02 (pod hsl3ksl31lvrcc terminated; flux now on
Vast.ai, see above). Z-Image production moved to Vast in July 2026. Historical
RunPod IDs were `icagz5lxdzotdx`, `ua39ysr9i86nil`, and `owngt7t59jexy8`.
Confirm their current state with `runpodctl pod list` before any cleanup; these
IDs are not the active Z-Image production route.

**Registry check (all workers):**
```bash
curl -s https://gen.pollinations.ai/register -H "Authorization: Bearer $PLN_GPU_TOKEN" | python3 -m json.tool
```

## Provider: Lambda Labs

### Historical LTX-2.3 Video + ACE-Step Music + Sana (GH200)

LTX-2 and ACE-Step are retired from production. DreamShaper replaced the
legacy Sana route. Confirm the Lambda instance is terminated in the provider
account before assuming there is no remaining Lambda charge.

- **Host**: `192.222.51.105`
- **SSH**: `ssh -i <SSH_LAMBDA_SANA_LTX2_ACESTEP from SOPS> ubuntu@192.222.51.105`
- **LTX-2**: port 8765, health at `/health`
- **ACE-Step**: port 8189, systemd `acestep.service`
- **Sana**: port 8766, systemd `sana.service`, ~0.165s/img

## Provider: EC2 (AWS)

The legacy `image-pollinations.service` (port 16384) and `text-pollinations.service` (port 16385) on the `enter-services` EC2 box are decommissioned — image and text generation now run inside the `gen.pollinations.ai` Cloudflare Worker. The host still runs Discord bots; SSH config alias is `enter-services`.

### Staging

- **Host**: `44.222.254.250`
- **SSH**: `ssh -i ~/.ssh/enter-services-staging ubuntu@44.222.254.250`

## Heartbeat Registration

GPU workers send heartbeats to the gen worker registry:
- **URL**: `https://gen.pollinations.ai/register`
- **Check registered**: `curl -s https://gen.pollinations.ai/register`

## SSH Keys

GPU worker SSH keys are stored in SOPS (`enter.pollinations.ai/secrets/{dev,staging,prod}.vars.json`).

Extract for use: `sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r '.KEY_NAME' > /tmp/key && chmod 600 /tmp/key`

| SOPS key | Provider | Instances |
|----------|----------|-----------|
| `SSH_RUNPOD_KLEIN` | RunPod | Klein rollback pod (`jmrbmje2fyuy46`) + Z-Image pods |
| `SSH_LAMBDA_SANA_LTX2_ACESTEP` | Lambda Labs | GH200 (LTX-2, ACE-Step, Sana) |

The Klein RunPod rollback uses `SSH_RUNPOD_KLEIN` from SOPS. Get the current
public SSH host/port from RunPod runtime ports; the port changes when the pod is
recreated or restarted. (`SSH_RUNPOD_FLUX_ZIMAGE` belonged to the terminated
`hsl3ksl31lvrcc` pod and does not auth against the current pods.)

Non-SOPS keys:

| Key | Provider | Location |
|-----|----------|----------|
| `~/.ssh/pollinations_services_2026` | Vast.ai | Flux 5090 workers (attach via `vastai attach ssh`) |
| Vast account SSH key | Vast.ai | Klein instance 47259457; query current proxy host/port with `vastai show instance` |
| `~/.ssh/enter-services-shared` | EC2 prod | enter services |
| `~/.ssh/enter-services-staging` | EC2 staging | enter services |
