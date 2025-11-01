# IO.NET Flux Worker Deployment Guide

Complete guide for deploying Flux image generation workers on IO.NET instances using Nunchaku quantized models.

## Overview

This deployment uses:
- **Nunchaku**: Quantized Flux models for efficient inference
- **IO.NET**: GPU compute infrastructure
- **Systemd**: Service management for automatic restarts
- **FastAPI**: HTTP server for image generation requests

## Quick Start

### 1. Get IO.NET Instance Details

From your IO.NET dashboard, note:
- Public IP address
- SSH port
- GPU 0 port mapping (internal 10000 → public port)
- GPU 1 port mapping (internal 10001 → public port)

Example:
```
Public IP: 52.205.25.210
SSH Port: 21415
GPU 0: 10000 → 20555
GPU 1: 10001 → 29648
```

### 2. SSH into Instance

```bash
ssh -p <ssh-port> ionet@<public-ip>
```

### 3. Run Deployment Script

```bash
# Clone the repo first if not already present
git clone https://github.com/pollinations/pollinations.git
cd pollinations/image.pollinations.ai/nunchaku

# Run deployment
HF_TOKEN=your_hf_token \
WORKER_NUM=3 \
PUBLIC_IP=52.205.25.210 \
GPU0_PUBLIC_PORT=20555 \
GPU1_PUBLIC_PORT=29648 \
REFERENCE_HOST=io4090-6 \
bash deploy-ionet-worker.sh
```

### 4. Wait for Models to Load

The script will:
1. Set up the repository
2. Copy pre-compiled binaries from reference host (or build if unavailable)
3. Create systemd services
4. Start the services

Models take 2-3 minutes to load into GPU memory.

### 5. Test the Deployment

```bash
# Test GPU 0
curl -X POST http://52.205.25.210:20555/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a cute cat", "num_inference_steps": 4, "guidance_scale": 3.5}' \
  --output test-gpu0.png

# Test GPU 1
curl -X POST http://52.205.25.210:29648/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a cute dog", "num_inference_steps": 4, "guidance_scale": 3.5}' \
  --output test-gpu1.png
```

## Environment Variables

### Required

- `HF_TOKEN`: HuggingFace token for model downloads
- `WORKER_NUM`: Worker number (e.g., 1, 2, 3)
- `PUBLIC_IP`: Public IP address of the IO.NET instance
- `GPU0_PUBLIC_PORT`: Public port for GPU 0
- `GPU1_PUBLIC_PORT`: Public port for GPU 1

### Optional

- `REFERENCE_HOST`: SSH hostname of a working instance to copy binaries from (default: `io4090-6`)
  - If accessible, deployment takes ~2 minutes
  - If not accessible, will build from source (~15 minutes)

## Service Management

### Check Status

```bash
# Both services
sudo systemctl status ionet-flux-worker3-gpu0 ionet-flux-worker3-gpu1

# Individual service
sudo systemctl status ionet-flux-worker3-gpu0
```

### View Logs

```bash
# Follow logs for both GPUs
sudo journalctl -u ionet-flux-worker3-gpu0 -u ionet-flux-worker3-gpu1 -f

# Last 100 lines
sudo journalctl -u ionet-flux-worker3-gpu0 -n 100
```

### Restart Services

```bash
# Restart both
sudo systemctl restart ionet-flux-worker3-gpu0 ionet-flux-worker3-gpu1

# Restart one
sudo systemctl restart ionet-flux-worker3-gpu0
```

### Stop Services

```bash
sudo systemctl stop ionet-flux-worker3-gpu0 ionet-flux-worker3-gpu1
```

## API Endpoints

### POST /generate

Generate an image from a text prompt.

**Request:**
```json
{
  "prompt": "a beautiful sunset over mountains",
  "num_inference_steps": 4,
  "guidance_scale": 3.5,
  "width": 1024,
  "height": 1024,
  "seed": 42
}
```

