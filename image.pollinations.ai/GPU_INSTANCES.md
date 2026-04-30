# GPU Instances

Last updated: 2026-04-13

## Capacity Summary

| Model | Workers | GPUs | Provider | Cost/hr | Status |
|-------|---------|------|----------|---------|--------|
| Flux (INT4) | 2 | 2x RTX 4090 | RunPod | (shared) | **ACTIVE — production** |
| Z-Image | 2 | 2x RTX 4090 | RunPod | (shared) | **ACTIVE — production** |
| Klein 4B | 1 | 1x RTX 3090 | RunPod | $0.22 | **ACTIVE** |
| LTX-2 + ACE-Step + Sana | 1 | GH200 | Lambda Labs | — | **ACTIVE** |
| **Total active** | **~6** | | | **~$1.58/hr** | |

## Provider: RunPod

Manage via `runpodctl` CLI or GraphQL API at `api.runpod.io/graphql`.
Job invocation at `api.runpod.ai/v2/{endpoint}/run` (note: different domain).

```bash
runpodctl pod list             # list pods
runpodctl pod get <id>         # pod details
```

### Pod lqh6weiexk4sth — Klein 4B

> Pod ID changes if recreated. Check `runpodctl pod list` and the `KLEIN_URL` env var (sops: `image.pollinations.ai/secrets/env.json`).

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

### Pod hsl3ksl31lvrcc — Flux + Z-Image (4x RTX 4090)

- **GPU**: 4x RTX 4090 (24GB each) | **Cost**: $1.36/hr (community cloud)
- **SSH**: `ssh -i <SSH_RUNPOD_FLUX_ZIMAGE from SOPS> -p 19489 root@38.65.239.17`
- **Image**: `runpod/pytorch:1.0.3-cu1281-torch291-ubuntu2404`
- **Storage**: 100GB container disk + 50GB persistent volume
- **Repo**: `/opt/pollinations` (symlinked from `/workspace/pollinations`)

| GPU | Screen Session | Port | Proxy URL | Service |
|-----|---------------|------|-----------|---------|
| 0 | flux-gpu0 | 8765 | `https://hsl3ksl31lvrcc-8765.proxy.runpod.net` | Flux (INT4, nunchaku) |
| 1 | flux-gpu1 | 8766 | `https://hsl3ksl31lvrcc-8766.proxy.runpod.net` | Flux (INT4, nunchaku) |
| 2 | zimage-gpu2 | 8767 | `https://hsl3ksl31lvrcc-8767.proxy.runpod.net` | Z-Image (Turbo + SPAN 2x) |
| 3 | zimage-gpu3 | 8768 | `https://hsl3ksl31lvrcc-8768.proxy.runpod.net` | Z-Image (Turbo + SPAN 2x) |

**Venvs** (separate per service):
- Flux: `/opt/pollinations/image.pollinations.ai/nunchaku/venv` (torch 2.9.1+cu128)
- Z-Image: `/opt/pollinations/image.pollinations.ai/z-image/venv`

**Health check:**
```bash
curl -s https://hsl3ksl31lvrcc-8765.proxy.runpod.net/generate -X POST \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test","width":512,"height":512}' -o /dev/null -w "HTTP %{http_code}"
```

**Registry check (all workers):**
```bash
curl -s http://ec2-54-147-14-220.compute-1.amazonaws.com:16384/register | python3 -m json.tool
```

**Restart a worker:**
```bash
ssh -i <SSH_RUNPOD_FLUX_ZIMAGE from SOPS> -p 19489 root@38.65.239.17
screen -S flux-gpu0 -X quit
screen -dmS flux-gpu0 bash -c 'source /opt/pollinations/image.pollinations.ai/nunchaku/venv/bin/activate && \
  CUDA_VISIBLE_DEVICES=0 PORT=8765 PUBLIC_IP=hsl3ksl31lvrcc-8765.proxy.runpod.net PUBLIC_PORT=443 \
  SERVICE_TYPE=flux python /opt/pollinations/image.pollinations.ai/nunchaku/server.py 2>&1 | tee /tmp/flux-gpu0.log'
```

**Key notes:**
- Uses INT4 quantization (not FP4) — RTX 4090 is Ada Lovelace, not Blackwell
- Heartbeats register with `https://` proxy URLs (patched `server.py` line 63)
- ~2.9s per Flux image, ~1.5s per Z-Image at 512x512

## Provider: Lambda Labs

### LTX-2.3 Video + ACE-Step Music + Sana (GH200)

- **Host**: `192.222.51.105`
- **SSH**: `ssh -i <SSH_LAMBDA_SANA_LTX2_ACESTEP from SOPS> ubuntu@192.222.51.105`
- **LTX-2**: port 8765, health at `/health`
- **ACE-Step**: port 8189, systemd `acestep.service`
- **Sana**: port 8766, systemd `sana.service`, ~0.165s/img

## Provider: EC2 (AWS)

### Production — enter services

- **Host**: `54.147.14.220`
- **SSH**: `ssh -i ~/.ssh/enter-services-shared ubuntu@54.147.14.220`
- **Image service**: port 16384

### Staging

- **Host**: `44.222.254.250`
- **SSH**: `ssh -i ~/.ssh/enter-services-staging ubuntu@44.222.254.250`

## Heartbeat Registration

GPU workers send heartbeats to EC2 gateway:
- **URL**: `http://ec2-54-147-14-220.compute-1.amazonaws.com:16384/register`
- **Check registered**: `curl -s http://ec2-54-147-14-220.compute-1.amazonaws.com:16384/register`

## SSH Keys

GPU worker SSH keys are stored in SOPS (`enter.pollinations.ai/secrets/{dev,staging,prod}.vars.json`).

Extract for use: `sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r '.KEY_NAME' > /tmp/key && chmod 600 /tmp/key`

| SOPS key | Provider | Instances |
|----------|----------|-----------|
| `SSH_RUNPOD_FLUX_ZIMAGE` | RunPod | Flux+Z-Image pod (`hsl3ksl31lvrcc`) |
| `SSH_LAMBDA_SANA_LTX2_ACESTEP` | Lambda Labs | GH200 (LTX-2, ACE-Step, Sana) |

Klein uses the RunPod relay (`ssh.runpod.io`) with `~/.ssh/id_ed25519` — no SOPS key. Get the full SSH command from the dashboard "Connect" tab.

EC2 keys (not in SOPS):

| Key | Provider | Location |
|-----|----------|----------|
| `~/.ssh/enter-services-shared` | EC2 prod | enter services |
| `~/.ssh/enter-services-staging` | EC2 staging | enter services |
