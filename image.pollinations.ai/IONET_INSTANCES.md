# io.net GPU Instances

Last updated: 2026-01-26

## Active Instances (50-50 Split: 2 Flux + 2 Z-Image = 4 instances, 8 GPUs)

| Instance | Public IP | SSH Port | Model | GPU 0 Port | GPU 1 Port | GPUs | Status |
|----------|-----------|----------|-------|------------|------------|------|--------|
| Z-Image 1 (vmaas-46665737) | 54.185.175.109 | 20033 | zimage | 10000→24946 | 10001→21753 | 2x RTX 4090 | ✅ Working |
| Z-Image 2 (vmaas-8afc966b) | 54.185.175.109 | 28816 | zimage | 10000→24088 | 10001→30215 | 2x RTX 4090 | ✅ Working |
| Flux 1 (vmaas-22e58f05) | 3.21.229.114 | 23655 | flux | 10000→20071 | 10001→23942 | 2x RTX 4090 | ✅ Working |
| Flux 2 (vmaas-41e2e564) | 3.21.229.114 | 24671 | flux | 10000→26596 | 10001→31706 | 2x RTX 4090 | ✅ Working |

## Port Mapping Explanation

- **SSH Port**: External port for SSH access (internal port 22)
- **GPU 0/1 Port**: Format is `internal→external` (e.g., `10000→22182` means container port 10000 maps to public port 22182)

## SSH Access

```bash
# Z-Image instances (2 instances, 4 GPUs)
ssh -p 20033 -i ~/.ssh/thomashkey ionet@54.185.175.109  # Z-Image 1 (vmaas-46665737)
ssh -p 28816 -i ~/.ssh/thomashkey ionet@54.185.175.109  # Z-Image 2 (vmaas-8afc966b)

# Flux instances (2 instances, 4 GPUs)
ssh -p 23655 -i ~/.ssh/thomashkey ionet@3.21.229.114   # Flux 1 (vmaas-22e58f05)
ssh -p 24671 -i ~/.ssh/thomashkey ionet@3.21.229.114   # Flux 2 (vmaas-41e2e564)
```

## Docker Images

| Model | Docker Image | Internal Port |
|-------|--------------|---------------|
| zimage | voodoohop/z-image-server:latest | 8765 |
| flux | pollinations/flux-svdquant:latest | 8765 |

## Heartbeat Registration

All instances send heartbeats to the EC2 endpoint `http://3.80.56.235:16384/register` with:
- `url`: Public URL (e.g., `http://3.21.229.114:20071`)
- `type`: Service type (`flux` or `zimage`)

**Important**: Direct EC2 endpoint bypasses Cloudflare blocking issues with certain io.net IPs

## Systemd Services (Z-Image)

Z-Image instances use systemd services:
- `zimage-gpu0.service` - GPU 0 container
- `zimage-gpu1.service` - GPU 1 container

## Flux Container Commands

```bash
# Start Flux containers on vmaas-22e58f05 (3.21.229.114)
docker run -d --gpus '"device=0"' --name flux1 \
  -p 10000:8765 \
  -e PUBLIC_IP=3.21.229.114 \
  -e PUBLIC_PORT=20071 \
  -e SERVICE_TYPE=flux \
  -e REGISTER_URL='http://3.80.56.235:16384/register' \
  -e HF_TOKEN=<your-hf-token> \
  --restart unless-stopped \
  pollinations/flux-svdquant:latest

docker run -d --gpus '"device=1"' --name flux2 \
  -p 10001:8766 \
  -e PORT=8766 \
  -e PUBLIC_IP=3.21.229.114 \
  -e PUBLIC_PORT=23942 \
  -e SERVICE_TYPE=flux \
  -e REGISTER_URL='http://3.80.56.235:16384/register' \
  -e HF_TOKEN=<your-hf-token> \
  --restart unless-stopped \
  pollinations/flux-svdquant:latest

# Start Flux containers on vmaas-41e2e564 (3.21.229.114)
docker run -d --gpus '"device=0"' --name flux1 \
  -p 10000:8765 \
  -e PUBLIC_IP=3.21.229.114 \
  -e PUBLIC_PORT=26596 \
  -e SERVICE_TYPE=flux \
  -e REGISTER_URL='http://3.80.56.235:16384/register' \
  -e HF_TOKEN=<your-hf-token> \
  --restart unless-stopped \
  pollinations/flux-svdquant:latest

docker run -d --gpus '"device=1"' --name flux2 \
  -p 10001:8766 \
  -e PORT=8766 \
  -e PUBLIC_IP=3.21.229.114 \
  -e PUBLIC_PORT=31706 \
  -e SERVICE_TYPE=flux \
  -e REGISTER_URL='http://3.80.56.235:16384/register' \
  -e HF_TOKEN=<your-hf-token> \
  --restart unless-stopped \
  pollinations/flux-svdquant:latest
```

## Rebuilding the Docker Image

The Flux image uses a pre-built base with nunchaku compiled for SM 8.9 (RTX 4090).
Building nunchaku from source in Docker fails without GPU access, so we patch
the base image with updated server.py instead.

### Building Updated Image with Fixes

```bash
cd image.pollinations.ai/nunchaku
./build-updated-image.sh
```

This creates `pollinations/flux-svdquant:updated` with:
- Updated server.py with PUBLIC_PORT support
- Direct EC2 endpoint as default REGISTER_URL
- Proper environment variable handling

### Manual Patching (Current Method)

Until the updated image is deployed, patch containers after starting:

```bash
# Copy updated server.py to containers
scp server.py ionet@HOST:/home/ionet/server.py
sudo docker cp /home/ionet/server.py flux1:/app/server.py
sudo docker cp /home/ionet/server.py flux2:/app/server.py
sudo docker restart flux1 flux2
```

## Capacity Summary

| Model | Instances | Total GPUs | GPU Type |
|-------|-----------|------------|----------|
| zimage | 2 | 4 | RTX 4090 |
| flux | 2 | 4 | RTX 4090 |
| **Total** | **4** | **8** | RTX 4090 |