**Parameters:**
- `prompt` (required): Text description of the image
- `num_inference_steps` (optional, default: 4): Number of denoising steps
- `guidance_scale` (optional, default: 3.5): How closely to follow the prompt
- `width` (optional, default: 1024): Image width (will be adjusted to nearest multiple of 64)
- `height` (optional, default: 1024): Image height (will be adjusted to nearest multiple of 64)
- `seed` (optional): Random seed for reproducibility

**Response:**
```json
[{
  "image": "base64_encoded_png_data",
  "has_nsfw_concept": false,
  "concept": "safe",
  "width": 1024,
  "height": 1024,
  "seed": 42,
  "prompt": "a beautiful sunset over mountains"
}]
```

## Heartbeat System

The server automatically sends heartbeats to `https://image.pollinations.ai/register` every 30 seconds with:
- Public URL (e.g., `http://52.205.25.210:20555`)
- Service type: `flux`

This registers the worker with the load balancer for automatic traffic distribution.

## Troubleshooting

### Services Won't Start

Check logs for errors:
```bash
sudo journalctl -u ionet-flux-worker3-gpu0 -n 50
```

Common issues:
- Port already in use: Check if another process is using ports 10000/10001
- Missing HF_TOKEN: Ensure .env file exists in /home/ionet/.env
- CUDA errors: Verify GPU is accessible with `nvidia-smi`

### Models Loading Slowly

First-time model download can take 5-10 minutes. Check progress:
```bash
sudo journalctl -u ionet-flux-worker3-gpu0 -f
```

### Connection Refused

- Ensure services are running: `sudo systemctl status ionet-flux-worker3-gpu0`
- Check port mappings in IO.NET dashboard
- Verify firewall allows traffic on public ports

### Out of Memory

If you see CUDA OOM errors:
- Reduce batch size (currently 1)
- Reduce image dimensions
- Check GPU memory: `nvidia-smi`

## Performance

### Expected Generation Times

With RTX 4090 and 4 inference steps:
- 1024x1024: 2-5 seconds
- 768x1280: 2-4 seconds
- 1280x768: 2-4 seconds

### GPU Memory Usage

- Model loading: ~7GB per GPU
- During generation: ~10-15GB per GPU

## Architecture

```
┌─────────────────────────────────────────────┐
│         IO.NET Instance (2x RTX 4090)       │
│                                             │
│  ┌──────────────────┐  ┌──────────────────┐│
│  │   GPU 0 Worker   │  │   GPU 1 Worker   ││
│  │   Port: 10000    │  │   Port: 10001    ││
│  │   Public: 20555  │  │   Public: 29648  ││
│  └────────┬─────────┘  └────────┬─────────┘│
│           │                     │          │
│           └──────────┬──────────┘          │
│                      │                     │
└──────────────────────┼─────────────────────┘
                       │
                       ▼
            Heartbeat Registration
         https://image.pollinations.ai/register
                       │
                       ▼
              Load Balancer Routes
            User Requests to Workers
```

## Files

- `server.py`: FastAPI server with Flux pipeline
- `requirements.txt`: Python dependencies
- `deploy-ionet-worker.sh`: Deployment script
- `safety_checker/`: NSFW content filtering
- `nunchaku/`: Quantized model package (copied during deployment)
- `venv/`: Python virtual environment (created during deployment)

## Current Deployments

| Worker | Public IP | GPU 0 Port | GPU 1 Port | Status |
|--------|-----------|------------|------------|--------|
| Worker 1 (io4090-6) | 52.205.25.210 | 31713 | 28619 | ✅ Active |
| Worker 2 (io4090-7) | 52.205.25.210 | 27017 | 20781 | ✅ Active |
| Worker 3 (io4090-8) | 52.205.25.210 | 20555 | 29648 | ✅ Active |

Total: 6 GPUs operational

## Support

For issues or questions:
- Check logs: `sudo journalctl -u ionet-flux-worker3-gpu0 -f`
- Verify GPU status: `nvidia-smi`
- Test locally: `curl http://localhost:10000/generate ...`
- Check IO.NET dashboard for port mappings and instance status
