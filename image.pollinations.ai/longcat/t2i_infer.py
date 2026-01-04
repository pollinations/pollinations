import torch
from diffusers import LongCatImagePipeline

def main():
    gpu_diffusion = torch.device("cuda:0")
    gpu_vae = torch.device("cuda:1")

    pipe = LongCatImagePipeline.from_pretrained(
        "meituan-longcat/LongCat-Image",
        cache_dir="model_cache",
        torch_dtype=torch.bfloat16,
    )

    # Stage the modules
    pipe.text_encoder.to(gpu_diffusion)
    pipe.transformer.to(gpu_diffusion)
    pipe.vae.to(gpu_vae)

    # Disable automatic decoding
    pipe.vae.requires_grad_(False)

    # -----------------------
    # Step 1: Diffusion (GPU 0)
    # -----------------------
    with torch.no_grad():
        latents = pipe(
            prompt="a cute beautiful girl",
            height=768,
            width=768,
            guidance_scale=4.0,
            num_inference_steps=6,
            enable_cfg_renorm=True,
            output_type="latent",   # critical
        ).latents  # <-- access .latents, not .images

    # -----------------------
    # Step 2: Move latents to GPU 1
    # -----------------------
    latents = latents.to(gpu_vae)

    # Scale latents
    latents = latents / pipe.vae.config.scaling_factor

    # -----------------------
    # Step 3: Decode (GPU 1)
    # -----------------------
    with torch.no_grad():
        image = pipe.vae.decode(latents).sample

    # Postprocess
    image = pipe.image_processor.postprocess(
        image, output_type="pil"
    )[0]

    image.save("t2i_example.png")

if __name__ == "__main__":
    main()
