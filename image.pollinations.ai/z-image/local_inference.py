import requests
import base64
import time
from diffusers import ZImagePipeline, StableDiffusionUpscalePipeline
from gfpgan import GFPGANer
import mediapipe as mp
import warnings
import torch
from loguru import logger
from PIL import Image

MODEL_ID = "Tongyi-MAI/Z-Image-Turbo"
MODEL_CACHE = "model_cache"

def load_zimage_pipeline():
    pipe = ZImagePipeline.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.bfloat16,
        cache_dir=MODEL_CACHE,
        low_cpu_mem_usage=False,
    ).to("cuda")
    try:
        pipe.enable_xformers_memory_efficient_attention()
    except Exception:
        pass
    return pipe



def gen_upscale(prompt, steps=9):
    time_start = time.time()
    url = "http://localhost:10002/generate"
    payload = {
        "prompts": [prompt],
        "width": 2048,   
        "height":  2048,   
        "steps": steps
    }

    response = requests.post(url, json=payload)
    result = response.json()

    img_data = base64.b64decode(result[0]["image"])
    with open("output_16_9.jpg", "wb") as f:
        f.write(img_data)
    print(f"Time taken for the upscale generation: {time.time() - time_start:.2f}s")

def gen_raw(prompt, seed, steps=9):
        time_start = time.time()
        pipe = load_zimage_pipeline()
        generator = torch.Generator("cuda").manual_seed(seed)
        
        logger.info("Generating 2048x2048 image with Z-Image...")
        gen_start = time.time()
        
        with torch.inference_mode():
            output = pipe(
                prompt=prompt,
                generator=generator,
                width=2048,
                height=2048,
                num_inference_steps=steps,
                guidance_scale=0.0,
            )
        
        image = output.images[0]
        gen_time = time.time() - gen_start
        logger.info(f"Raw generation completed in {gen_time:.2f}s")
        logger.info(f"Image size: {image.size}")
        with open("output_16_9.jpg", "wb") as f:
            f.write(image.tobytes())
        print(f"Time taken for the upscale generation: {time.time() - time_start:.2f}s")
if __name__ == "__main__":
    prompt = "a detailed landscape with mountains and a lake, photorealistic, high quality, 4k"
    seed = 42
    
    try:
        # print("\n[1/2] Generating raw Z-Image 2048x2048...")
        # raw_image = gen_raw(prompt, seed, steps=9)
        print("\n[2/2] Generating upscaled Z-Image 2048x2048...")
        upscale_image = gen_upscale(prompt, steps=9)

    except Exception as e:
        logger.error(f"An error occurred: {e}")


