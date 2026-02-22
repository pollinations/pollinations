# io.net GPU Instances

Last updated: 2026-01-30

## Active Instances

### Primary Instance (vmaas-d24ab335) - 8x L40 GPUs

| GPU | Service | Port | Endpoint | Status |
|-----|---------|------|----------|--------|
| GPU 0 | Z-Image | 8080 | http://38.128.232.183:8080 | ✅ Working |
| GPU 1 | Z-Image | 8081 | http://38.128.232.183:8081 | ✅ Working |
| GPU 2 | Z-Image | 8082 | http://38.128.232.183:8082 | ✅ Working |
| GPU 3 | Flux | 8769 | http://38.128.232.183:8769 | ✅ Working |
| GPU 4 | Flux | 8768 | http://38.128.232.183:8768 | ✅ Working |
| GPU 5 | Flux | 8767 | http://38.128.232.183:8767 | ✅ Working |
| GPU 6 | Flux | 8766 | http://38.128.232.183:8766 | ✅ Working |
| GPU 7 | Flux | 8765 | http://38.128.232.183:8765 | ✅ Working |

**Instance Details:**
- **IP**: 38.128.232.183
- **SSH**: `ssh -i ~/.ssh/pollinations_services_2026 ionet@38.128.232.183`
- **GPUs**: 8x NVIDIA L40
- **Storage**: `/ephemeral` (6.3TB) - all services installed here
- **Direct Access**: Yes (no port mapping needed)

### Legacy Instances (May be inactive)

| Instance | Public IP | SSH Port | Model | GPU Ports | GPUs | Status |
|----------|-----------|----------|-------|-----------|------|--------|
| Flux 1 (vmaas-22e58f05) | 3.21.229.114 | 23655 | flux | 20071, 23942 | 2x RTX 4090 | ⚠️ Check |
| Flux 2 (vmaas-41e2e564) | 3.21.229.114 | 24671 | flux | 26596, 31706 | 2x RTX 4090 | ❌ Down |
| Z-Image 1 (vmaas-46665737) | 54.185.175.109 | 20033 | zimage | 24946, 21753 | 2x RTX 4090 | ❌ Down |
| Z-Image 2 (vmaas-8afc966b) | 54.185.175.109 | 28816 | zimage | 24088, 30215 | 2x RTX 4090 | ❌ Down |

## SSH Access

```bash
# Primary instance (8x L40 GPUs)
ssh -i ~/.ssh/pollinations_services_2026 ionet@38.128.232.183

# Legacy instances (may be inactive)
ssh -p 23655 -i ~/.ssh/thomashkey ionet@3.21.229.114   # Flux 1
ssh -p 24671 -i ~/.ssh/thomashkey ionet@3.21.229.114   # Flux 2
ssh -p 20033 -i ~/.ssh/thomashkey ionet@54.185.175.109  # Z-Image 1
ssh -p 28816 -i ~/.ssh/thomashkey ionet@54.185.175.109  # Z-Image 2
```

## Docker Images

| Model | Docker Image | Internal Port |
|-------|--------------|---------------|
| zimage | Native Python (venv) | 8080-8082 |
| flux | pollinations/flux-svdquant:latest | 8765 |

## Heartbeat Registration

All instances send heartbeats to the EC2 endpoint:
- **URL**: `http://ec2-3-80-56-235.compute-1.amazonaws.com:16384/register`
- **Payload**: `{"url": "http://IP:PORT", "type": "flux|zimage"}`

**Note**: The EC2 endpoint blocks external access. Heartbeats must be sent from within the io.net instances or via SSH tunnel.

## Service Management

### Primary Instance (38.128.232.183)

**Z-Image Services (systemd)**:
```bash
# Check status
sudo systemctl status zimage-gpu0 zimage-gpu1 zimage-gpu2

# View logs
sudo journalctl -u zimage-gpu0 -f

# Restart
sudo systemctl restart zimage-gpu0 zimage-gpu1 zimage-gpu2
```

**Flux Services (Docker)**:
```bash
# Check status
docker ps --filter "name=flux-gpu"

# View logs
docker logs flux-gpu7 -f

# Restart
docker restart flux-gpu7 flux-gpu6 flux-gpu5 flux-gpu4 flux-gpu3
```

### Deploying New Flux Containers

```bash
# SSH into the instance
ssh -i ~/.ssh/pollinations_services_2026 ionet@38.128.232.183

# Deploy Flux to a specific GPU (example: GPU 3 on port 8769)
docker run -d --gpus '"device=3"' --name flux-gpu3 \
  -p 8769:8765 \
  -v /ephemeral/hf-cache:/root/.cache/huggingface \
  -e PORT=8765 \
  -e PUBLIC_IP=38.128.232.183 \
  -e PUBLIC_PORT=8769 \
  -e SERVICE_TYPE=flux \
  -e REGISTER_URL='http://ec2-3-80-56-235.compute-1.amazonaws.com:16384/register' \
  -e PLN_ENTER_TOKEN=$PLN_ENTER_TOKEN \
  -e HF_TOKEN=$HF_TOKEN \
  --restart unless-stopped \
  pollinations/flux-svdquant:latest
```

**Important**: 
- Use `-v /ephemeral/hf-cache:/root/.cache/huggingface` to share model cache across containers
- Get tokens from `enter.pollinations.ai/.testingtokens` (never commit tokens to code)

### Deploying New Z-Image Services

Z-Image uses native Python with systemd. See `z-image/setup-ionet.sh` for the full setup script.

Required environment variables:
- `PLN_ENTER_TOKEN` - Authentication token (required, no default)
- `HF_TOKEN` - Hugging Face token for model downloads
- `PUBLIC_IP` - Instance public IP
- `PUBLIC_PORT` - Port for this GPU's service

## Storage Configuration

The primary instance uses `/ephemeral` (6.3TB) for all data:
- `/ephemeral/pollinations` - Git repo and Z-Image venv
- `/ephemeral/hf-cache` - Shared Hugging Face model cache for Flux
- Docker configured to use `/ephemeral/docker` for container storage

## Capacity Summary

| Model | GPUs | GPU Type | Instance |
|-------|------|----------|----------|
| Z-Image | 3 | L40 | 38.128.232.183 (GPU 0-2) |
| Flux | 5 | L40 | 38.128.232.183 (GPU 3-7) |
| **Total** | **8** | L40 | Primary instance |

### Legacy Capacity (if active)

| Model | GPUs | GPU Type | Instance |
|-------|------|----------|----------|
| Flux | 2 | RTX 4090 | 3.21.229.114 (Flux 1) |
