import torch
from diffusers import DiffusionPipeline
from diffusers.image_processor import VaeImageProcessor
import gc

class DualGPULongCat:
    def __init__(self):
        self.gpu_diffusion = torch.device("cuda:0")
        self.gpu_vae = torch.device("cuda:1")
        self.dtype = torch.float16
        
        print("Loading LongCat pipeline from cache...")
        print(f"GPU 0 Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f}GB")
        print(f"GPU 1 Memory: {torch.cuda.get_device_properties(1).total_memory / 1e9:.2f}GB")
        
        # Load pipeline with 8-bit quantization on GPU 0
        self.pipe = DiffusionPipeline.from_pretrained(
            "meituan-longcat/LongCat-Image",
            cache_dir="model_cache",
            dtype=self.dtype
        )
        
        # Move components to GPU 0 with memory optimizations
        self.pipe.text_encoder.to(self.gpu_diffusion, dtype=self.dtype)
        self.pipe.transformer.to(self.gpu_diffusion, dtype=self.dtype)
        
        # Enable attention slicing for memory efficiency
        self.pipe.enable_attention_slicing(1)
        

        # Enable gradient checkpointing to reduce memory
        if hasattr(self.pipe.transformer, 'enable_gradient_checkpointing'):
            self.pipe.transformer.enable_gradient_checkpointing()
        if hasattr(self.pipe.text_encoder, 'enable_gradient_checkpointing'):
            self.pipe.text_encoder.enable_gradient_checkpointing()
        
        # Extract and move VAE to GPU 1, remove from GPU 0
        self.vae = self.pipe.vae
        self.vae.to(self.gpu_vae, dtype=self.dtype)
        self.pipe.vae = None  # Remove VAE reference from pipeline
        
        # Disable VAE gradient computation to save memory
        if hasattr(self.vae, 'enable_gradient_checkpointing'):
            self.vae.enable_gradient_checkpointing()
        
        # Clear GPU 0 cache
        torch.cuda.empty_cache()
        gc.collect()
        
        self.processor = VaeImageProcessor()
        print("Pipeline loaded successfully on GPU 0")
        print("VAE loaded successfully on GPU 1")

    @torch.no_grad()
    def generate_latent(self, prompt, height=512, width=512, steps=20, guidance=4.0):
        """Generate latents on GPU 0"""
        print(f"Generating latents on {self.gpu_diffusion}...")
        
        # Set to inference mode to save memory
        self.pipe.transformer.eval()
        self.pipe.text_encoder.eval()
        
        with torch.amp.autocast(device_type='cuda', dtype=self.dtype):
            # Generate latent representation
            latents = self.pipe(
                prompt=prompt,
                height=height,
                width=width,
                num_inference_steps=steps,
                guidance_scale=guidance,
                output_type="latent",
                return_dict=False,
            )[0]
        
        print(f"Latents shape: {latents.shape}")
        
        # Clear GPU 0 cache before transfer
        torch.cuda.empty_cache()
        
        # Move to GPU 1 and clear GPU 0 reference
        latents_gpu1 = latents.to(self.gpu_vae)
        del latents
        torch.cuda.empty_cache()
        
        return latents_gpu1

    @torch.no_grad()
    def decode_latent(self, latents):
        """Decode latents on GPU 1"""
        print(f"Decoding on {self.gpu_vae}...")
        
        self.vae.eval()
        
        # Unpack latents from [batch, num_patches, channels_packed] to [batch, channels, height, width]
        batch_size, num_patches, channels_packed = latents.shape
        original_channels = channels_packed // 4
        
        latent_size_per_side = int(num_patches ** 0.5)
        height_latent = latent_size_per_side * 2
        width_latent = latent_size_per_side * 2
        
        print(f"  Latents shape: {latents.shape}")
        print(f"  Computed latent spatial dims: {height_latent}x{width_latent}")
        
        # Reshape packed latents to spatial format
        latents_unpacked = latents.view(batch_size, height_latent // 2, width_latent // 2, original_channels, 2, 2)
        latents_unpacked = latents_unpacked.permute(0, 3, 1, 4, 2, 5)
        latents_unpacked = latents_unpacked.reshape(batch_size, original_channels, height_latent, width_latent)
        
        print(f"  Unpacked shape: {latents_unpacked.shape}")
        
        # Apply scaling and shift factors
        latents_unpacked = latents_unpacked.to(self.dtype)
        if hasattr(self.vae.config, 'scaling_factor'):
            latents_unpacked = latents_unpacked / self.vae.config.scaling_factor
        if hasattr(self.vae.config, 'shift_factor'):
            latents_unpacked = latents_unpacked + self.vae.config.shift_factor
        
        # Decode with VAE in fp16 for memory efficiency
        with torch.amp.autocast(device_type='cuda', dtype=self.dtype):
            image_tensor = self.vae.decode(latents_unpacked, return_dict=False)[0]
        
        # Move to CPU immediately to free GPU 1 memory
        image_tensor = image_tensor.cpu().float()
        
        # Clear GPU 1 cache
        del latents_unpacked
        torch.cuda.empty_cache()
        
        # Post-process to PIL image
        image = self.processor.postprocess(image_tensor, output_type="pil")[0]
        
        print("Decoding complete")
        return image

    def generate(self, prompt, height=512, width=512, steps=20, guidance=4.0, save_path="longcat_output.png"):
        """Complete generation pipeline"""
        print(f"\nGenerating: '{prompt}'")
        print(f"Resolution: {height}x{width}, Steps: {steps}, Guidance: {guidance}")
        
        # Step 1: Generate latents on GPU 0
        latents = self.generate_latent(prompt, height, width, steps, guidance)
        
        # Step 2: Decode on GPU 1
        image = self.decode_latent(latents)
        
        # Save image
        image.save(save_path)
        print(f"\nImage saved to: {save_path}")
        
        return image

def main():
    # Check GPU availability
    if torch.cuda.device_count() < 2:
        raise RuntimeError("This script requires at least 2 GPUs")
    
    print(f"GPU 0: {torch.cuda.get_device_name(0)}")
    print(f"GPU 1: {torch.cuda.get_device_name(1)}")
    
    # Initialize dual-GPU pipeline
    generator = DualGPULongCat()
    
    # Generate image
    prompt = "two cats sitting on a bench in a park, photorealistic, high quality"
    image = generator.generate(
        prompt=prompt,
        height=512,
        width=512,
        steps=20,
        guidance=4.0,
        save_path="longcat_output.png"
    )
    
    print("\nGeneration complete!")

if __name__ == "__main__":
    main()