# Vast.ai GPU Instances - Deployment Guide

Last updated: 2026-02-08

## Overview

Vast.ai instances running RTX 5090 GPUs:
- **Sana Sprint**: Ultra-fast 1.6B parameter model, 2 inference steps, ~0.2s per 1024x1024 on RTX 5090
- **Flux**: Uses nunchaku quantization (FP4 for Blackwell GPUs) to run Flux Schnell
- **Z-Image**: Tongyi Z-Image-Turbo with SPAN 2x upscaler (generates at 512x512 + 2x neural upscale)
- **HeartMuLa**: Music generation model (RL-oss-3B), co-located with Sana Sprint on instance 31080854

## Critical: Direct Port Access vs SSH Tunnels

**Always use direct port access** (`-p` flag) when creating instances. SSH tunnels add ~400ms+ latency per round-trip, making a 0.2s generation take 1.8s.

| Method | Health check latency | Full generation round-trip |
|--------|---------------------|---------------------------|
| **Direct port** | ~180ms | ~0.5-0.8s |
| SSH tunnel | ~550ms | ~1.8-2.0s |

To expose ports, use `--env '-p <port>:<port>'` when creating the instance. Vast.ai maps internal ports to random external ports. Find the mapping with `vastai show instances --raw`.

## Active Instances

### Sana Sprint (Primary - Legacy image.pollinations.ai)

| Instance ID | Public IP | SSH Host | SSH Port | GPUs | GPU Type | Location | Service | Cost | Port (int→ext) |
|-------------|-----------|----------|----------|------|----------|----------|---------|------|----------------|
| 31080854 | 108.55.118.247 | ssh6.vast.ai | 10854 | 1 | RTX 5090 | Pennsylvania, US | Sana Sprint + HeartMuLa | $0.33/hr | 10003→51100, 10004→51075 |

Also running on **comfystream** (AWS L40S, `3.239.212.66:10002`) — not a Vast.ai instance.

### Flux & Z-Image (Legacy - via enter gateway)

| Instance ID | Public IP | SSH Host | SSH Port | GPUs | GPU Type | Location | Services |
|-------------|-----------|----------|----------|------|----------|----------|----------|
| 30937024 | 211.72.13.202 | ssh3.vast.ai | 17024 | 4 | RTX 5090 | Taiwan | Flux (GPU 0), Z-Image (GPU 1,2,3) |
| 30826995 | 76.69.188.175 | ssh2.vast.ai | 26994 | 4 | RTX 5090 | Quebec, CA | Flux (GPU 0,1,2,3) |
| 30939919 | 108.255.76.60 | ssh1.vast.ai | 19918 | 2 | RTX 5090 | North Carolina, US | Flux (GPU 0,1) |
| 30994805 | 108.255.76.60 | ssh7.vast.ai | 34804 | 1 | RTX 5090 | North Carolina, US | Z-Image |

### Port Mappings

**Instance 31080854 (Pennsylvania - Sana Sprint + HeartMuLa)**
| Internal Port | External Port | Service |
|---------------|---------------|--------|
| 10003 | 51100 | Sana Sprint |
| 10004 | 51075 | HeartMuLa Music Gen |

**Instance 30937024 (Taiwan)**
| Internal Port | External Port | Service |
|---------------|---------------|---------|
| 8765 | 47190 | Flux (GPU 0) |
| 8766 | 47162 | Z-Image (GPU 1) |
| 8767 | 47174 | Z-Image (GPU 2) |
| 8768 | 47158 | Z-Image (GPU 3) |

**Instance 30826995 (Quebec)**
| Internal Port | External Port | Service |
|---------------|---------------|---------|  
| 8765 | 21011 | Flux (GPU 0) |
| 8766 | 21057 | Flux (GPU 1) |
| 8767 | 21050 | Flux (GPU 2) |
| 8768 | 21059 | Flux (GPU 3) |

**Instance 30939919 (North Carolina)**
| Internal Port | External Port | Service |
|---------------|---------------|---------|
| 10002 | 63218 | Flux (GPU 0) |
| 10003 | 63511 | Flux (GPU 1) |

**Instance 30994805 (North Carolina)**
| Internal Port | External Port | Service |
|---------------|---------------|---------|
| 10002 | 53559 | Z-Image (GPU 0) |

## SSH Access

Vast.ai uses **proxy SSH** through `sshN.vast.ai` hosts. The SSH host and port can change if an instance is recreated.

