import os
import torch
import multiprocessing as mp
from multiprocessing.managers import BaseManager
from diffusers import ZImagePipeline
from functools import partial
from PIL import Image, ImageFilter
from loguru import logger
from config import SAFETY_CHECKER_MODEL, IMAGE_GENERATOR_MODEL, UPSCALER_MODEL_x2, UPSCALER_MODEL_x4, IPC_SECRET_KEY, IPC_PORT, NSFW_ALLOW, UPSCALE_VALUE
from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer
from transformers import AutoFeatureExtractor
from utility import StableDiffusionSafetyChecker, numpy_to_pil, replace_numpy_with_python, replace_sets_with_lists
import time
import numpy as np
import sys
from PIL import Image

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
use_half = torch.cuda.is_available()

class ipcModules:
    start_time = time.time()
    logger.info("Loading IPC Device...")
    def __init__(self):
        self.pipe = None
        self.upsampler_x2 = None
        self.upsampler_x4 = None
        self.safety_feature_extractor = None
        self.safety_checker_model = None
        self._load_model()
        self._load_safety_checker()

    def _load_model(self):
        print("Loading Z-Image model...")
        self.pipe = ZImagePipeline.from_pretrained(
            IMAGE_GENERATOR_MODEL,
            torch_dtype=torch.bfloat16,
            cache_dir="model_cache",
        ).to(device)
        print("Model loaded successfully!")
        print("Loading upscaler model...")
        model_x2 = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2)
        model_x4 = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)

        self.upsampler_x4 = RealESRGANer(
            scale=4,
            model_path=UPSCALER_MODEL_x4,
            model=model_x4,
            tile=512,
            tile_pad=10,
            pre_pad=0,
            half=use_half,
            device=device
        )

        self.upsampler_x2 = RealESRGANer(
            scale=2,
            model_path=UPSCALER_MODEL_x2,
            model=model_x2,
            tile=512,
            tile_pad=10,
            pre_pad=0,
            half=use_half,
            device=device
        )
        print("Upscaler model loaded successfully!")

    def _load_safety_checker(self):
        print("Loading safety checker...")
        self.safety_feature_extractor = AutoFeatureExtractor.from_pretrained(
            SAFETY_CHECKER_MODEL,
            cache_dir="model_cache"
        )
        self.safety_checker_model = StableDiffusionSafetyChecker.from_pretrained(
            SAFETY_CHECKER_MODEL,
            cache_dir="model_cache"
        ).to("cuda")
        print("Safety checker loaded successfully!")
        end_time = time.time()
        print(f"Total model loading took {end_time - self.start_time:.2f} seconds")
        print("[MODELS LOADED]")

    def check_nsfw(self, image_array, safety_checker_adj: float = 0.0):
        if isinstance(image_array, np.ndarray):
            if image_array.max() <= 1.0:
                image_array = (image_array * 255).astype("uint8")
            else:
                image_array = image_array.astype("uint8")
            x_image = Image.fromarray(image_array)
            x_image = [x_image]
        elif isinstance(image_array, list) and not isinstance(image_array[0], Image.Image):
            x_image = numpy_to_pil(image_array)
        else:
            x_image = image_array if isinstance(image_array, list) else [image_array]

        safety_checker_input = self.safety_feature_extractor(x_image, return_tensors="pt").to("cuda")
        has_nsfw_concept, concepts = self.safety_checker_model(
            images=x_image,
            clip_input=safety_checker_input.pixel_values
        )
        has_nsfw_bool = bool(has_nsfw_concept[0])

        return (
            has_nsfw_bool,
            replace_numpy_with_python(replace_sets_with_lists(concepts[0] if isinstance(concepts, list) else concepts))
        )


    def get_safe_images(self, image_tensor, safety_checker_adj: float = 0.0):
        if NSFW_ALLOW:
            return image_tensor
        
        x_samples_numpy = image_tensor.cpu().permute(0, 2, 3, 1).numpy()
        has_nsfw, concepts = self.check_nsfw(x_samples_numpy[0], safety_checker_adj)
        x = image_tensor

        if has_nsfw:
            img_np = x_samples_numpy[0]
            img_pil = Image.fromarray((img_np * 255).round().astype("uint8"))
            blurred_pil = img_pil.filter(ImageFilter.GaussianBlur(radius=16))
            blurred_np = (np.array(blurred_pil) / 255.0).astype("float32")
            blurred_tensor = torch.from_numpy(blurred_np).permute(2, 0, 1).unsqueeze(0)
            x = blurred_tensor

        return x

    def generate(self, prompt: str, width: int, height: int, steps: int, seed: int | None, safety_checker_adj: float):
        if seed is None:
            seed = int.from_bytes(os.urandom(2), "big")
        
        generator = torch.Generator(device).manual_seed(seed)
        
        with torch.inference_mode():
            output = self.pipe(
                prompt=prompt,
                generator=generator,
                width=width,
                height=height,
                num_inference_steps=steps,
                guidance_scale=0.0,
            )
        
        image_tensor = output.images[0]
        if isinstance(image_tensor, Image.Image):
            image_array = np.array(image_tensor).astype("float32") / 255.0
            image_tensor = torch.from_numpy(image_array).permute(2, 0, 1).unsqueeze(0)
        
        safe_image_tensor = self.get_safe_images(image_tensor, safety_checker_adj)
        safe_image = Image.fromarray((safe_image_tensor[0].permute(1, 2, 0).cpu().numpy() * 255).round().astype("uint8"))
        
        has_nsfw = False
        concept = []
        if not NSFW_ALLOW:
            has_nsfw, concept = self.check_nsfw(np.array(safe_image), safety_checker_adj)
        
        return safe_image, seed, has_nsfw, concept

    def enhance_x2(self, img_array, outscale=2):
        try:
            return self.upsampler_x2.enhance(img_array, outscale=outscale)
        except Exception as e:
            logger.error(f"Error in x2 enhancement: {e}")
            raise
    def enhance_x4(self, img_array, outscale=4):
        try:
            return self.upsampler_x4.enhance(img_array, outscale=outscale)
        except Exception as e:
            logger.error(f"Error in x4 enhancement: {e}")
            raise


if __name__ == "__main__":
    try:
        server = ipcModules()
        class ModelManager(BaseManager):
            pass
        ModelManager.register('service', callable=lambda: server)
        manager = ModelManager(address=('localhost', IPC_PORT), authkey=IPC_SECRET_KEY)
        server_obj = manager.get_server()
        print(f"Model server running on port {IPC_PORT}")
        print("[SERVER_READY]")
        sys.stdout.flush()
        server_obj.serve_forever()
    except Exception as e:
        print(f"[SERVER_ERROR] {e}")
        import traceback
        traceback.print_exc()
        exit(1)

