"""
FLUX.2 Klein 4B - FastAPI Server for RunPod Pod
================================================
Serves image generation via POST /generate with x-backend-token auth,
matching the pattern used by z-image and twinflow services.

Run:
    python handler.py
"""

import base64
import logging
import os
import time
from io import BytesIO

import torch
import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException
from PIL import Image
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("klein")

MODEL_ID = "black-forest-labs/FLUX.2-klein-4B"

# Use Network Volume for HF cache if available
cache_dir = "/workspace/hf-cache" if os.path.isdir("/workspace") else None
if cache_dir:
    os.environ["HF_HUB_CACHE"] = cache_dir

# Load model at startup
logger.info(f"Loading {MODEL_ID}...")
from diffusers import Flux2KleinPipeline

pipe = Flux2KleinPipeline.from_pretrained(
    MODEL_ID,
    torch_dtype=torch.bfloat16,
    cache_dir=cache_dir,
).to("cuda")
logger.info("Model loaded and ready!")

app = FastAPI()


def verify_backend_token(
    x_backend_token: str = Header(None, alias="x-backend-token"),
):
    expected_token = os.getenv("PLN_GPU_TOKEN")
    if not expected_token:
        logger.warning("PLN_GPU_TOKEN not configured - allowing request")
        return True
    if x_backend_token != expected_token:
        logger.warning("Invalid or missing backend token")
        raise HTTPException(status_code=403, detail="Unauthorized")
    return True


class ImageRequest(BaseModel):
    model_config = {"extra": "ignore"}
    prompts: list[str] = Field(
        default=["a photo of an astronaut riding a horse on mars"], min_length=1
    )
    width: int = Field(default=1024, ge=256, le=4096)
    height: int = Field(default=1024, ge=256, le=4096)
    seed: int | None = None
    guidance_scale: float = 4.0
    num_inference_steps: int = 4
    images: list[str] = Field(default=[], description="Base64-encoded reference images for editing")


@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL_ID}


@app.post("/generate")
async def generate(request: ImageRequest, _=Depends(verify_backend_token)):
    prompt = request.prompts[0] if request.prompts else ""

    generator = None
    seed = request.seed
    if seed is None:
        seed = int(torch.randint(0, 2**32, (1,)).item())
    generator = torch.Generator(device="cuda").manual_seed(seed)

    # Decode reference images if provided
    reference_images = None
    if request.images:
        reference_images = []
        for img_b64 in request.images[:10]:
            if img_b64.startswith("data:"):
                img_b64 = img_b64.split(",", 1)[1]
            img_bytes = base64.b64decode(img_b64)
            img = Image.open(BytesIO(img_bytes)).convert("RGB")
            reference_images.append(img)
        if len(reference_images) == 1:
            reference_images = reference_images[0]

    t0 = time.time()
    image = pipe(
        image=reference_images,
        prompt=prompt,
        height=request.height,
        width=request.width,
        guidance_scale=request.guidance_scale,
        num_inference_steps=request.num_inference_steps,
        generator=generator,
    ).images[0]
    elapsed = time.time() - t0
    logger.info(f"Generation took {elapsed:.2f}s ({request.width}x{request.height})")

    buf = BytesIO()
    image.save(buf, format="PNG")
    img_base64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return [
        {
            "image": img_base64,
            "has_nsfw_concept": False,
            "concept": [],
            "width": request.width,
            "height": request.height,
            "seed": seed,
            "prompt": prompt,
        }
    ]


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
