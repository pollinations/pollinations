import os
import sys
import io
import base64
import logging
import torch
import runpod
from diffusers import FluxPipeline
from nunchaku import NunchakuFluxTransformer2dModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_ID = "black-forest-labs/FLUX.1-schnell"
QUANT_MODEL_PATH = "mit-han-lab/svdq-fp4-flux.1-schnell"

# --- Model loading (runs once at container start) ---

logger.info("Loading FLUX pipeline...")
transformer = NunchakuFluxTransformer2dModel.from_pretrained(QUANT_MODEL_PATH)
pipe = FluxPipeline.from_pretrained(
    MODEL_ID,
    transformer=transformer,
    torch_dtype=torch.bfloat16
).to("cuda")
logger.info("FLUX pipeline loaded successfully")


def find_nearest_valid_dimensions(width: float, height: float) -> tuple:
    """Find nearest dimensions: multiples of 8, product divisible by 65536."""
    MAX_DIMENSION = 8192
    MIN_DIMENSION = 64
    MAX_PIXELS = 1024 * 1024

    if width > MAX_DIMENSION or height > MAX_DIMENSION:
        raise ValueError(f"Dimensions too large: {width}x{height}. Max {MAX_DIMENSION}x{MAX_DIMENSION}")
    if width < MIN_DIMENSION or height < MIN_DIMENSION:
        raise ValueError(f"Dimensions too small: {width}x{height}. Min {MIN_DIMENSION}x{MIN_DIMENSION}")

    start_w = round(width)
    start_h = round(height)

    current_pixels = start_w * start_h
    if current_pixels > MAX_PIXELS:
        scale = (MAX_PIXELS / current_pixels) ** 0.5
        start_w = round(start_w * scale)
        start_h = round(start_h * scale)

    def is_valid(w, h):
        return w % 8 == 0 and h % 8 == 0 and (w * h) % 65536 == 0

    nearest_w = round(start_w / 8) * 8
    nearest_h = round(start_h / 8) * 8

    offset = 0
    while offset < 100:
        for w in range(nearest_w - offset * 8, nearest_w + offset * 8 + 1, 8):
            if w <= 0:
                continue
            for h in range(nearest_h - offset * 8, nearest_h + offset * 8 + 1, 8):
                if h <= 0:
                    continue
                if is_valid(w, h):
                    return w, h
        offset += 1

    return nearest_w, nearest_h


def handler(job):
    """RunPod handler. Input/output matches existing /generate API."""
    job_input = job["input"]

    prompts = job_input.get("prompts", ["a photo of an astronaut riding a horse on mars"])
    width = job_input.get("width", 1024)
    height = job_input.get("height", 1024)
    steps = job_input.get("steps", 4)
    seed = job_input.get("seed")

    if seed is None:
        seed = int.from_bytes(os.urandom(2), "big")

    logger.info(f"Generating: {prompts[0][:80]}... {width}x{height} seed={seed}")

    width, height = find_nearest_valid_dimensions(width, height)
    generator = torch.Generator("cuda").manual_seed(seed)

    with torch.inference_mode():
        output = pipe(
            prompt=prompts[0],
            generator=generator,
            width=width,
            height=height,
            num_inference_steps=steps,
        )

    image = output.images[0]
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format="JPEG", quality=95)
    img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode("utf-8")

    # Return same format as existing FastAPI /generate endpoint
    return [{
        "image": img_base64,
        "has_nsfw_concept": False,
        "concept": [],
        "width": width,
        "height": height,
        "seed": seed,
        "prompt": prompts[0],
    }]


runpod.serverless.start({"handler": handler})
