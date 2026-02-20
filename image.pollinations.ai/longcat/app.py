import modal
import math
import os
import tempfile
import urllib.parse
from pydantic import BaseModel, Field, field_validator, ValidationInfo

app = modal.App("longcat_i2i_t2i")
vol = modal.Volume.from_name("longcat_t2i_volume")

MAX_GEN_PIXELS = 2048 * 2048
MAX_FINAL_PIXELS = 2048 * 2048


class ImageRequest(BaseModel):
    prompt: str
    width: int = Field(default=1024, ge=256, le=2048)
    height: int = Field(default=576, ge=256, le=2048)
    seed: int | None = None

    @field_validator("height")
    @classmethod
    def validate_total_pixels(cls, height: int, info: ValidationInfo) -> int:
        if "width" in info.data:
            width = info.data["width"]
            total_pixels = width * height
            if total_pixels > MAX_FINAL_PIXELS:
                raise ValueError(
                    f"Requested {width}x{height} = {total_pixels:,} pixels exceeds limit "
                    f"of {MAX_FINAL_PIXELS:,} pixels (max 2048x2048 area)."
                )
        return height


def calculate_generation_dimensions(requested_width: int, requested_height: int) -> tuple[int, int]:
    final_w, final_h = requested_width, requested_height
    total_pixels = final_w * final_h

    if total_pixels > MAX_FINAL_PIXELS:
        scale = math.sqrt(MAX_FINAL_PIXELS / total_pixels)
        final_w = round(final_w * scale)
        final_h = round(final_h * scale)

    final_w = round(final_w / 16) * 16
    final_h = round(final_h / 16) * 16

    final_w = max(final_w, 256)
    final_h = max(final_h, 256)

    return final_w, final_h


image = (
    modal.Image.debian_slim(python_version="3.10")
    .run_commands("apt-get update && apt-get install -y git curl wget")
    .run_commands("pip install --upgrade pip")
    .pip_install(
        "transformers==4.57.1",
        "accelerate==1.11.0",
        "safetensors==0.6.2",
        "openai==2.8.1",
        "fastapi",
        "uvicorn",
        "Pillow",
        "requests",
        "urllib3",
        "pydantic",
        "git+https://github.com/huggingface/diffusers@main",
    )
    .pip_install(
        "torch==2.5.1",
        "torchvision==0.20.1",
        "torchaudio==2.5.1",
        index_url="https://download.pytorch.org/whl/cu121",
    )
)


@app.cls(
    gpu="H100",
    volumes={"/models": vol},
    image=image,
    scaledown_window=300,
    timeout=1800,
)
class LongCatInference:
    model_path: str = modal.parameter(default="/models")

    @modal.enter()
    def setup(self):
        import torch
        from diffusers import LongCatImagePipeline

        self.device_t2i = torch.device("cuda")

        self.pipe_t2i = LongCatImagePipeline.from_pretrained(
            self.model_path,
            torch_dtype=torch.bfloat16,
        ).to(self.device_t2i)

        self.pipe_t2i.set_progress_bar_config(disable=True)

    def download_image(self, image_url: str) -> str:
        import requests

        r = requests.get(image_url, timeout=30)
        r.raise_for_status()

        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpeg") as f:
            f.write(r.content)
            return f.name

    @modal.method()
    def generate_t2i(self, prompt: str, width: int = 1024, height: int = 1024, seed: int | None = None) -> bytes:
        import torch, io

        final_w, final_h = calculate_generation_dimensions(width, height)
        if seed is None:
            seed = int.from_bytes(os.urandom(8), "big")

        gen = torch.Generator(device=self.device_t2i).manual_seed(seed)

        with torch.inference_mode():
            img = self.pipe_t2i(
                prompt=prompt,
                height=final_h,
                width=final_w,
                guidance_scale=4.0,
                num_inference_steps=40,
                generator=gen,
                enable_cfg_renorm=False,
                enable_prompt_rewrite=False,
            ).images[0]

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=100)
        return buf.getvalue()


@app.function(image=image)
@modal.asgi_app()
def web():
    from fastapi import FastAPI, Response
    from fastapi.responses import JSONResponse

    web_app = FastAPI(title="LongCat T2I API")

    @web_app.get("/")
    def root():
        return {
            "endpoints": {
                "/generate": "GET ?prompt=... [&width=...] [&height=...] [&seed=...]",
                "/health": "Health check",
            }
        }

    @web_app.get("/health")
    def health():
        return {"status": "healthy"}

    @web_app.get("/generate")
    async def generate(
        prompt: str,
        width: int = 2048,
        height: int = 2048,
        seed: int | None = None,
    ):
        try:
            req = ImageRequest(prompt=prompt, width=width, height=height, seed=seed)

            img_bytes = LongCatInference().generate_t2i.remote(
                req.prompt, req.width, req.height, req.seed
            )

            return Response(img_bytes, media_type="image/jpeg")
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=400)

    return web_app


@app.local_entrypoint()
def main(
    prompt: str = "a cute bear",
    width: int = 2048,
    height: int = 2048,
):
    img_bytes = LongCatInference().generate_t2i.remote(prompt, width, height)
    print(f"✓ T2I generated {width}x{height}")

    with open("/tmp/output.jpg", "wb") as f:
        f.write(img_bytes)
    print(f"✓ Saved /tmp/output.jpg ({len(img_bytes)} bytes)")