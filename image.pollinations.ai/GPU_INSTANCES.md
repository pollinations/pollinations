# GPU Instances

Last updated: 2026-07-27

## Capacity Summary

| Model | Workers | GPUs | Provider | Cost/hr | Status |
|-------|---------|------|----------|---------|--------|
| Flux (FP4) | 1 | RTX 5090 | Vast.ai | $0.3744/hr | **ACTIVE — production** (Fireworks fallback) |
| Z-Image | 3 temporary | 3x RTX 5090 | Vast.ai | $1.195555/hr | **ACTIVE — two production + one validated canary** |
| Klein 4B | 1 active + 1 rollback | RTX 3090 + A5000 | Vast.ai + RunPod | $0.1656 + $0.27 while rollback runs | **ACTIVE — Vast production; RunPod stop-ready** |
| LTX-2 + ACE-Step + Sana | 1 | GH200 | Lambda Labs | — | **ACTIVE** |

## Provider: Vast.ai — Flux (RTX 5090, FP4)

One single-GPU instance fronted by a Cloudflare Tunnel. Flux routes pool-first
with automatic Fireworks fallback
(`gen.pollinations.ai/src/image/createAndReturnImages.ts` → `callFluxWithFallback`).

| Worker | Vast instance | GPU | Listed rate | Status |
|--------|---------------|-----|-------------|--------|
| flux-vast-03 | 44731147 | RTX 5090 | $0.374444/hr | ACTIVE (reactivated 2026-07-22) — named tunnel `flux-vast-04.pollinations.ai` |

> Instance IDs/IPs/ports change on recreate — check `vastai show instances`.
> CRITICAL: workers MUST be behind a named Cloudflare tunnel created in the
> authoritative Pollinations account. The gen Worker cannot fetch a Vast
> raw-IP/non-standard-port origin, and a successful registry heartbeat alone
> does not prove the data path works. Fireworks can hide either failure.

**The quick-tunnel warning above is not theoretical — it caused the #12254
outage.** flux-vast-03 was left on a `trycloudflare.com` quick tunnel (free,
rate-limited, no SLA). Under production load it degraded until a static `/docs`
fetch took 15–39s while the worker itself served a 1024×1024 image in 3.9s on
localhost. Requests exceeded the CloudFront timeout, so users saw indefinite
hangs, not errors — and the worker kept heartbeating green the whole time.
Never point production at a quick tunnel; use a named tunnel.

When reprovisioning, check the host's HuggingFace throughput before committing
to it (`curl -r 0-5000000 -L <hf-model-url>`): this host previously managed
384 KB/s and stalled during its cold download. It was reactivated only after
its 17 GB model cache was complete, so a cold rebuild on this host remains a
risk.

**Provision a new instance** (see `nunchaku/setup-vast.sh` header for all env):
```bash
vastai search offers 'gpu_name=RTX_5090 num_gpus=1 verified=true rentable=true reliability>0.99 duration>=30 inet_down>=500 cpu_cores>=8 disk_space>=60' --order dph_total
vastai create instance <OFFER> --image "vastai/base-image:cuda-13.0.2-cudnn-devel-ubuntu24.04-py312" --disk 60 --ssh --direct --env '-p 8765:8765'
vastai attach ssh <INSTANCE> "$(cat ~/.ssh/pollinations_services_2026.pub)"
# First create a remote tunnel + hostname routing to localhost:8765 in Cloudflare, then:
PLN_GPU_TOKEN=... HF_TOKEN=... CLOUDFLARED_TUNNEL_TOKEN=... \
PUBLIC_HOSTNAME=flux-vast-NN.pollinations.ai GIT_BRANCH=main bash setup-vast.sh
```
Gotchas (all hit in practice): rent hosts with `duration>=30`; verify
`intended_status=running` after create (GPU can be taken between create/start);
some hosts have broken direct SSH (use the `ssh_host:ssh_port` proxy); some
drop bulk CDN downloads mid-transfer (setup-vast.sh passes pip
`--resume-retries` so downloads resume instead of restarting); hosts with
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

