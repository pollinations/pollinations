# GPU Instances

Last updated: 2026-08-10

## Capacity Summary

| Model | Workers | GPUs | Provider | Cost/hr | Status |
|-------|---------|------|----------|---------|--------|
| Flux (FP4) | 2 | RTX 5090 + RTX PRO 4000 Blackwell | Vast.ai | $0.591111/hr all-in | **ACTIVE — two production, Vast-only** |
| Z-Image | 2 | 2x RTX 5090 | Vast.ai | $0.712593/hr all-in | **ACTIVE — two production** |
| Klein 4B | 1 | RTX 3090 | Vast.ai | $0.150000/hr all-in | **ACTIVE — Vast production** |
| DreamShaper 8 LCM (`dreamshaper`, alias `sana`) | 2 | 2x RTX 3090 | Vast.ai | $0.303333/hr all-in | **ACTIVE — production** |
| LTX-2 + ACE-Step | 0 active routes | GH200 (historical) | Lambda Labs | Verify provider account | **RETIRED from production** |

At capture time, the seven running Vast instances cost **$1.757037/hr** in total
(**$1,265.07 per 30-day month**).
All seven are production workers; there is no isolated canary left running.

Live verification on 2026-08-10 confirmed that all seven instances are in both
`actual_status=running` and `intended_status=running`, every model server and
named tunnel is healthy, and the registry contains both Flux hostnames, the
shared Z-Image hostname, and both DreamShaper hostnames. Klein is not in the
heartbeat registry because production reaches it through the `KLEIN_VPC`
Workers VPC binding.

Two dashboard labels are historical: `zimage-vast-canary` on `46003779` and
`flux-maintenance-canary-44731147` on `46491202`. Both are production workers,
not spare canaries. Vast labels do not control routing; instance IDs,
registered hostnames, and the Klein VPC tunnel are authoritative.

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

Each Uvicorn process admits one running and one waiting request
(`QUEUE_LIMIT=2`). Once that bounded queue is full, the worker returns 503 and
gen retries the other registered DreamShaper hostname. With three processes,
each GPU admits at most six in-flight requests instead of accumulating an
unbounded local backlog.

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

| Worker | Vast instance | Machine / region | GPU | All-in rate | Status |
|--------|---------------|------------------|-----|-------------|--------|
| flux-vast-04 | 46491202 | 138472 / California, US | RTX 5090 | $0.361111/hr | ACTIVE (promoted 2026-08-01) — registered hostname `flux-vast-04.pollinations.ai` |
| flux-vast-06 | 47259458 | 102863 / Quebec, CA | RTX PRO 4000 Blackwell 24 GB | $0.230000/hr | ACTIVE (promoted 2026-08-09) — registered hostname `flux-vast-06.pollinations.ai` |

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

The post-promotion audit found that `47259458` still had
`HEARTBEAT_ENABLED=false` even though its named tunnel was healthy. That made
the second paid worker invisible to normal Flux dispatch and left
`46491202` carrying the pool alone. The flag was corrected, the worker was
restarted, both Flux hostnames appeared in `/register`, and real production
requests reached `flux-vast-06`. Always finish a promotion by checking the
exact new hostname in `/register` and an attributed request in that worker's
`/tmp/flux.log`; a healthy tunnel alone is insufficient.

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
reliability `0.99476` at the 2026-08-09 audit. Qualification passed 512x512 and
1024x1024 generation,
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
vastai attach ssh <INSTANCE> "$(cat ~/.ssh/id_ed25519.pub)"
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

| Worker | Vast instance | Machine / region | Reliability | All-in rate | Status |
|--------|---------------|------------------|-------------|-------------|--------|
| zimage-vast-canary | 46003779 | 56097 / California, US | 0.99487 | $0.351111/hr | ACTIVE — production |
| zimage-vast-04 | 47267292 | 137833 / California, US | 0.99507 | $0.361481/hr | ACTIVE — production (promoted 2026-08-09) |

The active two-worker fleet costs `$0.712593/hr`. Instance `47267292` replaced
`46598648`, saving `$0.029630/hr` or `$21.33` per 30-day month; the replaced
instance was destroyed immediately after production verification. Compared
with the original `$0.844444/hr` pair, the current fleet saves `$94.93` per
30-day month. Both replicas are now in California on separate machines, so
machine diversity remains but regional diversity is reduced.

**Replacement validation (2026-08-09):**

- The isolated candidate passed authentication rejection, 512x512,
  1024x1024, 768x1152, and 1536x1536 generation, fixed-seed byte parity, and
  the 2,359,296-pixel limit.
- A 63.8-second concurrency-4 run completed 65 images with zero errors at
  **1.019 img/s**, 3.92-second p50, and 4.01-second p95 latency.
- Cached restart restored health in 25 seconds and produced a valid 1024x1024
  image while the production tunnel remained disabled.
- After joining the shared tunnel, the worker served real production traffic
  with zero 5xx, OOM, traceback, or tunnel errors. With the replaced connector
  drained, 8/8 attributed images passed at 3.89-second p50 and 5.30-second max.
- After `46598648` was destroyed, shared health passed 5/5 and 4/4 attributed
  1024x1024 images passed at 2.02-second p50 with zero 5xx or tunnel errors.
