# Vast.ai GPU Instances - Flux Deployment

Last updated: 2026-02-01

## Overview

Vast.ai instances running RTX 5090 GPUs for Flux image generation. These use **nunchaku quantization** (FP4 for Blackwell GPUs) to run Flux Schnell efficiently.

## Active Instances

| Instance ID | Public IP | SSH Port | Flux Port (8765) | GPUs | GPU Type | Status |
|-------------|-----------|----------|------------------|------|----------|--------|
| 30822975 | 211.72.13.201 | 43062 | 43096 | 1 | RTX 5090 | ✅ Working |
| 30822967 | 120.238.149.205 | 20676 | 20704 | 1 | RTX 5090 | 🔧 Setup |

## SSH Access

```bash
# Instance 1 (30822967)
ssh -p 20676 -i ~/.ssh/pollinations_services_2026 root@120.238.149.205

# Instance 2 (30822975)
ssh -p 43062 -i ~/.ssh/pollinations_services_2026 root@211.72.13.201
```

## Setup Instructions

### Prerequisites

- Vast.ai account with API key
- SSH key: `~/.ssh/pollinations_services_2026`
- Tokens from `enter.pollinations.ai/.testingtokens`:
  - `PLN_IMAGE_BACKEND_TOKEN`
  - `HF_TOKEN`

### 1. Create Instance with Exposed Ports

When creating a Vast.ai instance, you must configure port mappings. Create a template with:
- Ports 8765-8768 exposed (for Flux servers)
- Port 22 for SSH
- Port 8080 for Jupyter (optional)

Use the Vast.ai CLI or web UI to apply the template before starting the instance.

### 2. Initial Setup (Run on Instance)

```bash
# SSH into the instance
ssh -p <SSH_PORT> -i ~/.ssh/pollinations_services_2026 root@<PUBLIC_IP>

# Create workspace
mkdir -p /workspace/flux
cd /workspace/flux

# Create Python virtual environment
python3.12 -m venv venv
source venv/bin/activate

# Install PyTorch nightly (required for RTX 5090 / Blackwell / sm_120)
pip install --pre torch torchvision --index-url https://download.pytorch.org/whl/nightly/cu128

# Verify PyTorch and CUDA
python -c "import torch; print(f'PyTorch: {torch.__version__}, CUDA: {torch.cuda.is_available()}, GPU: {torch.cuda.get_device_name(0)}')"
```

### 3. Build Nunchaku from Source

RTX 5090 (Blackwell, sm_120) requires building nunchaku from source:

```bash
cd /workspace/flux
source venv/bin/activate

# Install build dependencies
pip install ninja

# Clone and build nunchaku
git clone --recurse-submodules https://github.com/mit-han-lab/nunchaku.git
cd nunchaku

# Set SM target for Blackwell
export TORCH_CUDA_ARCH_LIST='12.0'
export NUNCHAKU_INSTALL_SM='120'

# Build (takes 5-10 minutes)
pip install --no-build-isolation .
```

### 4. Install Server Dependencies

```bash
cd /workspace/flux
source venv/bin/activate

pip install fastapi uvicorn pydantic aiohttp pillow python-multipart diffusers transformers accelerate safetensors
```

### 5. Copy Server Files

From your local machine:

```bash
# Copy server.py
scp -P <SSH_PORT> -i ~/.ssh/pollinations_services_2026 \
  image.pollinations.ai/nunchaku/server.py \
  root@<PUBLIC_IP>:/workspace/flux/

# Copy safety_checker (optional - can be disabled)
scp -P <SSH_PORT> -i ~/.ssh/pollinations_services_2026 -r \
  image.pollinations.ai/nunchaku/safety_checker \
  root@<PUBLIC_IP>:/workspace/flux/
```

### 6. Configure server.py for RTX 5090

The server needs a few modifications for Blackwell GPUs:

1. **Use FP4 model** (not INT4):
   ```python
   QUANT_MODEL_PATH = "mit-han-lab/svdq-fp4-flux.1-schnell"
   ```

2. **Update nunchaku import**:
   ```python
   from nunchaku import NunchakuFluxTransformer2dModel
   ```

