import os
import io
import base64
import torch
from diffusers import ZImagePipeline
from safety_checker import check_nsfw

MODEL_ID = "Tongyi-MAI/Z-Image-Turbo"

pipe = ZImagePipeline.from_pretrained(
    MODEL_ID,
    torch_dtype=torch.bfloat16,
).to("cuda")


def find_nearest_valid_dimensions(width: float, height: float) -> tuple[int, int]:
    """Find the nearest dimensions that are multiples of 8, capped at 1024x1024."""
    MAX_PIXELS = 1024 * 1024
    start_w = round(width)
    start_h = round(height)
    current_pixels = start_w * start_h
    if current_pixels > MAX_PIXELS:
        scale = (MAX_PIXELS / current_pixels) ** 0.5
        start_w = round(start_w * scale)
        start_h = round(start_h * scale)
    nearest_w = round(start_w / 8) * 8
    nearest_h = round(start_h / 8) * 8
    nearest_w = max(nearest_w, 256)
    nearest_h = max(nearest_h, 256)
    return nearest_w, nearest_h


def generate_image(
    prompt: str,
    width: int = 1024,
    height: int = 1024,
    steps: int = 9,
    seed: int | None = None,
    safety_checker_adj: float = 0.5
) -> dict:
    if seed is None:
        seed = int.from_bytes(os.urandom(2), "big")
    generator = torch.Generator("cuda").manual_seed(seed)
    width, height = find_nearest_valid_dimensions(width, height)

    with torch.inference_mode():
        output = pipe(
            prompt=prompt,
            generator=generator,
            width=width,
            height=height,
            num_inference_steps=steps,
            guidance_scale=0.0,
        )
    image = output.images[0]
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