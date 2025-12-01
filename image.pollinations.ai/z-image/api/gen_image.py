import os
import io
import base64
import torch
from multiprocessing.managers import BaseManager
from safety_checker import check_nsfw
from PIL import Image
from config import IPC_SECRET_KEY, IPC_PORT

class ModelManager(BaseManager): pass
ModelManager.register('service')
manager = ModelManager(address=('localhost', IPC_PORT), authkey=IPC_SECRET_KEY)
manager.connect()
server = manager.service()
    
def find_nearest_valid_dimensions(width: float, height: float) -> tuple[int, int]:
    MAX_PIXELS = 512 * 512
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
    
    image, seed = server.generate(prompt, width, height, steps, seed, safety_checker_adj)
    
    has_nsfw, concepts = check_nsfw([image], safety_checker_adj)
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format='JPEG', quality=95)
    img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')

    return {
        "image": img_base64,
        "has_nsfw_concept": has_nsfw[0],
        "concept": concepts[0],
        "width": width,
        "height": height,
        "seed": seed,
        "prompt": prompt
    }

if __name__ == "__main__":
    result = generate_image(
        prompt="A fantasy landscape with mountains and a river, vibrant colors, highly detailed",
        width=800,
        height=600,
        steps=9,
        safety_checker_adj=0.5
    )
    image_data = base64.b64decode(result["image"])
    image = Image.open(io.BytesIO(image_data))
    image.save("generated_image.jpg")
    print(result["has_nsfw_concept"], result["concept"], result["width"], result["height"], result["seed"])