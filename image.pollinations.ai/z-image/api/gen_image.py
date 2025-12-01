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

def testCheckSafety() -> tuple[list[bool], list[dict]]:
    test_image_path = "testImg.jpg"
    if os.path.exists(test_image_path):
        test_image = Image.open(test_image_path).convert("RGB")
        test_image_np = np.array(test_image).astype("float32") / 255.0
        has_nsfw, concepts = server.check_nsfw(test_image_np, safety_checker_adj=0.0)
        print(f"NSFW: {has_nsfw}, Concepts: {concepts}")
    else:
        print(f"Test image '{test_image_path}' not found.")

def testGenerateImage():
    result = generate_image(
        prompt="a beautiful landscape with mountains and a river",
        width=512,
        height=512,
        steps=9,
        safety_checker_adj=0.5
    )
    image_data = base64.b64decode(result["image"])
    pil_image = Image.open(io.BytesIO(image_data))
    pil_image.save("generated_test_image.jpg")
    print("Generated image saved as 'generated_test_image.jpg'.")

if __name__ == "__main__":
    testCheckSafety()
    