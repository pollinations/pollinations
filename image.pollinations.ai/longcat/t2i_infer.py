import torch
from diffusers import LongCatImagePipeline

class LatentOnlyVAE(torch.nn.Module):
    """
    Dummy VAE wrapper that returns latents instead of decoded images
    during pipeline forward pass on GPU 0.
    """
    def __init__(self, vae):
        super().__init__()
        self.original_vae = vae
        self.config = vae.config

    def forward(self, latents, **kwargs):
        # Just return the latents wrapped as 'sample'
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

    print(f"Loading pipeline on {gpu_diffusion}...")
    # Load pipeline
    pipe = LongCatImagePipeline.from_pretrained(
        "meituan-longcat/LongCat-Image",
        cache_dir="model_cache",
        torch_dtype=torch.bfloat16,
    )

    # Store the original VAE for GPU 1 decoding
    vae_original = pipe.vae

    # Move diffusion modules to GPU 0
    pipe.text_encoder.to(gpu_diffusion)
    pipe.transformer.to(gpu_diffusion)

    # Replace VAE with dummy (returns latents) for diffusion step on GPU 0
    pipe.vae = LatentOnlyVAE(pipe.vae)

    # Enable slicing to reduce GPU 0 peak memory
    pipe.enable_attention_slicing("max")

    print(f"Running diffusion on {gpu_diffusion}...")
    # Step 1: Run diffusion → get latents on GPU 0
    with torch.no_grad():
        output = pipe(
            prompt="a bear in the forest, digital art",
            height=512,
            width=512,
            guidance_scale=4.0,
            num_inference_steps=10,
            enable_cfg_renorm=True,
            output_type="latent",  
        )
        latents = output.images

    print(f"Moving latents to {gpu_vae} for VAE decoding...")
    # Step 2: Move latents to GPU 1 for VAE decoding
    latents = latents.to(gpu_vae)
    
    # Move original VAE to GPU 1
    vae_decoder = vae_original.to(gpu_vae)

    print(f"Decoding latents on {gpu_vae}...")
    # Step 3: Decode latents to image on GPU 1
    with torch.no_grad():
        # Unpack latents (reverse the packing done in the pipeline)
        height, width = 768, 768
        vae_scale_factor = 2 ** (len(vae_decoder.config.block_out_channels) - 1)
        height = 2 * (int(height) // (vae_scale_factor * 2))
        width = 2 * (int(width) // (vae_scale_factor * 2))
        
        batch_size, num_patches, channels = latents.shape
        latents_unpacked = latents.view(batch_size, height // 2, width // 2, channels // 4, 2, 2)
        latents_unpacked = latents_unpacked.permute(0, 3, 1, 4, 2, 5)
        latents_unpacked = latents_unpacked.reshape(batch_size, channels // (2 * 2), height, width)
        
        # Normalize and decode
        latents_unpacked = (latents_unpacked / vae_decoder.config.scaling_factor) + vae_decoder.config.shift_factor
        image_tensor = vae_decoder.decode(latents_unpacked, return_dict=False)[0]

    print("Post-processing image...")
    # Step 4: Postprocess to PIL
    image = pipe.image_processor.postprocess(image_tensor, output_type="pil")[0]
    image.save("t2i_example.png")
    print("✓ Saved image to t2i_example.png!")

if __name__ == "__main__":
    main()
