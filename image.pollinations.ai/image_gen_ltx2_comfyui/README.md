# LTX-Video 2 ComfyUI Modal Deployment

LTX-2 19B video generation using ComfyUI workflows on Modal.com.

## Advantages over Diffusers

| Feature | Diffusers | ComfyUI |
|---------|-----------|---------|
| **Distilled Model** | ❌ Not supported | ✅ 8+4 steps (~3x faster) |
| **Spatial Upscaler** | ❌ Not supported | ✅ 2x upscaling |
| **Control LoRAs** | ❌ Manual | ✅ Built-in nodes |
| **Camera Motion** | ❌ Manual | ✅ LoRA support |
| **I2V (Image-to-Video)** | ⚠️ Limited | ✅ Full support |

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
cd image.pollinations.ai/image_gen_ltx2_comfyui
modal deploy ltx2_comfyui.py
```

### Test Locally

```bash
# Fast generation with distilled model (default)
modal run ltx2_comfyui.py --prompt "A cat walking through a garden"

# Higher quality with full model
modal run ltx2_comfyui.py --prompt "A cat walking through a garden" --use-distilled false
```

## Models Downloaded

| Model | Size | Location | Purpose |
|-------|------|----------|---------|
| `ltx-2-19b-dev-fp8.safetensors` | ~20GB | `checkpoints/` | Full quality model |
| `ltx-2-19b-distilled-fp8.safetensors` | ~20GB | `checkpoints/` | Fast distilled model |
| `gemma_3_12B_it_fp4_mixed.safetensors` | ~6GB | `text_encoders/` | Gemma 3 text encoder |
| `ltx-2-spatial-upscaler-x2-1.0.safetensors` | ~5GB | `latent_upscale_models/` | 2x spatial upscaler |
| `ltx-2-19b-distilled-lora-384.safetensors` | ~1GB | `loras/` | Distilled LoRA |

## Custom Nodes

- **ComfyUI-LTXVideo** - Official Lightricks nodes for LTX-2
  - `LTXVLoader` - Load LTX-2 checkpoint
  - `LTXAVTextEncoderLoader` - Load Gemma text encoder
  - `LTXVScheduler` - LTX-specific scheduler
  - `EmptyLTXVLatentVideo` - Create empty latent for video

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `prompt` | required | Text description of the video |
| `width` | 768 | Video width (divisible by 32) |
| `height` | 512 | Video height (divisible by 32) |
| `num_frames` | 97 | Number of frames (~4s at 24fps) |
| `seed` | random | Random seed for reproducibility |
| `use_distilled` | true | Use distilled model for faster generation |

## Generation Speed

| Model | Steps | Time | Quality |
|-------|-------|------|---------|
| **Distilled** | 12 | ~12s | Good |
| Full | 20 | ~36s | Excellent |

## API Usage

### GET Endpoint
```bash
curl "https://your-modal-url/generate_web?prompt=A%20cat%20walking&use_distilled=true" \
  -H "x-enter-token: YOUR_TOKEN"
```

### POST Endpoint
```bash
curl -X POST "https://your-modal-url/generate_post" \
  -H "Content-Type: application/json" \
  -H "x-enter-token: YOUR_TOKEN" \
  -d '{"prompt": "A cat walking through a garden", "use_distilled": true}'
```

## Workflow Structure

The `workflow_t2v.json` contains a text-to-video workflow:

```
LTXVLoader → Model
LTXAVTextEncoderLoader → CLIP
CLIPTextEncode (positive) → Conditioning
CLIPTextEncode (negative) → Conditioning
EmptyLTXVLatentVideo → Latent
LTXVScheduler → Sigmas
SamplerCustom → Sampled Latent
VAEDecode → Video
SaveVideo → Output
```

## Resources

- [LTX-2 GitHub](https://github.com/Lightricks/LTX-2)
- [ComfyUI-LTXVideo](https://github.com/Lightricks/ComfyUI-LTXVideo)
- [LTX-2 HuggingFace](https://huggingface.co/Lightricks/LTX-2)
- [Modal ComfyUI Docs](https://modal.com/docs/examples/comfyapp)
- [LTX Documentation](https://docs.ltx.video/open-source-model/integration-tools/comfy-ui)
