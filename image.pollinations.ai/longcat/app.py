import modal
import math
from pydantic import BaseModel, Field, field_validator, ValidationInfo

app = modal.App("longcat_t2i")
vol = modal.Volume.from_name("longcat_t2i_volume")

MAX_GEN_PIXELS = 768 * 768
MAX_FINAL_PIXELS = 768 * 768


class ImageRequest(BaseModel):
    prompt: str = Field(default="a cute bear")
    width: int = Field(default=1024, ge=256, le=2048)
    height: int = Field(default=576, ge=256, le=2048)
    seed: int | None = None
    
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
    .run_commands("apt-get update && apt-get install -y git")
    .run_commands("pip install --upgrade pip")
    .pip_install(
        "transformers==4.57.1",
        "accelerate==1.11.0",
        "safetensors==0.6.2",
        "openai==2.8.1",
        "fastapi",
        "uvicorn",
        "Pillow",
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
        
        device = "cuda"
        self.pipe = LongCatImagePipeline.from_pretrained(
            self.model_path,
            torch_dtype=torch.bfloat16,
        ).to(device)

        self.pipe.set_progress_bar_config(disable=True)

    @modal.method()
    def generate(self, prompt: str, width: int = 768, height: int = 768, seed: int | None = None) -> bytes:
        import torch
        import io
        
        final_w, final_h = calculate_generation_dimensions(width, height)
        
        if seed is None:
            seed = int.from_bytes(__import__('os').urandom(8), "big")
        
        with torch.inference_mode():
            img = self.pipe(
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

@app.function(image=image)
@modal.asgi_app()
def web():
    from fastapi import FastAPI, Response, Request
    
    web_app = FastAPI(title="LongCat T2I API")

    @web_app.get("/")
    def root():
        return {
            "endpoints": {
                "/generate (GET)": "Generate image with query params: ?prompt=...&width=1024&height=576&seed=42",
                "/generate (POST)": "Generate image with JSON body: {prompt, width, height, seed}",
                "/health": "Health check",
            }
        }

    @web_app.get("/health")
    def health():
        return {"status": "healthy"}

    @web_app.get("/generate")
    async def generate_get(
        prompt: str = "a cute bear",
        width: int = 1024,
        height: int = 576,
        seed: int | None = None
    ):
        from fastapi.responses import JSONResponse
        try:
            img_request = ImageRequest(prompt=prompt, width=width, height=height, seed=seed)
            
            img_bytes = LongCatInference().generate.remote(
                img_request.prompt,
                img_request.width,
                img_request.height,
                img_request.seed
            )
            return Response(img_bytes, media_type="image/jpeg")
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=400)

    @web_app.post("/generate")
    async def generate_post(request: Request):
        from fastapi.responses import JSONResponse
        try:
            data = await request.json()
            img_request = ImageRequest(**data)
            
            img_bytes = LongCatInference().generate.remote(
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
    height: int = 576
):
    img_bytes = LongCatInference().generate.remote(prompt, width, height)
    print(f"✓ Generated {width}x{height} image for: '{prompt}'")
    print(f"✓ Image size: {len(img_bytes)} bytes")
    with open("/tmp/output.jpg", "wb") as f:
        f.write(img_bytes)
