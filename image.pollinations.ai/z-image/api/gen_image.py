import os
import io
import base64
import numpy as np
import torch
from multiprocessing.managers import BaseManager
from PIL import Image
from config import IPC_SECRET_KEY, IPC_PORT, MAX_H, MAX_W

class ModelManager(BaseManager): pass
ModelManager.register('service')
manager = ModelManager(address=('localhost', IPC_PORT), authkey=IPC_SECRET_KEY)
manager.connect()
server = manager.service()
    
def find_nearest_valid_dimensions(width: float, height: float) -> tuple[int, int]:
    MAX_PIXELS = MAX_W * MAX_H
    start_w = round(width)
    start_h = round(height)
    current_pixels = start_w * start_h
    if current_pixels > MAX_PIXELS:
        scale = (MAX_PIXELS / current_pixels) ** 0.5
        start_w = round(start_w * scale)
        start_h = round(start_h * scale)
    nearest_w = round(start_w / 16) * 16
    nearest_h = round(start_h / 16) * 16
    nearest_w = max(nearest_w, 256)
    nearest_h = max(nearest_h, 256)
    return nearest_w, nearest_h


def generate_image(
    prompt: str,
    width: int = 512,
    height: int = 512,
    steps: int = 9,
    seed: int | None = None,
    safety_checker_adj: float = 0.5
) -> dict:
    
    width, height = find_nearest_valid_dimensions(width, height)
    safe_image, seed, has_nsfw, concept = server.generate(
        prompt, width, height, steps, seed, safety_checker_adj
    )
    
    img_byte_arr = io.BytesIO()
    safe_image.save(img_byte_arr, format='JPEG', quality=95)
    img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')

    return {
        "image": img_base64,
        "has_nsfw_concept": has_nsfw,
        "concept": concept,
        "width": width,
        "height": height,
        "seed": seed,
        "prompt": prompt
    }

if __name__ == "__main__":
    result = generate_image(
        prompt="a cute flower",
        width=512,
        height=512,
        steps=9,
        safety_checker_adj=0.5
    )
    image_data = base64.b64decode(result["image"])
    pil_image = Image.open(io.BytesIO(image_data))
    image_array = np.array(pil_image)
    enhanced_data = server.enhance_x2(image_array, outscale=2)
    image = Image.fromarray(enhanced_data[0])
    image.save("generated_image.jpg")