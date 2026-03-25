# image.pollinations.ai/runpod/zimage/handler.py
import os
import sys
import io
import base64
import logging
import math
import torch
import numpy as np
import runpod
from PIL import Image
from diffusers import ZImagePipeline
from spandrel import ImageModelDescriptor, ModelLoader

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_ID = "Tongyi-MAI/Z-Image-Turbo"
MODEL_CACHE = "model_cache"
SPAN_MODEL_PATH = "model_cache/span/2xNomosUni_span_multijpg.safetensors"
UPSCALE_FACTOR = 2
MAX_GEN_PIXELS = 768 * 768
MAX_FINAL_PIXELS = 768 * 768 * 4

# --- Model loading (runs once at container start) ---

logger.info("Loading Z-Image pipeline...")
pipe = ZImagePipeline.from_pretrained(
    MODEL_ID,
    torch_dtype=torch.bfloat16,
    cache_dir=MODEL_CACHE,
    low_cpu_mem_usage=False,
).to("cuda")

logger.info("Loading SPAN upscaler...")
upscaler = ModelLoader().load_from_file(SPAN_MODEL_PATH)
assert isinstance(upscaler, ImageModelDescriptor)
upscaler.cuda()
upscaler.eval()
logger.info(f"Models loaded. SPAN scale={upscaler.scale}x")


def calculate_generation_dimensions(requested_width, requested_height):
    final_w, final_h = requested_width, requested_height
    total_pixels = final_w * final_h

    if total_pixels > MAX_FINAL_PIXELS:
        scale = math.sqrt(MAX_FINAL_PIXELS / total_pixels)
        final_w = round(final_w * scale)
        final_h = round(final_h * scale)

    final_pixels = final_w * final_h
    should_upscale = final_pixels > MAX_GEN_PIXELS

    if should_upscale:
        gen_w = final_w // UPSCALE_FACTOR
        gen_h = final_h // UPSCALE_FACTOR
    else:
        gen_w, gen_h = final_w, final_h

    gen_w = round(gen_w / 16) * 16
    gen_h = round(gen_h / 16) * 16
    gen_w = max(gen_w, 256)
    gen_h = max(gen_h, 256)

    if should_upscale:
        final_w = gen_w * UPSCALE_FACTOR
        final_h = gen_h * UPSCALE_FACTOR
    else:
        final_w, final_h = gen_w, gen_h

    return gen_w, gen_h, final_w, final_h, should_upscale


def upscale_with_span(image_np):
    img_float = image_np.astype(np.float32) / 255.0
    tensor = torch.from_numpy(img_float).permute(2, 0, 1).unsqueeze(0).cuda()
    with torch.no_grad():
        output = upscaler(tensor)
    result = output.squeeze(0).permute(1, 2, 0).cpu().numpy()
    result = np.clip(result * 255, 0, 255).astype(np.uint8)
    return result


def handler(job):
    job_input = job["input"]

    prompts = job_input.get("prompts", ["a photo of an astronaut riding a horse on mars"])
    width = job_input.get("width", 1024)
    height = job_input.get("height", 1024)
    seed = job_input.get("seed")

    if seed is None:
        seed = int.from_bytes(os.urandom(8), "big")

    logger.info(f"Generating: {prompts[0][:80]}... {width}x{height} seed={seed}")

    gen_w, gen_h, final_w, final_h, should_upscale = calculate_generation_dimensions(width, height)
    generator = torch.Generator("cuda").manual_seed(seed)

    with torch.inference_mode():
        output = pipe(
            prompt=prompts[0],
            generator=generator,
            width=gen_w,
            height=gen_h,
            num_inference_steps=9,
            guidance_scale=0.0,
        )

    image = output.images[0]
    image_np = np.array(image)

    if should_upscale:
        logger.info(f"Upscaling {gen_w}x{gen_h} -> {gen_w*UPSCALE_FACTOR}x{gen_h*UPSCALE_FACTOR}")
        result = upscale_with_span(image_np)
    else:
        result = image_np

    upscaled_image = Image.fromarray(result)
    img_byte_arr = io.BytesIO()
    upscaled_image.save(img_byte_arr, format="JPEG", quality=95)
    img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode("utf-8")

    return [{
        "image": img_base64,
        "has_nsfw_concept": False,
        "concept": [],
        "width": upscaled_image.width,
        "height": upscaled_image.height,
        "seed": seed,
        "prompt": prompts[0],
    }]


runpod.serverless.start({"handler": handler})
