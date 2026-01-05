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


class DualGPULongCat:
    
    def __init__(self):
        self.gpu_diffusion = torch.device("cuda:0")
        self.gpu_vae = torch.device("cuda:1")
        self.dtype = torch.float16
        
        print(f"Loading pipeline on {self.gpu_diffusion}...")
        t_start = time.time()
        
        self.pipe = LongCatImagePipeline.from_pretrained(
            "meituan-longcat/LongCat-Image",
            cache_dir="model_cache",
            torch_dtype=self.dtype,
        )
        
        self.vae_original = self.pipe.vae
        
        self.pipe.text_encoder.to(self.gpu_diffusion)
        self.pipe.transformer.to(self.gpu_diffusion)
        
        self.pipe.vae = LatentOnlyVAE(self.pipe.vae)
        
        self._optimize_gpu_diffusion()
        
        t_load = time.time() - t_start
        print(f"✓ Model loaded in {t_load:.2f}s")
        
        self._log_memory()

    def _optimize_gpu_diffusion(self):
        print(f"Optimizing {self.gpu_diffusion}...")
        
        try:
            self.pipe.enable_attention_slicing("max")
            print("  ✓ Attention slicing enabled")
        except Exception as e:
            print(f"  ✗ Attention slicing: {e}")
        
        try:
            self.pipe.enable_xformers_memory_efficient_attention()
            print("  ✓ xFormers memory efficient attention enabled")
        except Exception as e:
            print(f"  ✗ xFormers: {e}")

    def _log_memory(self):
        if torch.cuda.is_available():
            allocated_0 = torch.cuda.memory_allocated(self.gpu_diffusion) / 1e9
            reserved_0 = torch.cuda.memory_reserved(self.gpu_diffusion) / 1e9
            print(f"GPU 0 Memory: {allocated_0:.2f}GB allocated, {reserved_0:.2f}GB reserved")
            
            allocated_1 = torch.cuda.memory_allocated(self.gpu_vae) / 1e9
            reserved_1 = torch.cuda.memory_reserved(self.gpu_vae) / 1e9
            print(f"GPU 1 Memory: {allocated_1:.2f}GB allocated, {reserved_1:.2f}GB reserved")

    def generate(
        self,
        prompt: str,
        height: int = 512,
        width: int = 512,
        num_inference_steps: int = 30,
        guidance_scale: float = 4.0,
    ):
        
        print(f"\nGenerating: {prompt[:60]}...")
        t_start = time.time()
        
        t_start_diffusion = time.time()
        with torch.no_grad():
            with torch.amp.autocast('cuda', dtype=self.dtype):
                output = self.pipe(
                    prompt=prompt,
                    height=height,
                    width=width,
                    num_inference_steps=num_inference_steps,
                    guidance_scale=guidance_scale,
                    enable_cfg_renorm=True,
                    output_type="latent",
                )
                latents = output.images
        
        t_diffusion = time.time() - t_start_diffusion
        print(f"  ✓ Latent generation (GPU 0): {t_diffusion:.2f}s")
        
        print(f"Moving latents to {self.gpu_vae} for VAE decode...")
        latents = latents.to(self.gpu_vae).to(self.dtype)
        
        vae_decoder = self.vae_original.to(self.gpu_vae).to(self.dtype)
        
        t_start_decode = time.time()
        with torch.no_grad():
            batch_size, num_patches, channels_packed = latents.shape
            original_channels = channels_packed // 4
            
            latent_size_per_side = int(num_patches ** 0.5)
            height_latent = latent_size_per_side * 2
            width_latent = latent_size_per_side * 2
            
            latents_unpacked = latents.view(batch_size, height_latent // 2, width_latent // 2, original_channels, 2, 2)
            latents_unpacked = latents_unpacked.permute(0, 3, 1, 4, 2, 5)
            latents_unpacked = latents_unpacked.reshape(batch_size, original_channels, height_latent, width_latent)
            
            latents_unpacked = (latents_unpacked / vae_decoder.config.scaling_factor) + vae_decoder.config.shift_factor
            latents_unpacked = latents_unpacked.to(self.dtype)
            
            image_tensor = vae_decoder.decode(latents_unpacked, return_dict=False)[0]
        
        t_decode = time.time() - t_start_decode
        print(f"  ✓ VAE decode (GPU 1): {t_decode:.2f}s")
        
        t_start_postprocess = time.time()
        image = self.pipe.image_processor.postprocess(image_tensor, output_type="pil")[0]
        t_postprocess = time.time() - t_start_postprocess
        print(f"  ✓ Post-processing: {t_postprocess:.2f}s")
        
        elapsed = time.time() - t_start
        print(f"✓ Total generation time: {elapsed:.2f}s")
        
        return image

    def batch_generate(
        self,
        prompts: list,
        save_outputs: bool = True,
        **kwargs
    ):
        images = []
        total_time = 0
        
        for i, prompt in enumerate(prompts, 1):
            t_start = time.time()
            image = self.generate(prompt, **kwargs)
            elapsed = time.time() - t_start
            total_time += elapsed
            images.append(image)
            
            if save_outputs:
                filename = f"longcat_output_{i:03d}.png"
                image.save(filename)
                print(f"  Saved to {filename}")
        
        print(f"\n{'='*60}")
        print(f"Total time: {total_time:.2f}s")
        print(f"Average per image: {total_time / len(prompts):.2f}s")
        print(f"{'='*60}\n")
        
        return images


def main():
    pipeline = DualGPULongCat()
    
    test_prompts = [
        "two cats sitting on a bench in a park"
    ]
    
    pipeline.batch_generate(
        test_prompts,
        height=512,
        width=512,
        num_inference_steps=30,
        guidance_scale=4.0,
    )


if __name__ == "__main__":
    main()
