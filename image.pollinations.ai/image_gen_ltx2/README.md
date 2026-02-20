# LTX-Video 2 Modal Deployment

LTX-2 19B audio-video generation model deployed on Modal.com using Diffusers.

## Quick Start

### Prerequisites

1. **Modal CLI**: Install and authenticate
   ```bash
   pip install modal
   modal token new
   ```

2. **Modal Secrets**: Set up required secrets
   ```bash
   # HuggingFace token for model downloads
   modal secret create huggingface-secret HF_TOKEN=hf_your_token_here
   
   # Enter token for API authentication
   modal secret create enter-token ENTER_TOKEN=your_enter_token_here
   ```

### Deploy

```bash
cd image.pollinations.ai/image_gen_ltx2
modal deploy ltx2_video.py
```

### Test Locally

```bash
modal run ltx2_video.py --prompt "A cat walking through a garden" --num-inference-steps 40
```

## Current Implementation

- **Pipeline**: Diffusers `LTX2Pipeline` (single-stage)
- **Precision**: Full precision bfloat16 (best quality)
- **GPU**: H200 (141GB VRAM)
- **Inference Steps**: 40 (recommended for quality)
- **Generation Time**: ~36s for 4s video at 768x512

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `prompt` | required | Text description of the video |
| `width` | 768 | Video width |
| `height` | 512 | Video height |
| `num_frames` | 97 | Number of frames (~4s at 24fps) |
| `fps` | 24 | Frames per second |
| `num_inference_steps` | 10 | Denoising steps (use 40 for best quality) |
| `seed` | random | Random seed for reproducibility |

---

## Research Findings

### What Works

| Approach | Quality | Speed | Notes |
|----------|---------|-------|-------|
| **Diffusers bfloat16** | ✅ Excellent | ~36s | **Recommended** - Full precision, best quality |
| Diffusers FP8 | ⚠️ Glitchy | ~19s | Artifacts due to weight loading issues |

### What Doesn't Work (OOM on H200 141GB)

| Approach | Issue |
|----------|-------|
| Official `DistilledPipeline` | OOM during transformer forward pass |
| Official `TI2VidTwoStagesPipeline` | OOM during transformer forward pass |
| 4-bit quantized Gemma + DistilledPipeline | Still OOM |
| 8-bit quantized Gemma + DistilledPipeline | Still OOM |
| CPU offload Gemma + DistilledPipeline | Still OOM |
| 2x A100 80GB | Got 40GB GPUs, still OOM |

### Root Cause: Official Pipeline Memory Issue

The official `ltx-pipelines` DistilledPipeline OOMs even on H200 (141GB) because:

1. **FP8 → bfloat16 upcasting**: The FP8 transformer weights are upcast to bfloat16 during forward pass (`_upcast_and_round` in `model_configurator.py`), effectively doubling memory from ~20GB to ~40GB during inference.

2. **Two-stage pipeline memory**: DistilledPipeline runs:
   - Stage 1: Generate at half resolution (8 steps)
   - Stage 2: Upsample 2x + refine (4 steps)
   - Peak memory exceeds 141GB

3. **Peak memory breakdown**:
   - Transformer (FP8 stored, bfloat16 compute): ~40GB
   - Gemma 12B text encoder: ~24GB
   - Spatial upsampler: ~5GB
   - VAE: ~2GB
   - Latents/activations for 97 frames: ~60-70GB
   - **Total peak**: ~150-170GB > 141GB

### Diffusers Limitations

- **No distilled checkpoint support**: Diffusers issue [#12925](https://github.com/huggingface/diffusers/issues/12925) tracks this
- **No two-stage upsampling**: Single-stage only, no 2x spatial upscaler
- **FP8 loading issues**: `strict=False` causes weight mismatches and quality degradation

### Quality Comparison

| Version | Precision | Steps | Quality |
|---------|-----------|-------|---------|
| Diffusers FP8 | 8-bit | 40 | Glitchy artifacts |
| **Diffusers bfloat16** | Full | 40 | **Excellent** |
| Official DistilledPipeline | FP8 | 8+4 | N/A (OOM) |

### Recommendations

1. **Use Diffusers with full precision bfloat16** - Best working solution
2. **Use 40 inference steps** for quality (10 is too few)
3. **Wait for Diffusers distilled support** - Issue #12925
4. **Consider NVFP4** when available - 25-35% less VRAM than FP8

---

## API Usage

### GET Endpoint
```bash
curl "https://your-modal-url/generate_web?prompt=A%20cat%20walking&num_inference_steps=40" \
  -H "x-enter-token: YOUR_TOKEN"
```

### POST Endpoint
```bash
curl -X POST "https://your-modal-url/generate_post" \
  -H "Content-Type: application/json" \
  -H "x-enter-token: YOUR_TOKEN" \
  -d '{"prompt": "A cat walking through a garden", "num_inference_steps": 40}'
```

## Resources

- [LTX-2 GitHub](https://github.com/Lightricks/LTX-2)
- [LTX-2 HuggingFace](https://huggingface.co/Lightricks/LTX-2)
- [Diffusers LTX-2 Distilled Issue](https://github.com/huggingface/diffusers/issues/12925)
- [Modal Docs](https://modal.com/docs)
