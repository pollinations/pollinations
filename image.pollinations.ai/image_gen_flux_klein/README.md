# Flux Klein on Modal

Deploy FLUX.2 [klein] - Black Forest Labs' fastest image generation model - on Modal.

## Quick Start

### 1. Install Modal CLI

```bash
pip install modal
modal setup  # Authenticate with Modal
```

### 2. Create Modal Secrets

1. Go to [Modal Secrets](https://modal.com/secrets)
2. Create `huggingface-secret` with key `HF_TOKEN` (your Hugging Face token)
3. Create `backend-token` with key `PLN_IMAGE_BACKEND_TOKEN` (the Pollinations Enter token for auth)

### 3. Deploy

```bash
# Deploy to Modal (creates persistent endpoint)
modal deploy flux_klein.py

# Or run once locally
modal run flux_klein.py --prompt "A beautiful sunset over mountains"

# Or serve locally for development
modal serve flux_klein.py
```

## Usage

### CLI

```bash
# Basic generation
modal run flux_klein.py --prompt "A cat holding a sign"

# With options
modal run flux_klein.py \
  --prompt "Cyberpunk cityscape at night" \
  --width 1024 \
  --height 1024 \
  --num-inference-steps 4 \
  --seed 42 \
  --variant 4b

# With torch.compile (slower first run, faster subsequent)
modal run flux_klein.py --prompt "..." --compile
```

### Web Endpoint

After deploying, you get a URL like:
```
https://myceli-ai--flux-klein-fluxklein-generate-web.modal.run
```

Call it with:
```bash
curl "https://YOUR_URL?prompt=A%20cat&width=1024&height=1024" -o output.png
```

### Python SDK

```python
import modal

FluxKlein = modal.Cls.lookup("flux-klein", "FluxKlein")

# Generate image
image_bytes = FluxKlein(variant="4b").generate.remote(
    prompt="A beautiful landscape",
    width=1024,
    height=1024,
    num_inference_steps=4,
)

with open("output.png", "wb") as f:
    f.write(image_bytes)
```

## Model Variants

| Variant | Model ID | License | Notes |
|---------|----------|---------|-------|
| `4b` | FLUX.2-klein-4B | Apache 2.0 | Distilled, fastest |
| `4b-base` | FLUX.2-klein-base-4B | Apache 2.0 | Undistilled, best for fine-tuning |
| `9b` | FLUX.2-klein-9B | Non-commercial | Higher quality |

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `prompt` | required | Text description of the image |
| `width` | 1024 | Image width in pixels |
| `height` | 1024 | Image height in pixels |
| `guidance_scale` | 4.0 | How closely to follow the prompt |
| `num_inference_steps` | 4 | Number of denoising steps (4-50) |
| `seed` | None | Random seed for reproducibility |

## Hardware Requirements

- **GPU**: L40S (48GB) - currently deployed
- **VRAM**: ~13GB minimum
- **Inference time**: ~2-3 seconds on L40S after warm-up

## Cost Estimate

On Modal with L40S:
- ~$0.008 per image (at ~15s avg including cold starts)
- L40S rate: $0.000542/sec
- Cold start: ~30-60 seconds (model loading)
- Warm inference: ~2-3 seconds

## Troubleshooting

### "Flux2KleinPipeline not found"
Update diffusers to latest:
```bash
pip install -U diffusers
```

### Out of memory
Try enabling CPU offload in the code:
```python
self.pipe.enable_model_cpu_offload()
```

### Slow first inference
This is normal - the model needs to load. Use `--compile` for faster subsequent runs.

## Links

- [FLUX.2 Klein Model Card](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B)
- [Black Forest Labs](https://bfl.ai/models/flux-2-klein)
- [Modal Documentation](https://modal.com/docs)
