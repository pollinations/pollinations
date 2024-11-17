from cog import BasePredictor, Path, Input
import torch
from diffusers import DiffusionPipeline, AutoencoderTiny, LCMScheduler
from huggingface_hub import hf_hub_download
import time
import io
import base64
import numpy as np
from PIL import Image
import tempfile

class Predictor(BasePredictor):
    def setup(self):
        """Load the model into memory to make running multiple predictions efficient"""
        base_model_id = "GraydientPlatformAPI/boltning-xl"
        repo_name = "tianweiy/DMD2"
        ckpt_name = "dmd2_sdxl_4step_lora_fp16.safetensors"

        self.pipe = DiffusionPipeline.from_pretrained(base_model_id, torch_dtype=torch.float32)#.to("cuda")
        self.pipe.load_lora_weights(hf_hub_download(repo_name, ckpt_name))
        self.pipe.fuse_lora(lora_scale=0.5)
        self.pipe.vae = AutoencoderTiny.from_pretrained("madebyollin/taesdxl", torch_dtype=torch.float16)#.to("cuda", torch.float16)
        self.pipe.scheduler = LCMScheduler.from_config(self.pipe.scheduler.config)
        self.pipe.enable_sequential_cpu_offload()   
        self.pipe.to(torch.float16)

    def predict(self,
                prompts: str = Input(description="Prompts for image generation"),
                width: int = Input(description="Width of the generated image", default=1024),
                height: int = Input(description="Height of the generated image", default=1024),
                seed: int = Input(description="Seed for reproducibility", default=-1)
    ) -> Path:
        """Run a single prediction on the model"""
        # Set the seed for reproducibility
        if seed != -1:
            generator = torch.manual_seed(seed)
        else:
            generator = None

        # Ensure height and width are divisible by 8
        width = (width // 8) * 8
        height = (height // 8) * 8

        # Generate images
        images = self.pipe(prompt=prompts, num_inference_steps=4, guidance_scale=0, generator=generator, width=width, height=height, timesteps=[999, 749, 499, 249]).images

        if not images:
            raise ValueError("No images generated")

        # Convert the first image to base64
        img_byte_arr = io.BytesIO()
        images[0].save(img_byte_arr, format='JPEG')
        img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')

        # Save the image to a temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_file:
            images[0].save(temp_file, format='PNG')
            output_path = temp_file.name

        return Path(output_path)
