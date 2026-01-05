import torch
from diffusers import LongCatImagePipeline
from transformers import BitsAndBytesConfig
from peft import inject_adapter_in_model, LoraConfig
import time


class LatentOnlyVAE(torch.nn.Module):
    def __init__(self, vae, device):
        super().__init__()
        self.original_vae = vae
        self.config = vae.config
        self._dtype = vae.dtype
        self.device = device

    @property
    def dtype(self):
        return self._dtype
    
    @dtype.setter
    def dtype(self, value):
        self._dtype = value

    def forward(self, latents):
        class Dummy:
            def __init__(self, sample):
                self.sample = sample
        return Dummy(latents)
    
    def encode(self, x):
        return self.original_vae.encode(x)
    
    def decode(self, z, return_dict=False):
        z = z.to(self.device).to(self._dtype)
        self.original_vae = self.original_vae.to(self.device).to(self._dtype)
        return self.original_vae.decode(z, return_dict=return_dict)


class DualGPULongCat:
    
    def __init__(self):
        self.gpu_diffusion = torch.device("cuda:0")
        self.gpu_vae = torch.device("cuda:1")
        self.dtype = torch.float16
        
        print(f"Loading pipeline on {self.gpu_diffusion}...")
        t_start = time.time()
        
        self.bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.float32
        )
        
        self.pipe = LongCatImagePipeline.from_pretrained(
            "meituan-longcat/LongCat-Image",
            cache_dir="model_cache",
            torch_dtype=self.dtype,
        )
        
        self.vae_original = self.pipe.vae
        
        self.pipe.text_encoder.to(self.gpu_diffusion).to(self.dtype)
        
        self._quantize_transformer()
        self.pipe.transformer.to(self.gpu_diffusion)
        
        self._apply_lora()
        
        self.pipe.vae = LatentOnlyVAE(self.pipe.vae, self.gpu_vae)
        
        self._optimize_gpu_diffusion()
        
        t_load = time.time() - t_start
        print(f"✓ Model loaded in {t_load:.2f}s")
        
        self._log_memory()

    def _quantize_transformer(self):
        from transformers import AutoModel
        self.pipe.transformer = AutoModel.from_pretrained(
            "meituan-longcat/LongCat-Image",
            subfolder="transformer",
            cache_dir="model_cache",
            torch_dtype=self.dtype,
            quantization_config=self.bnb_config,
            device_map="cpu",
        )

    def _apply_lora(self):
        lora_config = LoraConfig(
            r=8,
            lora_alpha=16,
            target_modules=["to_q", "to_v", "to_k", "to_out"],
            lora_dropout=0.05,
            bias="none",
        )
        self.pipe.transformer = inject_adapter_in_model(
            lora_config, self.pipe.transformer
        )

    def _optimize_gpu_diffusion(self):
        print(f"Optimizing {self.gpu_diffusion}...")
        
        try:
            self.pipe.transformer.gradient_checkpointing_enable()
            print("  ✓ Gradient checkpointing enabled")
        except Exception as e:
            pass
        
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
        height: int = 768,
        width: int = 768,
        num_inference_steps: int = 20,
        guidance_scale: float = 4.0,
    ):
        
        print(f"\nGenerating: {prompt[:60]}...")
        t_start = time.time()
        
        with torch.no_grad():
            with torch.amp.autocast('cuda'):
                output = self.pipe(
                    prompt=prompt,
                    height=height,
                    width=width,
                    num_inference_steps=num_inference_steps,
                    guidance_scale=guidance_scale,
                    enable_cfg_renorm=False,
                    output_type="latent",
                )
                latents = output.images
                
        latents = latents.to(self.gpu_vae).to(self.dtype)
        with torch.no_grad():
            with torch.amp.autocast('cuda'):
                vae_output = self.vae_original.decode(latents, return_dict=True)
                image = vae_output.sample
                
        from diffusers.image_processor import VaeImageProcessor
        processor = VaeImageProcessor()
        image = processor.postprocess(image, output_type="pil")[0]
        
        elapsed = time.time() - t_start
        print(f"✓ Generation completed in {elapsed:.2f}s")
        
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
        height=768,
        width=768,
        num_inference_steps=40,
        guidance_scale=4.0,
    )


if __name__ == "__main__":
    main()
