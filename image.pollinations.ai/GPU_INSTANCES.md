# GPU Instances

Last updated: 2026-04-04

## Capacity Summary

| Model | Workers | GPUs | Provider | Cost/hr |
|-------|---------|------|----------|---------|
| Flux | 4 | 4x RTX 5090 | Vast.ai | $1.68 |
| Z-Image | 6 | 6x RTX 5090 | Vast.ai | $3.21 |
| Sana | 1 | 1x RTX 5090 | Vast.ai | (shared) |
| Klein 4B | 1 | 1x RTX 3090 | RunPod | $0.22 |
| Flux (serverless) | 1 | ADA_24 | RunPod | pay-per-use |
| Z-Image (serverless) | 1-2 | ADA_32_PRO | RunPod | pay-per-use |
| gpu-worker | 4 | 4x RTX 4090 | RunPod | $1.36 |
| LTX-2 Video | 0-1 | H200 | Modal | auto-scaling |
| LTX-2 + ACE-Step | 1 | GH200 | Lambda Labs | — |
| **Total** | **~18** | | | **~$6.47/hr + serverless** |

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

### Instance 30937024 — Z-Image + Sana (`211.72.13.202`)

- **GPUs**: 4x RTX 5090 (32GB each) | **Cost**: $1.66/hr
- **SSH**: `ssh -i ~/.ssh/pollinations_services_2026 -p 17024 root@ssh3.vast.ai`

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

### Pod hsl3ksl31lvrcc — gpu-worker (Elliot)

- **GPU**: 4x RTX 4090 | **Cost**: $1.36/hr
- **SSH**: `ssh root@38.65.239.17 -p 28895`
- **Ports**: 8765-8768 (one per GPU)

### Serverless Endpoints

| Endpoint | ID | Image | GPU | Workers |
|----------|----|-------|-----|---------|
| pollinations-flux -fb | dm5o59qwqo1zm7 | elliotetag/runpod-flux:v1.0.3 | ADA_24 | 1 |
| pollinations-zimage -fb | 71bujxzz8mftz7 | elliotetag/runpod-zimage:v1.0.1 | ADA_32_PRO | 1-2 |

## Provider: Modal

### LTX-2 Video

- **Workspace**: `myceli-ai`
- **GPU**: H200 (auto-scaling: min=0, max=1)
- **Endpoints**: `https://myceli-ai--ltx2-comfyui-api-distilled-{enqueue,status,result}.modal.run/`
- **Auth**: `MODAL_LTX2_TOKEN_ID` / `MODAL_LTX2_TOKEN_SECRET`

## Provider: Lambda Labs

### LTX-2.3 Video + ACE-Step Music (GH200)

- **Host**: `192.222.51.105`
- **SSH**: `ssh -i ~/.ssh/thomashkey ubuntu@192.222.51.105`
- **LTX-2**: port 8765, health at `/health`
- **ACE-Step**: port 8189, systemd `acestep.service`

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