```bash
# Instance 31080854 (Pennsylvania - Sana Sprint + HeartMuLa)
ssh -o StrictHostKeyChecking=no -i ~/.ssh/pollinations_services_2026 -p 10854 root@ssh6.vast.ai

# Instance 30937024 (Taiwan)
ssh -o StrictHostKeyChecking=no -i ~/.ssh/pollinations_services_2026 -p 17024 root@ssh3.vast.ai

# Instance 30826995 (Quebec)
ssh -o StrictHostKeyChecking=no -i ~/.ssh/pollinations_services_2026 -p 26994 root@ssh2.vast.ai

# Instance 30939919 (North Carolina - Flux)
ssh -o StrictHostKeyChecking=no -i ~/.ssh/pollinations_services_2026 -p 19918 root@ssh1.vast.ai

# Instance 30994805 (North Carolina - Z-Image)
ssh -o StrictHostKeyChecking=no -i ~/.ssh/pollinations_services_2026 -p 34804 root@ssh7.vast.ai
```

**Find current SSH details:**
```bash
vastai show instances --raw | python3 -c "
import sys, json
for i in json.load(sys.stdin):
    print(f'ID={i[\"id\"]} ssh={i[\"ssh_host\"]}:{i[\"ssh_port\"]} ip={i[\"public_ipaddr\"]} status={i[\"cur_state\"]} geo={i.get(\"geolocation\",\"?\")}')
"```

## Setup Instructions

### Prerequisites

- Vast.ai account with API key
- SSH key: `~/.ssh/pollinations_services_2026`
- Tokens from `enter.pollinations.ai/.testingtokens`:
  - `PLN_IMAGE_BACKEND_TOKEN`
  - `HF_TOKEN`

### 1. Create Instance via CLI

**Important**: Use `--ssh --direct` and `--env '-p <port>:<port>'` for direct port access:

```bash
# Search for available RTX 5090 instances with good reliability and upload speed
vastai search offers 'gpu_name=RTX_5090 num_gpus=1 reliability>0.95 inet_up>200' --order 'dph' --limit 10

# Create instance with direct SSH + port access
vastai create instance <OFFER_ID> \
  --image "vastai/base-image:cuda-13.0.2-cudnn-devel-ubuntu24.04-py312" \
  --disk 50 \
  --ssh --direct \
  --env '-p 10003:10003' \
  --onstart-cmd "apt update && apt install -y git screen"
```

**Note**: The `-p 10003:10003` exposes port 10003 inside the container. Vast.ai maps it to a random external port. Find the mapping after creation:
```bash
vastai show instances --raw | python3 -c "
import sys, json
for i in json.load(sys.stdin):
    ports = i.get('ports', {})
    for k, v in ports.items():
        if '22' not in k:
            print(f'Instance {i[\"id\"]}: {k} -> external {v[0][\"HostPort\"]}')
"
```

**Critical: Attach SSH Key After Creation**

New instances do NOT automatically have your SSH key. You must attach it:

```bash
# Attach your SSH key to the instance
vastai attach ssh <INSTANCE_ID> "$(cat ~/.ssh/pollinations_services_2026.pub)"

# Verify the key was attached
vastai show ssh-keys
```

Without this step, SSH will fail with `Permission denied (publickey)`.

### 2. Configure Port Mappings

Ports are configured at instance creation time via `--env '-p <port>:<port>'`. For multi-service instances:
```bash
--env '-p 8765:8765 -p 8766:8766 -p 8767:8767 -p 8768:8768'
```

Vast.ai has a limit of 64 open ports per instance.

### 3. Initial Setup (Run on Instance)

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

### 4. Install CUDA 12.8 Toolkit (Required for Building Nunchaku)

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

### 5. Build Nunchaku from Source

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

### 6. Install Server Dependencies

```bash
cd /workspace/flux
source venv/bin/activate

pip install fastapi uvicorn pydantic aiohttp pillow python-multipart diffusers transformers accelerate safetensors
```

### 7. Copy Server Files

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

### 8. Configure server.py for RTX 5090

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

### 9. Start the Server

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

### 10. Verify External Access

```bash
# From your local machine
curl http://<PUBLIC_IP>:<MAPPED_FLUX_PORT>/docs
```

## Heartbeat Registration

Servers send heartbeats to the image dispatcher:
- **URL**: `https://image.pollinations.ai/register` (default in server.py)
- **Payload**: `{"url": "http://PUBLIC_IP:PUBLIC_PORT", "type": "sana"}`
- **Interval**: Every 30 seconds
- **View registered backends**: `curl https://image.pollinations.ai/register`

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

