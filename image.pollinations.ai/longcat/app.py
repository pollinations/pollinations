import modal
import torch
from diffusers import LongCatImagePipeline
from fastapi import FastAPI, Response, Request
import io

app = modal.App("longcat_t2i")

vol = modal.Volume.from_name("longcat_t2i_volume")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .run_commands("apt-get update && apt-get install -y git")
    .pip_install(
        "torch",
        "transformers",
        "accelerate",
        "safetensors",
        "xformers",
        "fastapi",
        "uvicorn",
        "Pillow",
        "git+https://github.com/huggingface/diffusers"
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
        device = "cuda"
        self.pipe = LongCatImagePipeline.from_pretrained(
            self.model_path,
            torch_dtype=torch.bfloat16
        ).to(device)
        self.pipe.enable_xformers_memory_efficient_attention()
        self.pipe.set_progress_bar_config(disable=True)

    @modal.method()
    def generate(self, prompt: str) -> bytes:
        with torch.inference_mode():
            img = self.pipe(
                prompt=prompt,
                height=768,
                width=768,
                guidance_scale=4.0,
                num_inference_steps=10,
                num_images_per_prompt=1,
                generator=torch.Generator("cuda").manual_seed(42),
                enable_cfg_renorm=True,
                enable_prompt_rewrite=True,
            ).images[0]
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=95)
        return buf.getvalue()

web_app = FastAPI(title="LongCat T2I API")

@web_app.get("/")
def root():
    return {
        "endpoints": {
            "/generate": "Generate image from text prompt (POST with JSON)",
            "/health": "Health check"
        },
        "example": {"prompt": "a cute bear"}
    }

@web_app.get("/health")
def health():
    return {"status": "healthy"}

@web_app.post("/generate")
async def generate_endpoint(request: Request):
    try:
        data = await request.json()
        prompt = data.get("prompt")
        if not prompt:
            return {"error": "Missing 'prompt' field in request body"}
        
        img_bytes = LongCatInference().generate.remote(prompt)
        return Response(img_bytes, media_type="image/jpeg")
    except Exception as e:
        return {"error": str(e)}

@app.function()
@modal.asgi_app()
def web():
    return web_app

@app.local_entrypoint()
def main(prompt: str = "a cute bear"):
    img_bytes = LongCatInference().generate.remote(prompt)
    print(f"✓ Generated image for prompt: '{prompt}'")
    print(f"✓ Image size: {len(img_bytes)} bytes")
    with open("/tmp/output.jpg", "wb") as f:
        f.write(img_bytes)
    print(f"✓ Image saved to /tmp/output.jpg")