- The host's Hugging Face Xet and standard-HTTP cold downloads both suffered
  transient connection failures. Disabling Xet and resuming partial standard-
  HTTP downloads completed the 32.8 GB cache; subsequent starts were fast.

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

Production Klein runs on a dedicated Nevada RTX 3090. The gen Worker reaches
port 8000 through a remotely managed Cloudflare Tunnel bound as the private
`KLEIN_VPC` Workers VPC network; there is no public hostname or raw-IP route.

| Worker | Vast instance | Machine / region | GPU | Listed rate | Tunnel | Status |
|--------|---------------|------------------|-----|-------------|--------|--------|
| klein-vast-01 | 47353224 | 51654 / Nevada, US | RTX 3090 24GB | $0.150000/hr including 60GB disk | `c340d8d9-c1f3-4a13-8115-38b59faac3d5` | Active; 4 HA connections |

Instance `47353224` replaced network-defective instance `47259457` on
2026-08-10. The host has Vast reliability `0.997827` and costs
**$0.002222/hr**, or **$1.60 per 30-day month**, more than the retired slot.

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
human approval, rerun setup so it enables the stored scoped tunnel token and
enforces the Workers VPC QUIC qualification:

```bash
PLN_GPU_TOKEN=... TUNNEL_ENABLED=true \
  bash image.pollinations.ai/klein-runpod/setup-vast.sh
```

Do not manually create `/root/.cloudflared_tunnel_enabled`; doing so bypasses
the UDP precheck and four-connection gate.

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

Workers VPC requires QUIC over UDP/7844; HTTP/2 is not a valid transport for
this binding. `setup-vast.sh` therefore pins `--protocol quic`, requires
`cloudflared` 2026.5.2 or newer for startup connectivity prechecks, and fails
qualification if the UDP precheck fails or the tunnel does not establish four
healthy connections with zero request errors. A host that briefly registers
four connections after a failed UDP precheck is still disqualified.

**Health and restart:** Vast runs `/root/onstart.sh` on container startup. It
supervises `klein` and `cloudflared` screen sessions with restart loops. Tokens
are mode-600 files and cloudflared uses `--token-file`, keeping its token out of
process listings.

```bash
vastai show instance 47353224 --raw
# On the host:
screen -ls
tail -f /root/klein.log
tail -f /root/cloudflared.log
curl -s http://127.0.0.1:8000/health
```

**Network replacement qualification (2026-08-10):**

- Cloudflare connectivity passed UDP/QUIC and TCP/HTTP/2 on port 7844 against
  both tunnel regions. The connector established four QUIC connections and
  recorded zero reconnects or tunnel request errors during a 30-minute soak.
- Authentication rejection and invalid-image handling returned the expected
  403 and 400 responses. Direct 512x512 and 1024x1024 generation completed in
  1.32s and 3.33s; a reference edit completed in 1.58s.
- Three concurrent 512x512 requests completed successfully in three seconds
  wall time. Cached restart restored health in 10 seconds while the production
  tunnel remained disabled.
- After joining Workers VPC, 21 production requests completed successfully with
  zero 5xx, OOM, CUDA, backend, or tunnel failures. The final 15-minute
  production P50/P95 was 7.32s/10.54s; after the old connector was removed, a
  sole-backend 1024x1024 request completed in 6.52s end to end.
- During the comparison, retired host `47259457` logged 90 additional tunnel
  dial or termination failures while its local model remained healthy. It was
  destroyed immediately after the human-approved cutover.

**Previous replacement qualification (2026-08-09):**

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

**Post-cutover incident (2026-08-09):** the replacement's startup log reported
failed UDP connectivity even though four QUIC connections initially
registered. Production latency later rose from roughly 6–9 seconds to
70–100 seconds, then all four connections cycled between 12:44 and 12:45 UTC.
Eight gateway 5xx responses (`destination_not_found` / handshake timeout)
occurred while the local model remained healthy and generated a direct 512x512
image in 1.21 seconds. This is a tunnel/host-network failure, not a GPU error.

Future Klein canaries must keep all four QUIC connections healthy for at least
30 minutes, show no tunnel reconnects or 5xx, and keep the attributed Workers
VPC path below 15 seconds p95 before promotion. Local health, direct inference,
or a momentary four-connection count is insufficient.

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

### Historical/manual Klein 4B rollback configuration

> RunPod state was not available during the 2026-08-09 Vast audit. Do not infer
> that this pod is running from this document: check `runpodctl pod list` and
> the `KLEIN_URL` value before relying on it or attributing cost to it.

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

If this pod is running, it costs $0.27/hr in addition to Vast. Production does
not call it while the `KLEIN_VPC` binding exists; it is only a manual
restart-and-redeploy rollback path.

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
- **Check registered**: `curl -s https://gen.pollinations.ai/register -H "Authorization: Bearer $PLN_GPU_TOKEN"`

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
| `~/.ssh/id_ed25519` | Vast.ai | All seven active Vast workers; query the current proxy host/port with `vastai show instance` |
| `~/.ssh/enter-services-shared` | EC2 prod | enter services |
| `~/.ssh/enter-services-staging` | EC2 staging | enter services |