## Capacity Summary (2026-02-08)

### Sana Sprint (serves legacy image.pollinations.ai)

| Instance | GPU | Service | VRAM | Port | Location | Speed |
|----------|-----|---------|------|------|----------|-------|
| 31080854 | 0 | Sana Sprint | ~9.4 GB | 51100 | Pennsylvania | ~0.2s/img |
| 31080854 | 0 | HeartMuLa | 0 idle / ~13 GB peak | 51075 | Pennsylvania | ~23s/15s audio |
| comfystream | 0 | Sana Sprint | ~13 GB | 10002 | AWS US-East (L40S) | ~0.27s/img |

### Flux & Z-Image (serves via enter gateway gen.pollinations.ai)

| Instance | GPU | Service | VRAM | Port | Location |
|----------|-----|---------|------|------|----------|
| 30937024 | 0 | Flux | ~27 GB | 47190 | Taiwan |
| 30937024 | 1 | Z-Image | ~26 GB | 47162 | Taiwan |
| 30937024 | 2 | Z-Image | ~25 GB | 47174 | Taiwan |
| 30937024 | 3 | Z-Image | ~26 GB | 47158 | Taiwan |
| 30826995 | 0 | Flux | ~21 GB | 21011 | Quebec |
| 30826995 | 1 | Flux | ~21 GB | 21057 | Quebec |
| 30826995 | 2 | Flux | ~21 GB | 21050 | Quebec |
| 30826995 | 3 | Flux | ~21 GB | 21059 | Quebec |
| 30939919 | 0 | Flux | ~21 GB | 63218 | N. Carolina |
| 30939919 | 1 | Flux | ~21 GB | 63511 | N. Carolina |
| 30994805 | 0 | Z-Image | ~25 GB | 53559 | N. Carolina |
| **Total** | **13** | **2 Sana + 7 Flux + 4 Z-Image** | | |

## Notes

- RTX 5090 uses Blackwell architecture (sm_120, CUDA 13.0)
- **Sana Sprint**: Simplest setup — just PyTorch nightly + diffusers. No custom builds needed. ~0.2s per 1024x1024
- **Flux**: Must use FP4 quantization (not INT4) for Blackwell GPUs; nunchaku must be built from source
- **Z-Image**: Simpler setup, just needs PyTorch nightly cu128 with sm_120 support
- PyTorch nightly with CUDA 12.8 (`cu128`) required until stable release supports sm_120
- Use `python -c "import torch; print(torch.cuda.get_arch_list())"` to verify sm_120 is in the list
- **Always use direct port access** — never SSH tunnels for production (see comparison table above)

---

## HeartMuLa Music Generation (Co-located with Sana Sprint)

HeartMuLa-RL-oss-3B is a music generation model that creates songs from lyrics + tags. It runs on instance 31080854 alongside Sana Sprint, sharing the same RTX 5090 GPU via `lazy_load=True` (0 VRAM at idle, loads on demand).

### Instance Details

| Key | Value |
|-----|-------|
| Instance | 31080854 (Pennsylvania) |
| Screen session | `heartmula` |
| Internal port | 10004 → external 51075 |
| Venv | `/workspace/heartmula/venv` |
| Model weights | `/workspace/heartmula/ckpt/` |
| Server script | `/workspace/heartmula/server.py` |
| Local copy | `image.pollinations.ai/heartmula/server.py` |

### API

- `GET /health` — status, GPU info, VRAM
- `POST /generate` — `{lyrics, tags, max_length_ms, temperature, topk, cfg_scale}` → `audio/mpeg`

### Performance

| Metric | Value |
|--------|-------|
| 15s audio generation | ~23s |
| VRAM (idle) | 0 GB (lazy_load) |
| VRAM (LLM inference peak) | ~12.7 GB |
| VRAM (codec peak) | ~6.2 GB |
| Output format | 48kHz stereo MP3 |
| Model | HeartMuLa-RL-oss-3B-20260123 + HeartCodec-oss-20260123 |

### RTX 5090 / Nightly PyTorch Compatibility Fixes

The server includes several workarounds for Blackwell (sm_120) + PyTorch nightly:

1. **Audio saving**: `torchaudio.save()` requires `torchcodec` which is incompatible with nightly PyTorch. Monkey-patched `postprocess` to use `soundfile` instead.
2. **Codec token clamp**: LLM can generate token ID 8192 which exceeds the codec codebook range [0, 8191]. Fixed with `frames.clamp(0, 8191)` before `detokenize`.
3. **Codec dtype**: fp32 triggers CUBLAS errors on Blackwell. Codec runs in bf16.
4. **PyTorch API**: `total_mem` renamed to `total_memory` in nightly.

### Setup from Scratch

```bash
# SSH into the Sana + HeartMuLa instance
ssh -i ~/.ssh/pollinations_services_2026 -p 10854 root@ssh6.vast.ai

# Create venv with nightly PyTorch
mkdir -p /workspace/heartmula
python3.12 -m venv /workspace/heartmula/venv
source /workspace/heartmula/venv/bin/activate
pip install --pre torch torchaudio --index-url https://download.pytorch.org/whl/nightly/cu128

# Install dependencies (skip pinned torch versions)
pip install numpy==2.0.2 torchtune==0.4.0 torchao==0.9.0 torchvision \
  tqdm==4.67.1 transformers==4.57.0 tokenizers==0.22.1 einops==0.8.1 \
  accelerate==1.12.0 bitsandbytes==0.49.0 'vector-quantize-pytorch==1.27.15' \
  soundfile huggingface_hub fastapi uvicorn

# Re-install nightly torch (torchao may have pulled in stable torch)
pip install --pre torch torchaudio --index-url https://download.pytorch.org/whl/nightly/cu128 --force-reinstall --no-deps

# Install heartlib (no-deps to avoid overwriting nightly torch)
pip install --no-deps git+https://github.com/HeartMuLa/heartlib.git

# Install ffmpeg (for soundfile MP3 support)
apt-get update -qq && apt-get install -y -qq ffmpeg

# Download model weights
python3 -c "
from huggingface_hub import snapshot_download, hf_hub_download
import os
ckpt = '/workspace/heartmula/ckpt'
os.makedirs(ckpt, exist_ok=True)
snapshot_download('HeartMuLa/HeartMuLa-RL-oss-3B-20260123', local_dir=os.path.join(ckpt, 'HeartMuLa-RL-oss-3B-20260123'))
snapshot_download('HeartMuLa/HeartCodec-oss-20260123', local_dir=os.path.join(ckpt, 'HeartCodec-oss-20260123'))
hf_hub_download('HeartMuLa/HeartMuLaGen', 'tokenizer.json', local_dir=ckpt)
hf_hub_download('HeartMuLa/HeartMuLaGen', 'gen_config.json', local_dir=ckpt)
"

# Create symlinks (heartlib expects HeartMuLa-oss-3B and HeartCodec-oss)
cd /workspace/heartmula/ckpt
ln -sf HeartMuLa-RL-oss-3B-20260123 HeartMuLa-oss-3B
ln -sf HeartCodec-oss-20260123 HeartCodec-oss

# Copy server.py from local machine
# scp -P 10854 -i ~/.ssh/pollinations_services_2026 \
#   image.pollinations.ai/heartmula/server.py root@ssh6.vast.ai:/workspace/heartmula/

# Start server
screen -dmS heartmula bash -c 'source /workspace/heartmula/venv/bin/activate && \
  CUDA_VISIBLE_DEVICES=0 PORT=10004 python /workspace/heartmula/server.py 2>&1 | tee /tmp/heartmula.log'

# Verify
curl http://localhost:10004/health
```

### Management

```bash
# Attach to screen
screen -r heartmula

# View logs
tail -f /tmp/heartmula.log

# Restart
screen -S heartmula -X quit
screen -dmS heartmula bash -c 'source /workspace/heartmula/venv/bin/activate && \
  CUDA_VISIBLE_DEVICES=0 PORT=10004 python /workspace/heartmula/server.py 2>&1 | tee /tmp/heartmula.log'

# Test generation
curl -X POST http://localhost:10004/generate \
  -H 'Content-Type: application/json' \
  -d '{"lyrics": "Hello world", "tags": "pop, upbeat", "max_length_ms": 15000}' \
  -o /tmp/test.mp3
```

---

## TwinFlow-Z-Image-Turbo Benchmark Results (2026-02-01)

Tested on Instance 30829799 (single RTX 5090, Czechia)

### Performance at 1024x1024