**Key behavior:** FP4 nunchaku, 4 steps, full 1024x1024 (`MAX_PIXELS=1048576`);
`QUEUE_LIMIT=3` allows one running request plus two waiting; additional load is
shed with 503 so the gateway falls back to Fireworks instead of making users
wait in a long queue.

## Provider: Vast.ai — Z-Image Turbo (RTX 5090)

Z-Image uses one remotely managed Cloudflare Tunnel shared by the Vast
workers. Cloudflare balances requests across its connectors, while the registry
sees one stable backend URL.

| Worker | Vast instance | Region | Listed rate | Status |
|--------|---------------|--------|-------------|--------|
| zimage-vast-01 | 45311852 | South Korea | $0.422222/hr | ACTIVE — production |
| zimage-vast-02 | 45313816 | South Korea | $0.422222/hr | ACTIVE — production |
| zimage-vast-canary | 46003779 | California | $0.351111/hr | ACTIVE — validated production canary |

The temporary three-worker fleet costs `$1.195555/hr`. Replacing one older
worker with the canary leaves two workers at `$0.773333/hr`, saving
`$0.071111/hr` or about `$51.20` per 30-day month versus the previous pair.
Do not stop an older worker until the canary's production soak is accepted.

**Canary validation (2026-07-27):**

- Full reboot restored the model and four Cloudflare Tunnel connections.
- Concurrency 4 for 120 seconds: 102/102 successful, 0.826 images/second,
  4.69s p50, 5.73s p95, and 6.11s p99.
- 512×512, 1024×1024, and 768×1152 outputs passed; fixed-seed output was
  byte-identical.
- Production soak added five successful requests with no 5xx, OOM, traceback,
  or tunnel errors.
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

Production Klein runs on a dedicated Indiana RTX 3090. The gen Worker reaches
port 8000 through a remotely managed Cloudflare Tunnel bound as the private
`KLEIN_VPC` Workers VPC network; there is no public hostname or raw-IP route.

| Worker | Vast instance | GPU | Listed rate | Tunnel | Status |
|--------|---------------|-----|-------------|--------|--------|
| klein-vast-01 | 44766948 | RTX 3090 24GB | $0.165556/hr including 60GB disk | `c340d8d9-c1f3-4a13-8115-38b59faac3d5` | Active; 4 HA connections |

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

PLN_GPU_TOKEN=... CLOUDFLARED_TUNNEL_TOKEN=... \
  bash image.pollinations.ai/klein-runpod/setup-vast.sh
```

**Routing and rollback:** when `KLEIN_VPC` exists, the Klein handler uses
`http://127.0.0.1:8000/generate` through the binding. `KLEIN_URL` remains the
RunPod URL in production secrets but is ignored while the VPC binding exists.
There is no automatic runtime fallback for Klein. To roll back, remove the
production `KLEIN_VPC` binding and redeploy the gen Worker; it will immediately
resume using `KLEIN_URL`.

**Health and restart:** Vast runs `/root/onstart.sh` on container startup. It
supervises `klein` and `cloudflared` screen sessions with restart loops. Tokens
are mode-600 files and cloudflared uses `--token-file`, keeping its token out of
process listings.

```bash
vastai show instance 44766948 --raw
# On the host:
screen -ls
tail -f /root/klein.log
tail -f /root/cloudflared.log
curl -s http://127.0.0.1:8000/health
```

**Cutover results (2026-07-14):**

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
still reports `provider=vast`, a successful request reaches instance `44766948`,
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

### LTX-2.3 Video + ACE-Step Music + Sana (GH200)

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
| Vast account SSH key | Vast.ai | Klein instance 44766948; query current proxy host/port with `vastai show instance` |
| `~/.ssh/enter-services-shared` | EC2 prod | enter services |
| `~/.ssh/enter-services-staging` | EC2 staging | enter services |
