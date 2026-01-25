# io.net GPU Instances

Last updated: 2026-01-25

## Active Instances (50-50 Split: 2 Flux + 2 Z-Image = 4 instances, 8 GPUs)

| Instance | Public IP | SSH Port | Model | GPU 0 Port | GPU 1 Port | GPUs | Status |
|----------|-----------|----------|-------|------------|------------|------|--------|
| Z-Image 1 (vmaas-46665737) | 54.185.175.109 | 20033 | zimage | 10000→24946 | 10001→21753 | 2x RTX 4090 | ⚠️ Check |
| Z-Image 2 (vmaas-8afc966b) | 54.185.175.109 | 28816 | zimage | 10000→24088 | 10001→30215 | 2x RTX 4090 | ⚠️ Check |
| Flux 1 (vmaas-22e58f05) | 3.21.229.114 | 23655 | flux | 10000→20071 | 10001→23942 | 2x RTX 4090 | ⚠️ Check |
| Flux 2 (vmaas-41e2e564) | 3.21.229.114 | 24671 | flux | 10000→26596 | 10001→31706 | 2x RTX 4090 | ⚠️ Check |

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

All instances send heartbeats to `https://image.pollinations.ai/register` with:
- `url`: Public URL (e.g., `http://52.205.25.210:22182`)
- `type`: Service type (`flux` or `zimage`)

## Systemd Services (Z-Image)

Z-Image instances use systemd services:
- `zimage-gpu0.service` - GPU 0 container
- `zimage-gpu1.service` - GPU 1 container

## Flux Container Commands

```bash
# Start Flux containers on vmaas-41a7d908 (52.205.25.210)
docker run -d --gpus '"device=0"' --name flux1 \
  -p 10000:8765 \
  -e PORT=8765 \
  -e PUBLIC_IP=52.205.25.210 \
  -e PUBLIC_PORT=22182 \
  -e SERVICE_TYPE=flux \
  -e HF_TOKEN=<token> \
  pollinations/flux-svdquant:latest

docker run -d --gpus '"device=1"' --name flux2 \
  -p 10001:8765 \
  -e PORT=8765 \
  -e PUBLIC_IP=52.205.25.210 \
  -e PUBLIC_PORT=31535 \
  -e SERVICE_TYPE=flux \
  -e HF_TOKEN=<token> \
  pollinations/flux-svdquant:latest

# Start Flux containers on vmaas-22e58f05 (3.21.229.114)
docker run -d --gpus '"device=0"' --name flux1 \
  -p 10000:8765 \
  -e PORT=8765 \
  -e PUBLIC_IP=3.21.229.114 \
  -e PUBLIC_PORT=20071 \
  -e SERVICE_TYPE=flux \
  -e HF_TOKEN=<token> \
  pollinations/flux-svdquant:latest

docker run -d --gpus '"device=1"' --name flux2 \
  -p 10001:8765 \
  -e PORT=8765 \
  -e PUBLIC_IP=3.21.229.114 \
  -e PUBLIC_PORT=23942 \
  -e SERVICE_TYPE=flux \
  -e HF_TOKEN=<token> \
  pollinations/flux-svdquant:latest
```

## Rebuilding the Docker Image

The Flux image uses a pre-built base with nunchaku compiled for SM 8.9 (RTX 4090).
Building nunchaku from source in Docker fails without GPU access, so we patch
the base image with updated server.py instead.

```bash
# On a machine with the base image (87362500968a):
cd image.pollinations.ai/nunchaku
./rebuild-image.sh           # Build and push
./rebuild-image.sh --no-push # Build only
```

## Capacity Summary

| Model | Instances | Total GPUs | GPU Type |
|-------|-----------|------------|----------|
| zimage | 2 | 4 | RTX 4090 |
| flux | 2 | 4 | RTX 4090 |
| **Total** | **4** | **8** | RTX 4090 |
