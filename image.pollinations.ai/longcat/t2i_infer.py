import torch
from diffusers import LongCatImagePipeline
import time 

def main():
    device = "cuda"

    pipe = LongCatImagePipeline.from_pretrained(
        "meituan-longcat/LongCat-Image",
        cache_dir="model_cache",
    )

    pipe.to(device, torch.bfloat16)
    pipe.enable_attention_slicing("max")
    pipe.enable_model_cpu_offload()
    prompt = "a cute beautiful girl"

    out = pipe(
        prompt,
        height=512,
        width=512,
        guidance_scale=4.0,
        num_inference_steps=4,
        num_images_per_prompt=1,
        enable_cfg_renorm=True,
        # enable_prompt_rewrite=True
    ).images[0]

    out.save("t2i_example.png")

if __name__ == "__main__":
    main()
