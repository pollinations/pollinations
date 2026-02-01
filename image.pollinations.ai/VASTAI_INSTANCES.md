# Vast.ai GPU Instances - Flux & Z-Image Deployment

Last updated: 2026-02-01

## Overview

Vast.ai instances running RTX 5090 GPUs for image generation:
- **Flux**: Uses nunchaku quantization (FP4 for Blackwell GPUs) to run Flux Schnell
- **Z-Image**: Tongyi Z-Image-Turbo with SPAN 2x upscaler

## Active Instances

| Instance ID | Public IP | SSH Port | GPUs | GPU Type | Location | Services |
|-------------|-----------|----------|------|----------|----------|----------|
| 30822975 | 211.72.13.201 | 43062 | 4 | RTX 5090 | Taiwan | Flux (GPU 0,1), Z-Image (GPU 2,3) |
| 30826995 | 76.69.188.175 | 21085 | 4 | RTX 5090 | Quebec, CA | Flux (GPU 0,1,2,3) |

### Port Mappings

**Instance 30822975 (Taiwan)**
| Internal Port | External Port | Service |
|---------------|---------------|---------|
| 8765 | 43096 | Flux (GPU 0) |
| 8766 | 43078 | Flux (GPU 1) |
| 8767 | 43060 | Z-Image (GPU 2) |
| 8768 | 43066 | Z-Image (GPU 3) |

**Instance 30826995 (Quebec)**
| Internal Port | External Port | Service |
|---------------|---------------|---------|  
| 8765 | 21011 | Flux (GPU 0) |
| 8766 | 21057 | Flux (GPU 1) |
| 8767 | 21050 | Flux (GPU 2) |
| 8768 | 21059 | Flux (GPU 3) |

## SSH Access

```bash
# Instance 30822975 (Taiwan)
ssh -p 43062 -i ~/.ssh/pollinations_services_2026 root@211.72.13.201

# Instance 30826995 (Quebec)
ssh -p 21085 -i ~/.ssh/pollinations_services_2026 root@76.69.188.175
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

### 3. Install CUDA 12.8 Toolkit (Required for Building Nunchaku)

The system may have CUDA 13.0, but PyTorch nightly uses CUDA 12.8. To build nunchaku, you need CUDA 12.8 toolkit:

```bash
# Download and install CUDA 12.8 toolkit (toolkit only, no driver)
wget https://developer.download.nvidia.com/compute/cuda/12.8.0/local_installers/cuda_12.8.0_570.86.10_linux.run -O /tmp/cuda_12.8.run
chmod +x /tmp/cuda_12.8.run
/tmp/cuda_12.8.run --toolkit --silent --override

# Verify installation
/usr/local/cuda-12.8/bin/nvcc --version
# Should show: Cuda compilation tools, release 12.8

# Set PATH for building (add to your shell or run before building)
export PATH=/usr/local/cuda-12.8/bin:$PATH
export LD_LIBRARY_PATH=/usr/local/cuda-12.8/lib64:$LD_LIBRARY_PATH
```

### 4. Build Nunchaku from Source

RTX 5090 (Blackwell, sm_120) requires building nunchaku from source:

```bash
cd /workspace/flux
source venv/bin/activate

# Ensure CUDA 12.8 is in PATH (must match PyTorch's CUDA version)
export PATH=/usr/local/cuda-12.8/bin:$PATH
export LD_LIBRARY_PATH=/usr/local/cuda-12.8/lib64:$LD_LIBRARY_PATH

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

### 5. Install Server Dependencies

```bash
cd /workspace/flux
source venv/bin/activate

pip install fastapi uvicorn pydantic aiohttp pillow python-multipart diffusers transformers accelerate safetensors
```

### 6. Copy Server Files

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

### 7. Configure server.py for RTX 5090

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

### 8. Start the Server

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

### 9. Verify External Access

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

---

## Z-Image Setup

Z-Image uses Tongyi Z-Image-Turbo with SPAN 2x upscaler. It's simpler than Flux as it doesn't require building from source.

### 1. Initial Setup

```bash
# SSH into the instance
ssh -p <SSH_PORT> -i ~/.ssh/pollinations_services_2026 root@<PUBLIC_IP>

# Create workspace
mkdir -p /workspace/zimage
cd /workspace/zimage

# Create Python virtual environment
python3.12 -m venv venv
source venv/bin/activate

# Install PyTorch nightly with CUDA 12.8 (required for RTX 5090 / sm_120)
pip install --pre torch torchvision --index-url https://download.pytorch.org/whl/nightly/cu128

# Verify sm_120 support
python -c "import torch; print('Arch list:', torch.cuda.get_arch_list())"
# Should include 'sm_120'
```

### 2. Clone Z-Image Repository

```bash
cd /workspace/zimage
git clone https://github.com/pollinations/pollinations.git --depth 1 --sparse
cd pollinations
git sparse-checkout set image.pollinations.ai/z-image
cp -r image.pollinations.ai/z-image/* /workspace/zimage/
cd /workspace/zimage
rm -rf pollinations
```

Or copy files directly from local:

```bash
scp -P <SSH_PORT> -i ~/.ssh/pollinations_services_2026 \
  image.pollinations.ai/z-image/server.py \
  image.pollinations.ai/z-image/requirements.txt \
  root@<PUBLIC_IP>:/workspace/zimage/
```

