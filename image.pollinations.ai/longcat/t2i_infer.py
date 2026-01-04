import torch
from diffusers import LongCatImagePipeline
import time 


class LatentOnlyVAE(torch.nn.Module):
    def __init__(self, vae):
        super().__init__()
        self.original_vae = vae
        self.config = vae.config

    def forward(self, latents):
        class Dummy:
            def __init__(self, sample):
                self.sample = sample
        return Dummy(latents)
    
    def encode(self, x):
        return self.original_vae.encode(x)
    
    def decode(self, z):
        return self.original_vae.decode(z)

def main():
    gpu_diffusion = torch.device("cuda:0")
    gpu_vae = torch.device("cuda:1")

    t_start = time.time()
    print(f"Loading pipeline on {gpu_diffusion}...")
    pipe = LongCatImagePipeline.from_pretrained(
        "meituan-longcat/LongCat-Image",
        cache_dir="model_cache",
        torch_dtype=torch.bfloat16,
    )
    t_load = time.time() - t_start
    print(f"✓ Model loaded in {t_load:.2f}s")

    vae_original = pipe.vae

    pipe.text_encoder.to(gpu_diffusion)
    pipe.transformer.to(gpu_diffusion)

    pipe.vae = LatentOnlyVAE(pipe.vae)

    pipe.enable_attention_slicing("max")

    t_start = time.time()
    print(f"Running diffusion on {gpu_diffusion}...")
    with torch.no_grad():
        output = pipe(
            prompt="two cats sitting on a bench in a park",
            height=768,
            width=768,
            guidance_scale=4.0,
            num_inference_steps=40,
            enable_cfg_renorm=True,
            output_type="latent",  
        )
        latents = output.images
    t_diffusion = time.time() - t_start
    print(f"✓ Diffusion completed in {t_diffusion:.2f}s")

    print(f"Moving latents to {gpu_vae} for VAE decoding...")
    latents = latents.to(gpu_vae)
    
    vae_decoder = vae_original.to(gpu_vae)

    t_start = time.time()
    print(f"Decoding latents on {gpu_vae}...")
    with torch.no_grad():
        batch_size, num_patches, channels_packed = latents.shape
        original_channels = channels_packed // 4
        
        latent_size_per_side = int(num_patches ** 0.5)
        height_latent = latent_size_per_side * 2
        width_latent = latent_size_per_side * 2
        
        print(f"  Latents shape: {latents.shape}")
        print(f"  Computed latent spatial dims: {height_latent}x{width_latent}")
        
        latents_unpacked = latents.view(batch_size, height_latent // 2, width_latent // 2, original_channels, 2, 2)
        latents_unpacked = latents_unpacked.permute(0, 3, 1, 4, 2, 5)
        latents_unpacked = latents_unpacked.reshape(batch_size, original_channels, height_latent, width_latent)
        
        latents_unpacked = (latents_unpacked / vae_decoder.config.scaling_factor) + vae_decoder.config.shift_factor
        image_tensor = vae_decoder.decode(latents_unpacked, return_dict=False)[0]
    t_decode = time.time() - t_start
    print(f"✓ VAE decode completed in {t_decode:.2f}s")

    t_start = time.time()
    print("Post-processing image...")
    image = pipe.image_processor.postprocess(image_tensor, output_type="pil")[0]
    image.save("t2i_example.png")
    t_postprocess = time.time() - t_start
    print(f"✓ Saved image to t2i_example.png in {t_postprocess:.2f}s")
    
    t_total = t_load + t_diffusion + t_decode + t_postprocess
    print(f"\nTotal time: {t_total:.2f}s")

if __name__ == "__main__":
    main()
