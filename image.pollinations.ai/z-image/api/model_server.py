import os
import torch
import multiprocessing as mp
from multiprocessing.managers import BaseManager
from diffusers import ZImagePipeline
from functools import partial
from loguru import logger
from config import MODEL_ID, IPC_SECRET_KEY, IPC_PORT



class ipcModules:
    logger.info("Loading IPC Device...")
    def __init__(self):
        self.pipe = None
        self._load_model()

    def _load_model(self):
        print("Loading Z-Image model...")
        self.pipe = ZImagePipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16,
        ).to("cuda")
        print("Model loaded successfully!")
    
    def generate(self, prompt: str, width: int, height: int, steps: int, seed: int | None, safety_checker_adj: float):
        if seed is None:
            seed = int.from_bytes(os.urandom(2), "big")
        
        generator = torch.Generator("cuda").manual_seed(seed)
        
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

if __name__ == "__main__":
    server = ipcModules()
    class ModelManager(BaseManager):
        pass
    ModelManager.register('service', callable=lambda: server)
    manager = ModelManager(address=('localhost', IPC_PORT), authkey=IPC_SECRET_KEY)
    server_obj = manager.get_server()
    print(f"Model server running on port {IPC_PORT}")
    server_obj.serve_forever()