### 3. Install Dependencies

```bash
cd /workspace/zimage
source venv/bin/activate

# Install requirements (torch/torchvision already installed)
pip install -r requirements.txt
```

### 4. Download SPAN Upscaler Model

```bash
mkdir -p /workspace/zimage/model_cache/span
cd /workspace/zimage/model_cache/span
wget https://github.com/the-database/traiNNer-redux/releases/download/pretrained-models/2x-NomosUni_span_multijpg.pth
```

### 5. Start Z-Image Server

```bash
cd /workspace/zimage
source venv/bin/activate

# Set environment variables
export CUDA_VISIBLE_DEVICES=<GPU_NUMBER>  # e.g., 2 or 3
export PORT=<INTERNAL_PORT>               # e.g., 8767 or 8768
export PUBLIC_IP=<INSTANCE_PUBLIC_IP>
export PUBLIC_PORT=<MAPPED_EXTERNAL_PORT> # e.g., 43060 or 43066
export SERVICE_TYPE=zimage
export PLN_IMAGE_BACKEND_TOKEN=<your_backend_token>

# Start in screen session
screen -dmS zimage-gpu<N> bash -c 'cd /workspace/zimage && source venv/bin/activate && \
  export CUDA_VISIBLE_DEVICES=<GPU> PORT=<PORT> PUBLIC_IP=<IP> PUBLIC_PORT=<EXT_PORT> \
  SERVICE_TYPE=zimage PLN_IMAGE_BACKEND_TOKEN=<TOKEN> && \
  python server.py 2>&1 | tee /tmp/zimage-gpu<N>.log'
```

### 6. Verify Z-Image

```bash
# Check health endpoint
curl http://localhost:<PORT>/health
# Expected: {"status":"healthy","model":"Tongyi-MAI/Z-Image-Turbo"}

# From external
curl http://<PUBLIC_IP>:<EXTERNAL_PORT>/health
```

### Z-Image Example (Instance 30822975)

```bash
# GPU 2 on port 8767 -> external 43060
screen -dmS zimage-gpu2 bash -c 'cd /workspace/zimage && source venv/bin/activate && \
  export CUDA_VISIBLE_DEVICES=2 PORT=8767 PUBLIC_IP=211.72.13.201 PUBLIC_PORT=43060 \
  SERVICE_TYPE=zimage PLN_IMAGE_BACKEND_TOKEN=<your_backend_token> && \
  python server.py 2>&1 | tee /tmp/zimage-gpu2.log'

# GPU 3 on port 8768 -> external 43066
screen -dmS zimage-gpu3 bash -c 'cd /workspace/zimage && source venv/bin/activate && \
  export CUDA_VISIBLE_DEVICES=3 PORT=8768 PUBLIC_IP=211.72.13.201 PUBLIC_PORT=43066 \
  SERVICE_TYPE=zimage PLN_IMAGE_BACKEND_TOKEN=<your_backend_token> && \
  python server.py 2>&1 | tee /tmp/zimage-gpu3.log'
```

## Troubleshooting

### "No kernel image available for sm_120"
- PyTorch stable doesn't support RTX 5090 yet
- Solution: Install PyTorch nightly with `--pre` flag

### "CUDA version mismatch" when building nunchaku
- The system CUDA (13.0) differs from PyTorch CUDA (12.8)
- Solution: Install CUDA 12.8 toolkit and set PATH before building:
  ```bash
  export PATH=/usr/local/cuda-12.8/bin:$PATH
  export LD_LIBRARY_PATH=/usr/local/cuda-12.8/lib64:$LD_LIBRARY_PATH
  ```

### Server exits immediately
- Check logs: `tail /tmp/flux-gpu0.log`
- Common issues: missing dependencies, wrong import paths

### 403 Forbidden from EC2
- Check that `x-backend-token` header matches `PLN_IMAGE_BACKEND_TOKEN`
- Verify the token in `enter.pollinations.ai/.testingtokens`

## Capacity Summary

| Instance | GPU | Service | VRAM Used | External Port |
|----------|-----|---------|-----------|---------------|
| 30822975 | 0 | Flux | ~21 GB | 43096 |
| 30822975 | 1 | Flux | ~21 GB | 43078 |
| 30822975 | 2 | Z-Image | ~24 GB | 43060 |
| 30822975 | 3 | Z-Image | ~23 GB | 43066 |
| 30826995 | 0 | Flux | ~21 GB | 21011 |
| 30826995 | 1 | Flux | ~21 GB | 21057 |
| 30826995 | 2 | Flux | ~21 GB | 21050 |
| 30826995 | 3 | Flux | ~21 GB | 21059 |
| **Total** | **8** | | ~173 GB | |

## Notes

- RTX 5090 uses Blackwell architecture (sm_120, CUDA 13.0)
- **Flux**: Must use FP4 quantization (not INT4) for Blackwell GPUs; nunchaku must be built from source
- **Z-Image**: Simpler setup, just needs PyTorch nightly cu128 with sm_120 support
- PyTorch nightly with CUDA 12.8 (`cu128`) required until stable release supports sm_120
- Use `python -c "import torch; print(torch.cuda.get_arch_list())"` to verify sm_120 is in the list
