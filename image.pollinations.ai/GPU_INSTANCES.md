# GPU Instances

Last updated: 2026-04-05

## Capacity Summary

| Model | Workers | GPUs | Provider | Cost/hr | Status |
|-------|---------|------|----------|---------|--------|
| Flux (INT4) | 2 | 2x RTX 4090 | RunPod | (shared) | **ACTIVE — production** |
| Z-Image | 2 | 2x RTX 4090 | RunPod | (shared) | **ACTIVE — production** |
| Klein 4B | 1 | 1x RTX 3090 | RunPod | $0.22 | **ACTIVE** |
| LTX-2 + ACE-Step | 1 | GH200 | Lambda Labs | — | **ACTIVE** |
| Flux (serverless) | 1 | ADA_24 | RunPod | pay-per-use | Elliot |
| Z-Image (serverless) | 1-2 | ADA_32_PRO | RunPod | pay-per-use | Elliot |
| Flux | 4 | 4x RTX 5090 | Vast.ai | $1.68 | running (not in registry) |
| Z-Image + Sana | 4 | 4x RTX 5090 | Vast.ai | $1.66 | **STOPPED** |
| Sana Sprint 1.6B | 1 | A10 | Lambda Labs | — | **ACTIVE** — sana registry |
| Sana Sprint 1.6B | 1 | A100 | Lambda Labs | — | **ACTIVE** — sana registry |
| ~~SDXL Turbo (legacy sana)~~ | 1 | 1x RTX 4090 | Vast.ai | $0.36 | **STOPPED** — replaced by Lambda Labs |
| Z-Image | 3 | 3x RTX 5090 | Vast.ai | $1.55 | running (not in registry) |
| **Total active** | **~8** | | | **~$1.94/hr + serverless** |

## Provider: Vast.ai

Manage via `vastai` CLI (API key in `~/.vast_api_key`).

```bash
vastai show instances          # list all instances
vastai show instances --raw    # JSON with full details
```

### Instance 30826995 — Flux (`76.69.188.175`)

- **GPUs**: 4x RTX 5090 (32GB each) | **Cost**: $1.68/hr
- **SSH**: `ssh -i ~/.ssh/pollinations_services_2026 -p 26994 root@ssh2.vast.ai`

| GPU | Screen Session | Internal Port | Public Port | Endpoint |
|-----|---------------|---------------|-------------|----------|
| 0 | flux-gpu0 | 8765 | 21011 | http://76.69.188.175:21011 |
| 1 | flux-gpu1 | 8766 | 21057 | http://76.69.188.175:21057 |
| 2 | flux-gpu2 | 8767 | 21050 | http://76.69.188.175:21050 |
| 3 | flux-gpu3 | 8768 | 21059 | http://76.69.188.175:21059 |

### Instance 30937024 — Z-Image + Sana (`211.72.13.202`) — STOPPED

- **Status**: **STOPPED** (2026-04-04) — replaced by RunPod pod hsl3ksl31lvrcc
- **GPUs**: 4x RTX 5090 (32GB each) | **Cost**: $1.66/hr (when running)
- **SSH**: `ssh -i ~/.ssh/pollinations_services_2026 -p 17024 root@ssh3.vast.ai`
- **Restart**: `vastai start instance 30937024`

| GPU | Screen Session | Internal Port | Public Port | Service |
|-----|---------------|---------------|-------------|---------|
| 0 | sana-gpu0 | 8765 | 47190 | Sana 0.6B |
| 1 | zimage-gpu1 | 8766 | 47162 | Z-Image |
| 2 | zimage-gpu2 | 8767 | 47174 | Z-Image |
| 3 | zimage-gpu3 | 8768 | 47158 | Z-Image |

### Instance 32608960 — Z-Image (`114.32.64.6`)

- **GPUs**: 4x RTX 5090 (32GB each) | **Cost**: $1.55/hr
- **SSH**: `ssh -i ~/.ssh/pollinations_services_2026 -p 18960 root@ssh3.vast.ai`

| GPU | Screen Session | Internal Port | Public Port | Service |
|-----|---------------|---------------|-------------|---------|
| 0 | — | — | — | IDLE |
| 1 | zimage-gpu1 | 8766 | 40160 | Z-Image |
| 2 | zimage-gpu2 | 8767 | 40184 | Z-Image |
| 3 | zimage-gpu3 | 8768 | 40151 | Z-Image |

### Instance 34086100 — STOPPED (formerly SDXL Turbo / Sana)

- **Status**: **STOPPED** (2026-04-05) — replaced by Lambda Labs Sana Sprint 1.6B workers
- **GPU**: 1x RTX 4090 (24GB) | **Cost**: $0.36/hr (when running)
- **Restart**: `vastai start instance 34086100`

## Provider: RunPod

Manage via `runpodctl` CLI or GraphQL API at `api.runpod.io/graphql`.
Job invocation at `api.runpod.ai/v2/{endpoint}/run` (note: different domain).

```bash
runpodctl pod list             # list pods
runpodctl pod get <id>         # pod details
```

### Pod pi90tfk3sa9t12 — Klein 4B

