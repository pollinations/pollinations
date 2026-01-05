import torch
from diffusers import DiffusionPipeline
from diffusers.quantizers import PipelineQuantizationConfig
import gc

def get_quantized_longcat_pipeline(
    model_id="meituan-longcat/LongCat-Image",
    bits=4,
    device="cuda:0"
):
    """
    Load a quantized LongCat-Image pipeline.
    bits: 4 or 8 bits for quantization.
    """
    # Determine bitsandbytes backend flag
    if bits not in (4, 8):
        raise ValueError(f"Unsupported bits: {bits}; must be 4 or 8")

    # Choose backend string
    backend = f"bitsandbytes_{bits}bit"  # e.g., bitsandbytes_4bit or bitsandbytes_8bit

    # Build quantization config
    # bnb_4bit_quant_type = "nf4" is recommended for 4-bit
    # bnb_4bit_compute_dtype uses bfloat16 to keep compute stable on GPUs that support it
    quant_kwargs = {}
    if bits == 4:
        quant_kwargs = {
            "load_in_4bit": True,
            "bnb_4bit_quant_type": "nf4",
            "bnb_4bit_compute_dtype": torch.bfloat16
        }
    else:
        quant_kwargs = {
            "load_in_8bit": True
        }

    quant_config = PipelineQuantizationConfig(
        quant_backend=backend,
        quant_kwargs=quant_kwargs,
        components_to_quantize=["transformer", "text_encoder"]
    )

    # Load the pipeline with quantization
    pipe = DiffusionPipeline.from_pretrained(
        model_id,
        quantization_config=quant_config,
        torch_dtype=torch.bfloat16,
        safety_checker=None
    )

    # Move to GPU
    pipe = pipe.to(device)

    # Optionally enable attention slicing for memory
    pipe.enable_attention_slicing(1)

    return pipe

@torch.no_grad()
def generate_image(
    pipe,
    prompt: str,
    height: int = 512,
    width: int = 512,
    num_inference_steps: int = 20,
    guidance_scale: float = 4.0,
    seed: int = 42,
    save_path: str = "quant_longcat.png"
):
    """
    Generate and save an image using a quantized LongCat pipeline.
    """
    generator = torch.Generator(device="cpu").manual_seed(seed)

    # Inference
    out = pipe(
        prompt,
        height=height,
        width=width,
        num_inference_steps=num_inference_steps,
        guidance_scale=guidance_scale,
        generator=generator,
        output_type="pil"
    )

    # Extract image
    if hasattr(out, "images"):
        img = out.images[0]
    elif isinstance(out, tuple):
        img = out[0][0] if isinstance(out[0], list) else out[0]
    else:
        img = out

    # Save
    img.save(save_path)
    return img

def main():
    # Ensure CUDA
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU required")

    print("Loading quantized pipeline...")
    # Choose 4 or 8 bit
    bits = 4

    pipe = get_quantized_longcat_pipeline(
        model_id="meituan-longcat/LongCat-Image",
        bits=bits,
        device="cuda:0"
    )

    prompt = "a photorealistic portrait of two cats on a bench in a park"
    img = generate_image(
        pipe,
        prompt,
        height=512,
        width=512,
        num_inference_steps=25,
        guidance_scale=4.0,
        save_path=f"longcat_quant_{bits}bit.png"
    )

    print(f"Saved quantized longcat image to longcat_quant_{bits}bit.png")

    # Free memory
    del pipe
    torch.cuda.empty_cache()
    gc.collect()

if __name__ == "__main__":
    main()
