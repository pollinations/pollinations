import torch
from diffusers import LongCatImagePipeline
from diffusers.image_processor import VaeImageProcessor

class DualGPULongCat:
    def __init__(self):
        self.gpu_diffusion = torch.device("cuda:0")
        self.gpu_vae = torch.device("cuda:1")
        self.dtype = torch.float16

        self.pipe = LongCatImagePipeline.from_pretrained(
            "meituan-longcat/LongCat-Image",
            cache_dir="model_cache",
        )

        self.pipe.text_encoder.to(self.gpu_diffusion)
        self.pipe.transformer.to(self.gpu_diffusion)
        self.pipe.enable_attention_slicing()
        
        # VAE stays on GPU1
        self.pipe.vae.to(self.gpu_vae, self.dtype)
        self.processor = VaeImageProcessor()

    @torch.no_grad()
    def generate_latent(self, prompt, height=512, width=512, steps=20, guidance=4.0):
        # Generate latent on GPU0
        with torch.autocast("cuda", dtype=self.dtype):
            output = self.pipe(
                prompt=prompt,
                height=height,
                width=width,
                num_inference_steps=steps,
                guidance_scale=guidance,
                output_type="latent",  # returns Latents
            )
        # output.images is latents on GPU0
        return output.images.to(self.gpu_vae)  # move to VAE GPU

    @torch.no_grad()
    def decode_latent(self, latents):
        # Decode on GPU1
        # ensure dtype and scaling
        latents = latents.to(self.dtype) / self.pipe.vae.config.scaling_factor
        decoded = self.pipe.vae.decode(latents, return_dict=False)[0].cpu()
        # Convert to PIL
        image = self.processor.postprocess(decoded, output_type="pil")[0]
        return image

    def generate(self, prompt, height=512, width=512, steps=20, guidance=4.0):
        latents = self.generate_latent(prompt, height, width, steps, guidance)
        return self.decode_latent(latents)

# Usage
def main():
    pipe = DualGPULongCat()
    img = pipe.generate("two cats sitting on a bench in a park", height=512, width=512, steps=20, guidance=4.0)
    img.save("longcat_output.png")

if __name__ == "__main__":
    main()
