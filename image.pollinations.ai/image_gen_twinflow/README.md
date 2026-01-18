# Z-Image-Turbo Modal Deployment

Fast image generation using Z-Image-Turbo (6B parameters) with standard diffusers pipeline.

## Quick Start

### 1. Prerequisites

```bash
pip install modal
modal token new
```

### 2. Create Modal Secrets

1. Go to [Modal Secrets](https://modal.com/secrets)
2. Create `huggingface-secret` with key `HF_TOKEN` (your Hugging Face token)
3. Create `enter-token` with key `ENTER_TOKEN` (the Pollinations Enter token for auth)

**Token naming:**
- Modal secret uses `ENTER_TOKEN` (internal Modal secret name)
- Node.js service uses `PLN_ENTER_TOKEN` env var
- Both must contain the same token value for authentication to work

### 3. Deploy

```bash
cd image.pollinations.ai/image_gen_twinflow
modal deploy zimage_turbo.py
```

### 4. Test

```bash
# Text-to-image (9 steps - recommended)
curl -X GET "https://YOUR_MODAL_URL/generate_web?prompt=a+beautiful+sunset&width=1024&height=1024" \
  -H "x-enter-token: YOUR_TOKEN" \
  -o output.png
```

## Model Info

- **Base Model**: Z-Image-Turbo (6B parameters)
- **Pipeline**: Standard `ZImagePipeline` from diffusers
- **Steps**: 8-9 NFE (optimized turbo distillation)
- **Quality**: Excellent photorealism, bilingual text rendering (EN/CN)

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `prompt` | required | Text description of the image |
| `width` | 1024 | Image width in pixels |
| `height` | 1024 | Image height in pixels |
| `num_inference_steps` | 9 | Number of steps (8-9 recommended) |
| `guidance_scale` | 0.0 | CFG scale (must be 0.0 for Turbo) |
| `seed` | random | Random seed for reproducibility |

## Hardware Requirements & GPU Selection

### Recommended: L40S (Best Cost/Performance)

| GPU | $/sec | VRAM | Inference | Cost/Image | Notes |
|-----|-------|------|-----------|------------|-------|
| **L40S** | $0.000542 | 48GB | ~4-5s | **~$0.003** | ✅ Best balance |
| L4 | $0.000222 | 24GB | ~4-6s | ~$0.001 | Budget, tight VRAM |
| A100-40GB | $0.000583 | 40GB | ~1-2s | ~$0.001 | Fast, overkill |
| H100 | $0.001097 | 80GB | ~0.5-0.8s | ~$0.0008 | Fastest, expensive |

**Why L40S:**
- 48GB VRAM provides headroom for bf16 model + VAE + text encoder
- Only 7% more expensive than A100-40GB but better availability
- ~4-5s inference with 9 steps is good for quality
- Benchmarked: 4.8s warm inference on L40S

**Model VRAM Requirements:**
- bf16 full precision: 12-16GB
- With VAE + text encoder: ~18-20GB total
- L4 (24GB) works but tight; L40S (48GB) comfortable

## Cost Estimate

On Modal with L40S:
- ~$0.003 per image (warm inference)
- L40S rate: $0.000542/sec
- Cold start: ~97 seconds (model loading)
- Warm inference: ~4.8 seconds (9 steps)

## Architecture

TwinFlow uses a self-adversarial training approach:
- Extends time interval to t∈[−1,1]
- Uses negative time branch to create "fake" data
- Model rectifies itself by minimizing velocity field differences
- Results in 1-step/few-step generation without auxiliary networks

## References

- [TwinFlow Paper](https://arxiv.org/abs/2512.05150)
- [TwinFlow GitHub](https://github.com/inclusionAI/TwinFlow)
- [Z-Image-Turbo on HuggingFace](https://huggingface.co/inclusionAI/TwinFlow-Z-Image-Turbo)
