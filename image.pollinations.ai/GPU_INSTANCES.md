# GPU Instances

Last updated: 2026-06-03

## Capacity Summary

| Model | Workers | GPUs | Provider | Cost/hr | Status |
|-------|---------|------|----------|---------|--------|
| Flux | — | — | Fireworks (serverless) | pay-per-image | **ACTIVE — production** |
| Z-Image | 3 | 2x RTX A4500 + 1x RTX 3090 | RunPod (community) | $0.60 | **ACTIVE — production** |
| Klein 4B | 1 | 1x RTX 3090 | RunPod | $0.22 | **ACTIVE** |
| LTX-2 + ACE-Step + Sana | 1 | GH200 | Lambda Labs | — | **ACTIVE** |
| **Total active GPU** | **~5** | | | **~$0.82/hr** | |

> **Migration (2026-06-02):** flux moved off the self-hosted GPU fleet onto
> Fireworks serverless (PR #11502); Z-Image moved off the shared 4-GPU pod onto
> three separate single-GPU community pods running the **NF4-quantized** model
> (PR #11576). The old 4× RTX 4090 pod `hsl3ksl31lvrcc` was **TERMINATED**
> 2026-06-03. Fleet cost dropped from ~$1.58/hr to ~$0.82/hr.

## Provider: RunPod

Manage via `runpodctl` CLI or GraphQL API at `api.runpod.io/graphql`.
Job invocation at `api.runpod.ai/v2/{endpoint}/run` (note: different domain).

```bash
runpodctl pod list             # list pods
runpodctl pod get <id>         # pod details
```

### Pod lqh6weiexk4sth — Klein 4B

> Pod ID changes if recreated. Check `runpodctl pod list` and the `KLEIN_URL` env var (sops: `gen.pollinations.ai/secrets/prod.vars.json`).

- **GPU**: 1x RTX 3090 (24GB) | **Cost**: $0.22/hr (community cloud)
- **SSH**: RunPod relay — interactive only: `ssh <pod-id>-<key-id>@ssh.runpod.io -i ~/.ssh/id_ed25519` (full command from dashboard "Connect" tab)
- **HTTP**: `https://lqh6weiexk4sth-8000.proxy.runpod.net`
- **Service**: FLUX.2 Klein 4B (FastAPI on port 8000)
- **Auth**: `x-backend-token` header with `PLN_GPU_TOKEN`
- **Code**: `/workspace/handler.py` (mirrors `image.pollinations.ai/klein-runpod/handler.py`)
- **Logs**: `/workspace/klein.log`
- **Restart**: `bash /workspace/restart.sh` (in-pod)

**Health check:**
```bash
curl -s https://lqh6weiexk4sth-8000.proxy.runpod.net/health
```

**Recovery from RunPod host outage**: see `.claude/skills/monitor-services/SKILL.md` Klein section. Pod volume is destroyed on terminate; `handler.py`/`restart.sh` must be redeployed onto a fresh pod.

### Z-Image — 3 single-GPU pods (NF4)

Z-Image runs on **three independent single-GPU community pods**, each serving one
worker that heartbeats to the gen registry. All three run the **NF4-quantized**
model `unsloth/Z-Image-Turbo-unsloth-bnb-4bit` (~8.7 GB VRAM) — see PR #11576 for
the `ZIMAGE_MODEL_ID` server support. The dispatcher picks a live worker at
random (240s TTL heartbeat), so adding/removing a pod needs no gen code change.

| Pod ID | Name | GPU | Port | $/hr | Proxy URL | SSH |
|--------|------|-----|------|------|-----------|-----|
| `8ikeaa96szx665` | zimage-a4500-a | RTX A4500 (20GB) | 8767 | $0.19 | `https://8ikeaa96szx665-8767.proxy.runpod.net` | `ssh -i ~/.ssh/id_ed25519 -p 10859 root@213.144.200.205` |
| `ft8emi5vavb7hr` | zimage-a4500-b | RTX A4500 (20GB) | 8768 | $0.19 | `https://ft8emi5vavb7hr-8768.proxy.runpod.net` | `ssh -i ~/.ssh/id_ed25519 -p 11608 root@213.144.200.205` |
| `lrrdd9jggqg9su` | zimage-3090 | RTX 3090 (24GB) | 8767 | $0.22 | `https://lrrdd9jggqg9su-8767.proxy.runpod.net` | RunPod relay — get full command from dashboard "Connect" tab |

> Pod IDs and SSH ports change if recreated/restarted. Re-check with
> `runpodctl get pod` and query live SSH endpoints via the GraphQL API
> (`{pod(input:{podId:"..."}){runtime{ports{ip privatePort publicPort type}}}}`).
> These pods use the local `~/.ssh/id_ed25519` key (NOT the SOPS
> `SSH_RUNPOD_FLUX_ZIMAGE` key, which was for the old 4-GPU pod).

- **Image**: `runpod/pytorch:1.0.3-cu1281-torch291-ubuntu2404`
- **Service code**: `image.pollinations.ai/z-image/server.py` (9 steps, generates at
  reduced res then SPAN 2x upscales, MAX_FINAL_PIXELS = 1536²)
- **Launch** (per pod, in `/root/launch.sh`): exports `CUDA_VISIBLE_DEVICES=0`,
  `PORT`, `PUBLIC_IP=<podid>-<port>.proxy.runpod.net`, `PUBLIC_PORT=443`,
  `SERVICE_TYPE=zimage`, `ZIMAGE_MODEL_ID=unsloth/Z-Image-Turbo-unsloth-bnb-4bit`,
  `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True`, then
  `nohup python server.py > /root/logs/zimage.log 2>&1 &`
- **NF4 requires** `low_cpu_mem_usage=True` + `bitsandbytes` (pinned in
  `z-image/requirements.txt`). bf16 `Tongyi-MAI/Z-Image-Turbo` (~22 GB) OOMs the
  20 GB A4500 — that's why the fleet runs NF4.

**Health check (per pod):**
```bash
curl -s https://8ikeaa96szx665-8767.proxy.runpod.net/health
```
Expected: `{"status":"healthy","model":"unsloth/Z-Image-Turbo-unsloth-bnb-4bit"}`

**Registry check (all image workers):**
```bash
curl -s https://gen.pollinations.ai/register | python3 -m json.tool
```
Expected: 3 zimage workers (`8ikeaa96szx665-8767`, `ft8emi5vavb7hr-8768`,
`lrrdd9jggqg9su-8767`), 0% error rate. No flux workers (flux is on Fireworks).

**Restart a worker** (fresh containers lack `screen`; use `nohup`):
```bash
ssh -i ~/.ssh/id_ed25519 -p 10859 root@213.144.200.205
pkill -f 'z-image/server.py'
bash /root/launch.sh      # re-exports env + relaunches via nohup
```

**Throughput** (NF4, from worker logs): ~3.2 it/s (~2.8s) at 512², ~1.9–2.2 it/s
at 768²/960×544. A4500 ≈ 3090 at 512², A4500 slightly faster at large res. Each
worker sustains ~1100 img/hr; 3 workers ≈ 3300 img/hr ceiling. Real demand
(Tinybird, 24h avg) ~1650 served img/hr → ~50% utilization.

### Pod hsl3ksl31lvrcc — old Flux + Z-Image 4-GPU pod (TERMINATED)

The original 4× RTX 4090 pod ($1.36/hr) hosted flux (GPUs 0,1, INT4 nunchaku) and
Z-Image (GPUs 2,3, bf16). **Decommissioned 2026-06-02** (flux→Fireworks,
Z-Image→3-pod) and **TERMINATED 2026-06-03** — pod + volume deleted, not
recoverable. A fresh pod would be needed to revisit the 4-GPU layout.

## Provider: Fireworks (serverless)

### Flux

flux is served by **Fireworks FLUX serverless** (PR #11502) — no GPU pod to
manage. Auth via `FIREWORKS_API_KEY` in
`gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json` (sops). Billed
pay-per-image. The gen worker dispatches `model=flux` straight to Fireworks; it
no longer falls back to a self-hosted GPU worker.

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
| `SSH_LAMBDA_SANA_LTX2_ACESTEP` | Lambda Labs | GH200 (LTX-2, ACE-Step, Sana) |
| `SSH_RUNPOD_FLUX_ZIMAGE` | RunPod | **DEPRECATED** — old 4-GPU pod `hsl3ksl31lvrcc` (stopped) |

The 3 Z-Image pods and Klein use the local `~/.ssh/id_ed25519` key (not SOPS). The
A4500 pods accept it directly (`root@213.144.200.205`); the 3090 zimage pod and
Klein use the RunPod relay (`ssh.runpod.io`) — get the full SSH command from the
dashboard "Connect" tab.

EC2 keys (not in SOPS):

| Key | Provider | Location |
|-----|----------|----------|
| `~/.ssh/enter-services-shared` | EC2 prod | enter services |
| `~/.ssh/enter-services-staging` | EC2 staging | enter services |
