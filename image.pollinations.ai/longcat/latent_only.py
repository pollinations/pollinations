import torch
import torch.nn as nn
from diffusers import LongCatImagePipeline


def main():
    device = torch.device("cuda:0")

    pipe = LongCatImagePipeline.from_pretrained(
        "meituan-longcat/LongCat-Image",
        torch_dtype=torch.float16,
    ).to(device)

    # Memory optimizations (no INT8, no compile)
    pipe.enable_xformers_memory_efficient_attention()
    pipe.enable_attention_slicing("max")
    pipe.set_progress_bar_config(disable=True)

    with torch.inference_mode():
        out = pipe(
            prompt="two cats sitting on a bench in a park",
            height=512,
            width=512,
            num_inference_steps=20,
            guidance_scale=3.0,
            enable_cfg_renorm=True,
            output_type="latent",   # stop at latents
        )

    latents = out.images

    # Print raw latent information
    print("Latents produced successfully")
    print(f"Shape        : {latents.shape}")
    print(f"Dtype        : {latents.dtype}")
    print(f"Device       : {latents.device}")
    print(f"Min value    : {latents.min().item():.6f}")
    print(f"Max value    : {latents.max().item():.6f}")
    print(f"Mean         : {latents.mean().item():.6f}")
    print(f"Std          : {latents.std().item():.6f}")

    print("\nLatent slice [0, :5, :5]:")
    print(latents[0, :5, :5])


if __name__ == "__main__":
    main()