| NFE (Steps) | Average Time | Images/sec | Notes |
|-------------|--------------|------------|-------|
| 2-NFE | **1.37s** | 0.73 | Fastest, lower quality |
| 4-NFE | **2.12s** | 0.47 | Good balance |
| 8-NFE | **3.63s** | 0.28 | Recommended quality |

### Comparison with Current Setup

| Model | Steps | Time (1024x1024) | Notes |
|-------|-------|------------------|-------|
| **TwinFlow-Z-Image-Turbo** | 2 | ~1.4s | New distilled model |
| **TwinFlow-Z-Image-Turbo** | 8 | ~3.6s | Recommended |
| Z-Image-Turbo (current) | 8 | ~4-5s | Current production |
| Flux Schnell (nunchaku FP4) | 4 | ~2-3s | Current production |

### Key Findings

1. **TwinFlow-Z-Image-Turbo** is a distilled version of Z-Image that achieves similar quality with fewer steps
2. Uses standard `ZImagePipeline` from diffusers (no custom code needed)
3. Flash Attention not available due to CUDA 13.0 vs PyTorch CUDA 12.8 mismatch
4. Model size: ~12GB VRAM usage (fits easily on RTX 5090's 32GB)

### Setup Instructions

```bash
# Install diffusers from git (required for ZImagePipeline)
pip install git+https://github.com/huggingface/diffusers

# Download and run
from diffusers import ZImagePipeline
import torch

pipe = ZImagePipeline.from_pretrained(
    "inclusionAI/TwinFlow-Z-Image-Turbo",
    subfolder="TwinFlow-Z-Image-Turbo-exp",
    torch_dtype=torch.bfloat16,
)
pipe.to("cuda")

image = pipe(
    prompt="your prompt",
    height=1024, width=1024,
    num_inference_steps=9,  # 8 actual forwards
    guidance_scale=0.0,
).images[0]
```

### Recommendation

TwinFlow-Z-Image-Turbo offers **~25% faster** generation than standard Z-Image-Turbo at equivalent quality. Consider deploying alongside or replacing current Z-Image setup for improved throughput.

---

## Sana Sprint Deployment (Quick Setup)

Sana Sprint is the fastest model to deploy — no custom builds, no CUDA toolkit install.

```bash
# 1. Create instance with direct port access
vastai create instance <OFFER_ID> \
  --image "vastai/base-image:cuda-13.0.2-cudnn-devel-ubuntu24.04-py312" \
  --disk 50 --ssh --direct \
  --env '-p 10003:10003' \
  --onstart-cmd "apt update && apt install -y git screen"

# 2. Attach SSH key
vastai attach ssh <INSTANCE_ID> "$(cat ~/.ssh/pollinations_services_2026.pub)"

# 3. Find external port mapping
vastai show instances --raw | python3 -c "
import sys, json
for i in json.load(sys.stdin):
    if i['id'] == <INSTANCE_ID>:
        for k, v in i.get('ports', {}).items():
            print(f'{k} -> external {v[0][\"HostPort\"]}')
"

# 4. SSH in and install
ssh -o StrictHostKeyChecking=no -i ~/.ssh/pollinations_services_2026 -p <SSH_PORT> root@<SSH_HOST>
mkdir -p /workspace/sana && python3 -m venv /workspace/sana/venv
source /workspace/sana/venv/bin/activate
pip install --pre torch torchvision --index-url https://download.pytorch.org/whl/nightly/cu128
pip install fastapi uvicorn pydantic aiohttp pillow diffusers transformers accelerate safetensors

# 5. Copy server.py from local machine
scp -P <SSH_PORT> -i ~/.ssh/pollinations_services_2026 \
  image.pollinations.ai/sana/server.py root@<SSH_HOST>:/workspace/sana/

# 6. Create run.sh with auto-restart
cat > /workspace/sana/run.sh << 'EOF'
#!/bin/bash
cd /workspace/sana
source venv/bin/activate
export CUDA_VISIBLE_DEVICES=0
export PORT=10003
export PUBLIC_IP=<INSTANCE_PUBLIC_IP>
export PUBLIC_PORT=<MAPPED_EXTERNAL_PORT>
export SERVICE_TYPE=sana

while true; do
    echo "[$(date)] Starting Sana server..."
    python server.py 2>&1 | tee -a /tmp/sana.log
    echo "[$(date)] Server exited, restarting in 10s..."
    sleep 10
done
EOF
chmod +x /workspace/sana/run.sh

# 7. Auto-start on container restart
echo '
if ! pgrep -f "python server.py" > /dev/null; then
    screen -dmS sana bash /workspace/sana/run.sh
fi' >> /root/.bashrc

# 8. Start now
screen -dmS sana bash /workspace/sana/run.sh

# 9. Verify (after ~30s for model download + load)
curl http://localhost:10003/health
curl http://<PUBLIC_IP>:<EXTERNAL_PORT>/health  # from outside
```

### Sana Sprint Performance (RTX 5090)

| Metric | Value |
|--------|-------|
| GPU generation time | ~0.2s (1024x1024) |
| Image encode time | ~0.004s |
| Total round-trip (direct port) | ~0.5-0.8s |
| Total round-trip (SSH tunnel) | ~1.8-2.0s |
| VRAM usage | ~13 GB |
| Model | Efficient-Large-Model/Sana_Sprint_1.6B_1024px_diffusers |
| Inference steps | 2 (SCM constraint) |

### Log Format

The server logs detailed timing breakdown per request:
```
Generation 1024x1024: total=0.214s (lock_wait=0.000s gpu=0.210s encode=0.004s) img=240KB
```

---

## TwinFlow Deployment on Instance 30829799 (2026-02-01)

### Current Setup

- **Instance**: 30829799 (RTX 5090, Czechia)
- **Server**: Running in screen session `twinflow`
- **Port**: 10002 (accessible via SSH tunnel from enter-services)
- **Model**: TwinFlow-Z-Image-Turbo (4-NFE, ~1.8s per 1024x1024)
- **Registers as**: `zimage` type at `127.0.0.1:10002`

### SSH Tunnel (Systemd Service on enter-services)

The Vast.ai instance doesn't expose port 10002 directly. A **permanent systemd service** on enter-services maintains the SSH tunnel:

**Service**: `/etc/systemd/system/twinflow-tunnel.service`

```ini
[Unit]
Description=SSH Tunnel to TwinFlow Vast.ai Instance
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
ExecStart=/usr/bin/ssh -i /home/ubuntu/.ssh/pollinations_services_2026 -p 29798 -L 10002:localhost:10002 -N -o ServerAliveInterval=60 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=no root@ssh4.vast.ai
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Tunnel Management Commands (on enter-services)**:
```bash
# Check tunnel status
sudo systemctl status twinflow-tunnel

# Restart tunnel
sudo systemctl restart twinflow-tunnel

# View tunnel logs
sudo journalctl -u twinflow-tunnel -f

# Verify tunnel is working
curl http://localhost:10002/health
```

### Management Commands

```bash
# SSH to instance
ssh -i ~/.ssh/pollinations_services_2026 -p 29798 root@ssh4.vast.ai

# Attach to screen session
screen -r twinflow

# Check logs
tail -f /tmp/twinflow.log

# Restart server
screen -X -S twinflow quit
cd /workspace/twinflow && source venv/bin/activate
screen -dmS twinflow bash -c 'PORT=10002 python server.py 2>&1 | tee /tmp/twinflow.log'

# Verify health (from enter-services)
curl http://localhost:10002/health
```

### Server Code

Located at `image_gen_twinflow/server.py` in this repository.

---

## HeartMuLa Music Generation (Instance 31080854)

### Current Setup

- **Instance**: 31080854 (RTX 5090, Pennsylvania) — co-located with Sana Sprint
- **Server**: Running in screen session `heartmula`
- **Port**: 10004 → external 51075 (direct port access)
- **External URL**: `http://108.55.118.247:51075`
- **Model**: HeartMuLa-RL-oss-3B (music generation from lyrics + tags)
- **VRAM**: 0 GB idle (lazy_load), peaks ~12.7 GB during generation
- **Performance**: ~23s for 15s of audio, 48kHz stereo MP3

### Management Commands

```bash
# SSH to instance
ssh -i ~/.ssh/pollinations_services_2026 -p 10854 root@ssh6.vast.ai

# Attach to screen session
screen -r heartmula

# Check logs
tail -f /tmp/heartmula.log

# Restart
screen -S heartmula -X quit
screen -dmS heartmula bash -c 'source /workspace/heartmula/venv/bin/activate && CUDA_VISIBLE_DEVICES=0 PORT=10004 python /workspace/heartmula/server.py 2>&1 | tee /tmp/heartmula.log'

# Verify health (direct port access)
curl http://108.55.118.247:51075/health
curl http://localhost:10004/health  # from inside instance
```

### Server Code

Located at `image.pollinations.ai/heartmula/server.py` in this repository.
