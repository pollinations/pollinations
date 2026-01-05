import torch
from diffusers import DiffusionPipeline
from diffusers.image_processor import VaeImageProcessor
import gc

class SingleGPULongCat:
    def __init__(self):
        self.device = torch.device("cuda:0")
        self.dtype = torch.bfloat16  # CRITICAL: Use bfloat16 instead of float16!
        
        print("Loading LongCat pipeline from cache...")
        print(f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f}GB")
        
        # Load pipeline - use torch_dtype not dtype
        self.pipe = DiffusionPipeline.from_pretrained(
            "meituan-longcat/LongCat-Image",
            cache_dir="model_cache",
            torch_dtype=self.dtype
        )
        
        # Move entire pipeline to GPU
        self.pipe.to(self.device)
        
        # Enable memory optimizations
        self.pipe.enable_attention_slicing(1)
        
        # Enable gradient checkpointing to reduce memory
        if hasattr(self.pipe.transformer, 'enable_gradient_checkpointing'):
            self.pipe.transformer.enable_gradient_checkpointing()
        if hasattr(self.pipe.text_encoder, 'enable_gradient_checkpointing'):
            self.pipe.text_encoder.enable_gradient_checkpointing()
        
        self.processor = VaeImageProcessor()
        
        print("Pipeline loaded successfully")
        torch.cuda.empty_cache()
    
    @torch.no_grad()
    def generate(self, prompt, height=512, width=512, steps=20, guidance=4.0, save_path="longcat_output.png"):
        """Complete generation pipeline"""
        print(f"\nGenerating: '{prompt}'")
        print(f"Resolution: {height}x{width}, Steps: {steps}, Guidance: {guidance}")
        
        # Let the pipeline handle everything - use default output
        with torch.amp.autocast(device_type='cuda', dtype=self.dtype):
            # Generate with PIL output directly
            result = self.pipe(
                prompt=prompt,
                height=height,
                width=width,
                num_inference_steps=steps,
                guidance_scale=guidance,
                output_type="pil",  # Let pipeline do the decoding
                generator=torch.Generator("cpu").manual_seed(42),  # For reproducibility
            )
            
            # Handle different return types
            if hasattr(result, 'images'):
                image = result.images[0]
            elif isinstance(result, tuple):
                image = result[0][0] if isinstance(result[0], list) else result[0]
            else:
                image = result[0]
        
        # Save image
        image.save(save_path)
        print(f"\nImage saved to: {save_path}")
        
        # Clear cache
        torch.cuda.empty_cache()
        
        return image

def main():
    # Check GPU availability
    if not torch.cuda.is_available():
        raise RuntimeError("This script requires a CUDA GPU")
    
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    
    # Initialize pipeline
    generator = SingleGPULongCat()
    
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