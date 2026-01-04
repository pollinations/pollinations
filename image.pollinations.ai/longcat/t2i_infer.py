import torch
from diffusers import LongCatImagePipeline

def main():
    # Explicit devices
    device_diffusion = torch.device("cuda:0")
    device_vae = torch.device("cuda:1")

    # Load pipeline without forcing device yet
    pipe = LongCatImagePipeline.from_pretrained(
        "meituan-longcat/LongCat-Image",
        cache_dir="model_cache",
        torch_dtype=torch.bfloat16,
    )

    # Move diffusion components to GPU 0
    pipe.text_encoder.to(device_diffusion)
    pipe.transformer.to(device_diffusion)

    # Keep VAE off GPU for now
    pipe.vae.to("cpu")

    # Disable internal decoding
    pipe.vae.requires_grad_(False)

    # Run diffusion → get latents only
    with torch.no_grad():
        latents = pipe(
            prompt="a cute beautiful girl",
            height=768,
            width=768,
            guidance_scale=4.0,
            num_inference_steps=6,
            enable_cfg_renorm=True,
            output_type="latent",   # critical
        ).images

    # Move VAE + latents to GPU 1
    pipe.vae.to(device_vae)
    latents = latents.to(device_vae)

    # Scale latents correctly (required)
    latents = latents / pipe.vae.config.scaling_factor

    # Decode on GPU 1
    with torch.no_grad():
        image = pipe.vae.decode(latents).sample

    # Postprocess to PIL
    image = pipe.image_processor.postprocess(
        image, output_type="pil"
    )[0]

    image.save("t2i_example.png")

if __name__ == "__main__":
    main()
