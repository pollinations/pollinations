import modal
import math
import os
import tempfile
import urllib.parse
from pydantic import BaseModel, Field, field_validator, ValidationInfo

app = modal.App("longcat_i2i_t2i")
vol = modal.Volume.from_name("longcat_t2i_volume")

MAX_GEN_PIXELS = 768 * 768
MAX_FINAL_PIXELS = 768 * 768


class ImageRequest(BaseModel):
    prompt: str
    width: int = Field(default=1024, ge=256, le=2048)
    height: int = Field(default=576, ge=256, le=2048)
    seed: int | None = None
    image: str | None = None
    
    @field_validator('height')
    @classmethod
    def validate_total_pixels(cls, height: int, info: ValidationInfo) -> int:
        if 'width' in info.data:
            width = info.data['width']
            total_pixels = width * height
            if total_pixels > MAX_FINAL_PIXELS:
                raise ValueError(
                    f"Requested {width}x{height} = {total_pixels:,} pixels exceeds limit of {MAX_FINAL_PIXELS:,} pixels. "
                    f"Max: 768x768 or equivalent area."
                )
        return height
    
    @field_validator('image')
    @classmethod
    def validate_image_url(cls, image: str | None) -> str | None:
        if image:
            parsed = urllib.parse.urlparse(image)
            if parsed.scheme not in ('http', 'https'):
                raise ValueError("Image URL must start with http:// or https://")
        return image


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
        "git+https://github.com/huggingface/diffusers@main",
    )
    .pip_install(
        "torch==2.5.1",
        "torchvision==0.20.1", 
        "torchaudio==2.5.1",
        index_url="https://download.pytorch.org/whl/cu121"
    )
)

@app.cls(
    gpu="H100:2",
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
        from diffusers import LongCatImagePipeline, LongCatImageEditPipeline
        
        device = "cuda"
        self.pipe_t2i = LongCatImagePipeline.from_pretrained(
            self.model_path,
            torch_dtype=torch.bfloat16,
        ).to(device)
        
        self.pipe_i2i = LongCatImageEditPipeline.from_pretrained(
            self.model_path,
            torch_dtype=torch.bfloat16,
        ).to(device)

        self.pipe_t2i.set_progress_bar_config(disable=True)
        self.pipe_i2i.set_progress_bar_config(disable=True)

    def download_image(self, image_url: str) -> str:
        import requests
        import tempfile
        
        response = requests.get(image_url, timeout=30)
        response.raise_for_status()
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as tmp:
            tmp.write(response.content)
            return tmp.name

    @modal.method()
    def generate_t2i(self, prompt: str, width: int = 768, height: int = 768, seed: int | None = None) -> bytes:
        import torch
        import io
        
        final_w, final_h = calculate_generation_dimensions(width, height)
        
        if seed is None:
            seed = int.from_bytes(__import__('os').urandom(8), "big")
        
        with torch.inference_mode():
            img = self.pipe_t2i(
                prompt=prompt,
                height=final_h,
                width=final_w,
                guidance_scale=4.0,
                num_inference_steps=30,
                num_images_per_prompt=1,
                generator=torch.Generator("cuda").manual_seed(seed),
                enable_cfg_renorm=True,
                enable_prompt_rewrite=True,
            ).images[0]

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=95)
        return buf.getvalue()

    @modal.method()
    def generate_i2i(self, image_url: str, prompt: str, width: int = 768, height: int = 768, seed: int | None = None) -> bytes:
        import torch
        import io
        from PIL import Image
        
        final_w, final_h = calculate_generation_dimensions(width, height)
        
        if seed is None:
            seed = int.from_bytes(__import__('os').urandom(8), "big")
        
        image_path = self.download_image(image_url)
        
        try:
            img_input = Image.open(image_path).convert('RGB')
            
            with torch.inference_mode():
                img = self.pipe_i2i(
                    img_input,
                    prompt,
                    negative_prompt='',
                    guidance_scale=4.5,
                    num_inference_steps=50,
                    num_images_per_prompt=1,
                    generator=torch.Generator("cuda").manual_seed(seed),
                ).images[0]

            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=95)
            return buf.getvalue()
        finally:
            if os.path.exists(image_path):
                os.remove(image_path)

@app.function(image=image)
@modal.asgi_app()
def web():
    from fastapi import FastAPI, Response, Request
    
    web_app = FastAPI(title="LongCat I2I/T2I API")

    @web_app.get("/")
    def root():
        return {
            "endpoints": {
                "/generate (GET)": "Generate image - T2I: ?prompt=...&width=1024&height=576&seed=42 | I2I: ?prompt=...&image=https://...&width=1024&height=576&seed=42",
                "/health": "Health check",
            }
        }

    @web_app.get("/health")
    def health():
        return {"status": "healthy"}

    @web_app.get("/generate")
    async def generate_get(
        prompt: str,
        image: str | None = None,
        width: int = 1024,
        height: int = 576,
        seed: int | None = None
    ):
        from fastapi.responses import JSONResponse
        try:
            img_request = ImageRequest(prompt=prompt, width=width, height=height, seed=seed, image=image)
            
            if img_request.image:
                img_bytes = LongCatInference().generate_i2i.remote(
                    img_request.image,
                    img_request.prompt,
                    img_request.width,
                    img_request.height,
                    img_request.seed
                )
            else:
                img_bytes = LongCatInference().generate_t2i.remote(
                    img_request.prompt,
                    img_request.width,
                    img_request.height,
                    img_request.seed
                )
            return Response(img_bytes, media_type="image/jpeg")
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=400)

    return web_app

@app.local_entrypoint()
def main(
    prompt: str = "a cute bear",
    width: int = 1024,
    height: int = 576,
    image: str | None = None
):
    if image:
        img_bytes = LongCatInference().generate_i2i.remote(image, prompt, width, height)
        print(f"✓ Generated {width}x{height} image for: '{prompt}' with image input")
    else:
        img_bytes = LongCatInference().generate_t2i.remote(prompt, width, height)
        print(f"✓ Generated {width}x{height} image for: '{prompt}'")
    print(f"✓ Image size: {len(img_bytes)} bytes")
    with open("/tmp/output.jpg", "wb") as f:
        f.write(img_bytes)
