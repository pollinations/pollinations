# Flux Schnell Server (Nunchaku)

Fast Flux image generation server using [MIT-HAN-LAB's Nunchaku](https://github.com/mit-han-lab/nunchaku) quantization for RTX 4090 GPUs.

## Quick Start

Deploy to a fresh Ubuntu 24.04 instance with RTX 4090 GPUs:

```bash
HF_TOKEN=your_huggingface_token \
WORKER_NUM=1 \
PUBLIC_IP=52.205.25.210 \
GPU0_PUBLIC_PORT=27235 \
GPU1_PUBLIC_PORT=30830 \
bash setup.sh
```

The script takes ~20 minutes and will:
1. Install CUDA 12.8 and Python dev headers
2. Create Python venv with PyTorch + dependencies
3. Build nunchaku from source for RTX 4090
4. Create and start systemd services for each GPU

## Current Workers (Nov 2025)

| Worker | SSH Host | Public IP | GPU 0 Port | GPU 1 Port |
|--------|----------|-----------|------------|------------|
| 1 | `ionet-flux-1` | 52.205.25.210 | 27235 | 30830 |
| 2 | `ionet-flux-2` | 52.205.25.210 | 20884 | - |
| 3 | `ionet-flux-3` | 54.185.175.109 | 29108 | - |
| 4 | `ionet-flux-4` | 52.205.25.210 | 29309 | - |

## API

### Generate Image

```bash
curl -X POST http://<IP>:<PORT>/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "a cute cat",
    "width": 1024,
    "height": 1024,
    "num_inference_steps": 4,
    "seed": 42
  }' \
  --output image.png
```

### Health Check

```bash
curl http://<IP>:<PORT>/health
```

## Management

### Check Status

```bash
# On the worker
sudo systemctl status ionet-flux-worker1-gpu0 ionet-flux-worker1-gpu1

# View logs
sudo journalctl -u ionet-flux-worker1-gpu0 -u ionet-flux-worker1-gpu1 -f
```

### Restart Services

```bash
sudo systemctl restart ionet-flux-worker1-gpu0 ionet-flux-worker1-gpu1
```

### Update Code

```bash
cd ~/pollinations && git pull
sudo systemctl restart ionet-flux-worker1-gpu0 ionet-flux-worker1-gpu1
```

## Requirements

- Ubuntu 24.04
- NVIDIA RTX 4090 GPU(s)
- ~50GB disk space
- HuggingFace token with access to Flux models

## Files

- `setup.sh` - Main deployment script
- `server.py` - FastAPI server
- `requirements.txt` - Python dependencies
- `safety_checker/` - NSFW content filter
