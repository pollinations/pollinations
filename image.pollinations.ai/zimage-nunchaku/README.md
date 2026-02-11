# Z-Image-Turbo Nunchaku Server

High-performance Z-Image-Turbo inference with FP4/INT4 quantization via Nunchaku.

## Features

- **Nunchaku quantization**: FP4 (Blackwell/50-series) or INT4 (older GPUs)
- **Fast inference**: 8 steps @ 768x768 in ~2-3 seconds on RTX 5090
- **Low VRAM**: ~4-6GB with quantized weights
- **Compatible**: Drop-in replacement for standard Z-Image servers

## Model

- Base: `Tongyi-MAI/Z-Image-Turbo`
- Quantized: `nunchaku-ai/nunchaku-z-image-turbo`
- Variants:
  - INT4: `svdq-int4_r32/r128/r256-z-image-turbo.safetensors`
  - FP4: `svdq-fp4_r32/r128-z-image-turbo.safetensors` (Blackwell only)

## Environment Variables

- `PORT`: Service port (default: 8766)
- `PUBLIC_IP`: Public IP for heartbeat registration
- `PUBLIC_PORT`: External port mapping
- `SERVICE_TYPE`: Registration type (default: "zimage")
- `REGISTER_URL`: Registration endpoint (default: EC2 backend)
- `PLN_IMAGE_BACKEND_TOKEN`: Backend auth token
- `NUNCHAKU_RANK`: Model rank - 32 (fast), 128 (balanced), 256 (quality) - default: 128
- `NUM_INFERENCE_STEPS`: Inference steps (default: 8)

## Setup

```bash
# Create venv
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run server
export PUBLIC_IP=YOUR_IP
export PUBLIC_PORT=YOUR_PORT
export PORT=8766
export PLN_IMAGE_BACKEND_TOKEN=your_token
python server.py
```

## Deployment on Vast.ai

```bash
# On Vast.ai instance
cd /workspace
git clone <repo> zimage-nunchaku
cd zimage-nunchaku
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start in screen
screen -dmS zimage-nunchaku bash -c "
source venv/bin/activate && \
export CUDA_VISIBLE_DEVICES=0 \
       PORT=8766 \
       PUBLIC_IP=<instance_public_ip> \
       PUBLIC_PORT=<external_port> \
       SERVICE_TYPE=zimage \
       PLN_IMAGE_BACKEND_TOKEN=<token> \
       NUNCHAKU_RANK=128 && \
python server.py 2>&1 | tee /tmp/zimage-nunchaku.log
"
```

## Performance

- **Rank 32**: ~1.5-2s @ 768x768, lower quality
- **Rank 128**: ~2-3s @ 768x768, balanced (recommended)
- **Rank 256**: ~3-4s @ 768x768, highest quality (INT4 only)

## API

Same as standard Z-Image server:

```bash
curl -X POST http://localhost:8766/generate \
  -H "Content-Type: application/json" \
  -H "x-backend-token: YOUR_TOKEN" \
  -d '{
    "prompts": ["a cat in space"],
    "width": 1024,
    "height": 1024,
    "seed": 42,
    "steps": 8
  }'
```
