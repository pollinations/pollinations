import os
import torch
import multiprocessing as mp
from multiprocessing.managers import BaseManager
from diffusers import ZImagePipeline
from functools import partial
from loguru import logger
from config import MODEL_ID, IPC_SECRET_KEY, IPC_PORT, MODEL_PATH_x2
from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer


device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
use_half = torch.cuda.is_available()

class ipcModules:
    logger.info("Loading IPC Device...")
    def __init__(self):
        self.pipe = None
        
        self._load_model()

    def _load_model(self):
        model_x2 = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2)
        print("Loading Z-Image model...")
        self.pipe = ZImagePipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16,
        ).to(device)
        print("Model loaded successfully!")
        print("Loading upscaler model...")
        self.upsampler_x2 = RealESRGANer(
            scale=2,
            model_path=MODEL_PATH_x2,
            model=model_x2,
            tile=512,
            tile_pad=10,
            pre_pad=0,
            half=use_half,
            device=device
        )

    
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
        
        return output.images[0], seed

    def enhance_x2(self, img_array, outscale=2):
        try:
            return self.upsampler_x2.enhance(img_array, outscale=outscale)
        except Exception as e:
            logger.error(f"Error in x2 enhancement: {e}")
            raise
        
if __name__ == "__main__":
    server = ipcModules()
    class ModelManager(BaseManager):
        pass
    ModelManager.register('service', callable=lambda: server)
    manager = ModelManager(address=('localhost', IPC_PORT), authkey=IPC_SECRET_KEY)
    server_obj = manager.get_server()
    print(f"Model server running on port {IPC_PORT}")
    server_obj.serve_forever()
