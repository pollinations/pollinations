import torch
import time
from diffusers import LongCatImagePipeline
from transformers import BitsAndBytesConfig
from diffusers.image_processor import VaeImageProcessor


class DualGPULongCat:
    def __init__(self):
        self.gpu_diffusion = torch.device("cuda:0")
        self.gpu_vae = torch.device("cuda:1")
        self.dtype = torch.float16

        quant_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.float16,
        )

        t0 = time.time()

        self.pipe = LongCatImagePipeline.from_pretrained(
            "meituan-longcat/LongCat-Image",
            cache_dir="model_cache",
            torch_dtype=self.dtype,
            transformer_quantization_config=quant_config,
        )

        self.pipe.text_encoder.to(self.gpu_diffusion, self.dtype)
        self.pipe.transformer.to(self.gpu_diffusion)

        self.pipe.vae.to(self.gpu_vae, self.dtype)

        self.pipe._execution_device = self.gpu_diffusion
        self.pipe.enable_attention_slicing()

        self.image_processor = VaeImageProcessor()

        torch.cuda.synchronize()
        print(f"Loaded in {time.time() - t0:.2f}s")

    @torch.no_grad()
    def generate(
        self,
        prompt,
        height=768,
        width=768,
        num_inference_steps=2,
        guidance_scale=4.0,
    ):
        with torch.autocast("cuda", dtype=self.dtype):
            out = self.pipe(
                prompt=prompt,
                height=height,
                width=width,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                output_type="latent",
            )

        latents = out.images.to(self.gpu_vae, self.dtype)
        latents = latents / self.pipe.vae.config.scaling_factor

        decoded = self.pipe.vae.decode(latents, return_dict=False)[0]
        decoded = decoded.cpu().float()

        image = self.image_processor.postprocess(decoded, output_type="pil")[0]
        return image


def main():
    pipe = DualGPULongCat()
    img = pipe.generate("two cats sitting on a bench in a park")
    img.save("longcat_output.png")


if __name__ == "__main__":
    main()