- **GPU**: 1x RTX 3090 (24GB) | **Cost**: $0.22/hr (community cloud)
- **SSH**: `ssh -i ~/.runpod/ssh/RunPod-Key-Go root@213.144.200.243 -p 10207`
- **HTTP**: `https://pi90tfk3sa9t12-8000.proxy.runpod.net`
- **Service**: FLUX.2 Klein 4B (FastAPI on port 8000)
- **Auth**: `x-backend-token` header with `PLN_IMAGE_BACKEND_TOKEN`
- **Code**: `/workspace/handler.py`
- **Logs**: `/workspace/handler.log`
- **Restart**: `ssh ... "/workspace/restart.sh"`

**Health check:**
```bash
curl -s https://pi90tfk3sa9t12-8000.proxy.runpod.net/health
```

### Pod hsl3ksl31lvrcc — Flux + Z-Image (4x RTX 4090)

- **GPU**: 4x RTX 4090 (24GB each) | **Cost**: $1.36/hr (community cloud)
- **SSH**: `ssh -i ~/.ssh/thomashkey -p 28895 root@38.65.239.17`
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
ssh -i ~/.ssh/thomashkey -p 28895 root@38.65.239.17
screen -S flux-gpu0 -X quit
screen -dmS flux-gpu0 bash -c 'source /opt/pollinations/image.pollinations.ai/nunchaku/venv/bin/activate && \
  CUDA_VISIBLE_DEVICES=0 PORT=8765 PUBLIC_IP=hsl3ksl31lvrcc-8765.proxy.runpod.net PUBLIC_PORT=443 \
  SERVICE_TYPE=flux python /opt/pollinations/image.pollinations.ai/nunchaku/server.py 2>&1 | tee /tmp/flux-gpu0.log'
```

**Key notes:**
- Uses INT4 quantization (not FP4) — RTX 4090 is Ada Lovelace, not Blackwell
- Heartbeats register with `https://` proxy URLs (patched `server.py` line 63)
- Replaced Vast.ai Taiwan instance for production Flux/Z-Image traffic
- ~2.9s per Flux image, ~1.5s per Z-Image at 512x512

### Serverless Endpoints (Elliot)

| Endpoint | ID | Image | GPU | Workers |
|----------|----|-------|-----|---------|
| pollinations-flux -fb | dm5o59qwqo1zm7 | elliotetag/runpod-flux:v1.0.3 | ADA_24 | 1 |
| pollinations-zimage -fb | 71bujxzz8mftz7 | elliotetag/runpod-zimage:v1.0.1 | ADA_32_PRO | 1-2 |

## Provider: Lambda Labs

### LTX-2.3 Video + ACE-Step Music (GH200)

- **Host**: `192.222.51.105`
- **SSH**: `ssh -i ~/.ssh/thomashkey ubuntu@192.222.51.105`
- **LTX-2**: port 8765, health at `/health`
- **ACE-Step**: port 8189, systemd `acestep.service`

### Sana Sprint 1.6B (A10)

- **Host**: `150.136.85.48`
- **SSH**: `ssh -i ~/.ssh/thomashkey ubuntu@150.136.85.48`
- **Port**: 8765, health at `/health`
- **Model**: `Efficient-Large-Model/Sana_Sprint_1.6B_1024px_diffusers`
- **Speed**: ~0.60s/img
- **Registry**: Registers as `sana` type with OVH legacy service

### Sana Sprint 1.6B (A100)

- **Host**: `150.136.209.134`
- **SSH**: `ssh -i ~/.ssh/thomashkey ubuntu@150.136.209.134`
- **Port**: 8765, health at `/health`
- **Model**: `Efficient-Large-Model/Sana_Sprint_1.6B_1024px_diffusers`
- **Speed**: ~0.25s/img
- **Registry**: Registers as `sana` type with OVH legacy service

## Provider: EC2 (AWS)

### Production — enter services

- **Host**: `54.147.14.220`
- **SSH**: `ssh -i ~/.ssh/enter-services-shared-key ubuntu@54.147.14.220`
- **Image service**: port 16384
- **Text service**: port 16385

### Staging

- **Host**: `44.222.254.250`
- **SSH**: `ssh -i ~/.ssh/enter-services-staging-key ubuntu@44.222.254.250`

## Provider: OVH (Legacy)

### Legacy Image Service

- **Host**: `57.130.31.42`
- **SSH**: `ssh -i ~/.ssh/id_rsa_ovh ubuntu@57.130.31.42`
- **Port**: 16384
- **Sana tunnel**: localhost:19876 → vast.ai:47190

## Heartbeat Registration

GPU workers send heartbeats to EC2 gateway:
- **URL**: `http://ec2-54-147-14-220.compute-1.amazonaws.com:16384/register`
- **Check registered**: `curl -s http://ec2-54-147-14-220.compute-1.amazonaws.com:16384/register`

## SSH Keys

| Key | Provider | Location |
|-----|----------|----------|
| `~/.ssh/pollinations_services_2026` | Vast.ai | All instances |
| `~/.runpod/ssh/RunPod-Key-Go` | RunPod | All pods |
| `~/.ssh/thomashkey` | Lambda Labs, EC2 builder | GH200, temp EC2 |
| `~/.ssh/enter-services-shared-key` | EC2 prod | enter services |
| `~/.ssh/enter-services-staging-key` | EC2 staging | enter services |
| `~/.ssh/id_rsa_ovh` | OVH | Legacy service |

## Service Management (Vast.ai)

Workers run in `screen` sessions:

```bash
screen -ls                     # list sessions
screen -r flux-gpu0            # attach
# Ctrl+A, D to detach

tail -f /tmp/flux-gpu0.log     # logs
```