3. **Disable safety checker** (if not installed):
   ```python
   # Comment out: from safety_checker.censor import check_safety
   # Replace check_safety call with: concepts, has_nsfw = [], [False]
   ```

### 7. Start the Server

Use `screen` to keep the server running after SSH disconnect:

```bash
# Set environment variables
export CUDA_VISIBLE_DEVICES=0
export PORT=8765
export PUBLIC_IP=<INSTANCE_PUBLIC_IP>
export PUBLIC_PORT=<MAPPED_FLUX_PORT>
export SERVICE_TYPE=flux
export HF_TOKEN=<your_hf_token>
export PLN_IMAGE_BACKEND_TOKEN=<your_backend_token>

# Start in screen session
screen -dmS flux bash -c 'cd /workspace/flux && source venv/bin/activate && python server.py 2>&1 | tee /tmp/flux-gpu0.log'

# Verify it's running
screen -ls
curl http://localhost:8765/docs
```

### 8. Verify External Access

```bash
# From your local machine
curl http://<PUBLIC_IP>:<MAPPED_FLUX_PORT>/docs
```

## Heartbeat Registration

Servers send heartbeats to the EC2 image service:
- **URL**: `http://ec2-3-80-56-235.compute-1.amazonaws.com:16384/register`
- **Payload**: `{"url": "http://PUBLIC_IP:PUBLIC_PORT", "type": "flux"}`
- **Interval**: Every 30 seconds

## Service Management

### Check Server Status

```bash
# List screen sessions
screen -ls

# Attach to session
screen -r flux

# Detach: Ctrl+A, then D
```

### View Logs

```bash
tail -f /tmp/flux-gpu0.log
```

### Restart Server

```bash
# Kill existing session
screen -S flux -X quit

# Start new session
screen -dmS flux bash -c 'cd /workspace/flux && source venv/bin/activate && \
  export CUDA_VISIBLE_DEVICES=0 PORT=8765 PUBLIC_IP=<IP> PUBLIC_PORT=<PORT> \
  SERVICE_TYPE=flux HF_TOKEN=<token> PLN_IMAGE_BACKEND_TOKEN=<token> && \
  python server.py 2>&1 | tee /tmp/flux-gpu0.log'
```

## Multi-GPU Setup

For instances with multiple GPUs, run separate servers on different ports:

```bash
# GPU 0 on port 8765
screen -dmS flux-gpu0 bash -c '... CUDA_VISIBLE_DEVICES=0 PORT=8765 PUBLIC_PORT=<port0> ...'

# GPU 1 on port 8766
screen -dmS flux-gpu1 bash -c '... CUDA_VISIBLE_DEVICES=1 PORT=8766 PUBLIC_PORT=<port1> ...'
```

## Troubleshooting

### "No kernel image available for sm_120"
- PyTorch stable doesn't support RTX 5090 yet
- Solution: Install PyTorch nightly with `--pre` flag

### "CUDA version mismatch" when building nunchaku
- The system CUDA (13.0) differs from PyTorch CUDA (12.8)
- Solution: Build nunchaku from source (it uses PyTorch's CUDA, not system CUDA)

### Server exits immediately
- Check logs: `tail /tmp/flux-gpu0.log`
- Common issues: missing dependencies, wrong import paths

### 403 Forbidden from EC2
- Check that `x-backend-token` header matches `PLN_IMAGE_BACKEND_TOKEN`
- Verify the token in `enter.pollinations.ai/.testingtokens`

## Capacity Summary

| Instance | GPUs | GPU Type | VRAM | Model |
|----------|------|----------|------|-------|
| 30822975 | 1 | RTX 5090 | 32GB | Flux (FP4) |
| 30822967 | 1 | RTX 5090 | 32GB | Flux (FP4) |
| **Total** | **2** | RTX 5090 | 64GB | |

## Notes

- RTX 5090 uses Blackwell architecture (sm_120, CUDA 13.0)
- Must use **FP4 quantization** (not INT4) for Blackwell GPUs
- PyTorch nightly required until stable release supports sm_120
- Nunchaku must be built from source for sm_120 support
