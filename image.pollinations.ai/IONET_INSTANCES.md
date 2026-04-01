# GPU Instances

Last updated: 2026-03-22 (verified via SSH + Vast.ai CLI + EC2 gateway)

## Provider: Vast.ai

All GPU instances run on Vast.ai. Manage via `vastai` CLI (API key in `~/.vast_api_key`).

```bash
vastai show instances          # list all instances
vastai show instances --raw    # JSON with full details (ports, IPs)
vastai ssh-url <instance_id>   # get SSH URL
```

## Active Instances

### Instance 30826995 — Flux (`76.69.188.175`)

- **Machine**: 24391 | **GPUs**: 4x RTX 5090 (32GB each) | **Cost**: $1.68/hr
- **SSH**: `ssh -i ~/.ssh/pollinations_services_2026 -p 26994 root@ssh2.vast.ai`
- **Running since**: Feb 1, 2026
- **Process manager**: `screen` sessions (`flux-gpu0` through `flux-gpu3`)

| GPU | Screen Session | CUDA Device | Internal Port | Public Port | Public Endpoint |
|-----|---------------|-------------|---------------|-------------|-----------------|
| 0 | flux-gpu0 | 0 | 8765 | 21011 | http://76.69.188.175:21011 |
| 1 | flux-gpu1 | 1 | 8766 | 21057 | http://76.69.188.175:21057 |
| 2 | flux-gpu2 | 2 | 8767 | 21050 | http://76.69.188.175:21050 |
| 3 | flux-gpu3 | 3 | 8768 | 21059 | http://76.69.188.175:21059 |

**Code**: `/workspace/flux` with Python venv, runs `server.py`

### Instance 30937024 — Z-Image + Sana (`211.72.13.202`)

- **Machine**: 47454 | **GPUs**: 4x RTX 5090 (32GB each) | **Cost**: $1.66/hr
- **SSH**: `ssh -i ~/.ssh/pollinations_services_2026 -p 17024 root@ssh3.vast.ai`
- **Running since**: Mar 8, 2026
- **Process manager**: `screen` sessions

| GPU | Screen Session | CUDA Device | Internal Port | Public Port | Public Endpoint | Service |
|-----|---------------|-------------|---------------|-------------|-----------------|---------|
| 0 | sana-gpu0 | 0 | 8765 | 47190 | http://211.72.13.202:47190 | **Sana** (not registered with EC2) |
| 1 | zimage-gpu1 | 1 | 8766 | 47162 | http://211.72.13.202:47162 | Z-Image |
| 2 | zimage-gpu2 | 2 | 8767 | 47174 | http://211.72.13.202:47174 | Z-Image |
| 3 | zimage-gpu3 | 3 | 8768 | 47158 | http://211.72.13.202:47158 | Z-Image |

### Instance 32608960 — Z-Image (`114.32.64.6`)

- **Machine**: 23978 | **GPUs**: 4x RTX 5090 (32GB each) | **Cost**: $1.55/hr
- **SSH**: `ssh -i ~/.ssh/pollinations_services_2026 -p 18960 root@ssh3.vast.ai`
- **Running since**: Mar 9, 2026
- **Process manager**: `screen` sessions
- **Code**: `/root/pollinations/image.pollinations.ai/z-image` with venv at `/root/venv-zimage`

| GPU | Screen Session | CUDA Device | Internal Port | Public Port | Public Endpoint | Service |
|-----|---------------|-------------|---------------|-------------|-----------------|---------|
| 0 | — | — | — | — | — | **IDLE** (2 MiB VRAM) |
| 1 | zimage-gpu1 | 1 | 8766 | 40160 | http://114.32.64.6:40160 | Z-Image |
| 2 | zimage-gpu2 | 2 | 8767 | 40184 | http://114.32.64.6:40184 | Z-Image |
| 3 | zimage-gpu3 | 3 | 8768 | 40151 | http://114.32.64.6:40151 | Z-Image |

### LTX-2 Video (Modal — separate provider)

- **Provider**: Modal (workspace `myceli-ai`)
- **GPU**: H200 (auto-scaling: min=0, max=1)
- **Endpoints**: `https://myceli-ai--ltx2-comfyui-api-distilled-{enqueue,status,result}.modal.run/`
- **Auth**: `MODAL_LTX2_TOKEN_ID` / `MODAL_LTX2_TOKEN_SECRET`
- **Config**: `video_gen_ltx2modal/ltx2-t2v-distilled/comfyapp_ltx_distilled.py`

## Exited/Unused Vast.ai Instances

These are still in the Vast.ai account but not running:

