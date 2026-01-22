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
        # HARD PIN: coherent CUDA 12.1 stack
        "torch==2.6.0+cu121",
        "torchvision==0.21.0+cu121",
        "torchaudio==2.6.0+cu121",
        extra_index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        # Transformers/Qwen compatibility window
        "transformers==4.57.1",
        "accelerate==1.11.0",
        "safetensors==0.6.2",
        "openai==2.8.1",
        # Must come AFTER torch
        "xformers",
        "fastapi",
        "uvicorn",
        "Pillow",
        # Diffusers with LongCat pipeline
        "git+https://github.com/huggingface/diffusers@main"
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
            torch_dtype=torch.bfloat16,
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
            "/health": "Health check",
        }
    }

@web_app.get("/health")
def health():
    return {"status": "healthy"}

@web_app.post("/generate")
async def generate_endpoint(request: Request):
    data = await request.json()
    prompt = data.get("prompt")
    if not prompt:
        return {"error": "Missing 'prompt' field in request body"}

    img_bytes = LongCatInference().generate.remote(prompt)
    return Response(img_bytes, media_type="image/jpeg")

@app.function()
@modal.asgi_app()
def web():
    return web_app

@app.local_entrypoint()
def main(prompt: str = "a cute bear"):
    img_bytes = LongCatInference().generate.remote(prompt)
    with open("/tmp/output.jpg", "wb") as f:
        f.write(img_bytes)