| Instance ID | Machine | GPUs | Public IP | Cost/hr | Status |
|-------------|---------|------|-----------|---------|--------|
| 30829799 | 9754 | 1x RTX 5090 | 78.44.170.162 | $0.31 | exited |
| 30939919 | 51714 | 2x RTX 5090 | 108.255.76.60 | $0.84 | exited |
| 31080854 | 17419 | 1x RTX 5090 | 108.55.118.247 | $0.35 | exited |
| 32506004 | 51612 | 1x RTX 4090 | 38.117.87.45 | $0.32 | exited |

### Other Running (non-Pollinations?)

| Instance ID | Machine | GPUs | Public IP | Cost/hr | Notes |
|-------------|---------|------|-----------|---------|-------|
| 30994805 | 46531 | 1x RTX 5090 | 108.255.76.60 | $0.44 | Port 10002 exposed, unknown purpose |

## Capacity Summary

| Model | Workers | GPUs | Host(s) | Vast Instance |
|-------|---------|------|---------|---------------|
| Flux | 4 | 4x RTX 5090 | 76.69.188.175 | 30826995 |
| Z-Image | 6 | 6x RTX 5090 | 211.72.13.202, 114.32.64.6 | 30937024, 32608960 |
| Sana | 1 | 1x RTX 5090 | 211.72.13.202 | 30937024 |
| LTX-2 | 0-1 | H200 | Modal | — |
| **IDLE** | — | **1x RTX 5090** | **114.32.64.6 GPU 0** | **32608960** |
| **Total active** | **11** | **11x RTX 5090 + 1x H200** | | |

**Monthly cost** (running instances): ~$4.89/hr = **~$3,520/mo**

## SSH Access

All instances use the `pollinations_services_2026` SSH key:

```bash
# Flux (76.69.188.175)
ssh -i ~/.ssh/pollinations_services_2026 -p 26994 root@ssh2.vast.ai

# Z-Image + Sana (211.72.13.202)
ssh -i ~/.ssh/pollinations_services_2026 -p 17024 root@ssh3.vast.ai

# Z-Image (114.32.64.6)
ssh -i ~/.ssh/pollinations_services_2026 -p 18960 root@ssh3.vast.ai
```

## Heartbeat Registration

All GPU workers send heartbeats to the EC2 gateway:
- **URL**: `http://ec2-3-80-56-235.compute-1.amazonaws.com:16384/register`
- **Payload**: `{"url": "http://IP:PORT", "type": "flux|zimage"}`

To check currently registered servers:
```bash
curl -s http://ec2-3-80-56-235.compute-1.amazonaws.com:16384/register
```

## Service Management

Workers run in `screen` sessions. Common commands:

```bash
# List sessions
screen -ls

# Attach to a session
screen -r flux-gpu0

# Detach: Ctrl+A, D

# View logs
tail -f /tmp/flux-gpu0.log      # Flux instance
tail -f /tmp/zimage-gpu1.log    # Z-Image (211.72.13.202)
tail -f /root/zimage-gpu1.log   # Z-Image (114.32.64.6)

# Start a new worker (example: Flux on GPU 0)
screen -dmS flux-gpu0 bash -c "export CUDA_VISIBLE_DEVICES=0 PORT=8765 PUBLIC_IP=<IP> PUBLIC_PORT=<PORT> SERVICE_TYPE=flux PLN_IMAGE_BACKEND_TOKEN=<TOKEN> && cd /workspace/flux && source venv/bin/activate && python server.py 2>&1 | tee /tmp/flux-gpu0.log"
```

## Required Environment Variables

- `PLN_IMAGE_BACKEND_TOKEN` — Auth token for EC2 gateway heartbeat
- `HF_TOKEN` — Hugging Face token for model downloads
- `PUBLIC_IP` — Instance public IP (from Vast.ai)
- `PUBLIC_PORT` — Vast.ai mapped port for this worker
- `SERVICE_TYPE` — `flux` or `zimage`
- `REGISTER_URL` — EC2 heartbeat URL
- `CUDA_VISIBLE_DEVICES` — GPU index (0-3)
- `PORT` — Internal port (8765-8768)

## Defunct io.net Instances

Previously hosted on io.net, all dead since ~Jan 2026:

| Instance | IP | Previous Role |
|----------|----|---------------|
| vmaas-d24ab335 | 38.128.232.183 | 8x L40 (3 Z-Image + 5 Flux) |
| vmaas-22e58f05 | 3.21.229.114:23655 | 2x RTX 4090 Flux |
| vmaas-41e2e564 | 3.21.229.114:24671 | 2x RTX 4090 Flux |
| vmaas-46665737 | 54.185.175.109:20033 | 2x RTX 4090 Z-Image |
| vmaas-8afc966b | 54.185.175.109:28816 | 2x RTX 4090 Z-Image |
