import modal
import torch
from diffusers import LongCatImagePipeline
from fastapi import FastAPI, Response, Request
import io

# ---- Modal App ----
app = modal.App("longcat_t2i")

# ---- Volume with model ----
vol = modal.Volume.from_name("longcat_t2i_volume")

# ---- Container image with dependencies ----
image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "torch",
        "transformers",
        "accelerate",
        "safetensors",
        "xformers",
        "fastapi",
        "uvicorn",
        "git+https://github.com/huggingface/diffusers",
    )
)

# ---- Initialize GPU container ----
@app.cls(
    gpu="H100",
    volumes={"/models": vol},
    image=image,
    scaledown_window=300,
    timeout=1800,
)
class Container:
    # This runs once per container
    @modal.enter()
    def setup(self):
        global infer
        device = "cuda"
        infer = LongCatImagePipeline.from_pretrained(
            "/models/diffusion_models/Longcat",
            torch_dtype=torch.bfloat16
        ).to(device)
        infer.enable_xformers_memory_efficient_attention()
        infer.set_progress_bar_config(disable=True)

        # FastAPI app at container level
        global fastapi_app
        fastapi_app = FastAPI(title="LongCat T2I API")

        @fastapi_app.get("/")
        def root():
            return {
                "endpoints": {
                    "/generate?prompt=...": "Generate image from text prompt",
                    "/health": "Health check"
                },
                "example": "/generate?prompt=a cute bear"
            }

        @fastapi_app.get("/health")
        def health():
            return {"status": "healthy"}

        @fastapi_app.get("/generate")
        def generate(request: Request):
            prompt = request.query_params.get("prompt")
            if not prompt:
                return {"error": "Missing query parameter 'prompt'"}
            with torch.inference_mode():
                img = infer(
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
            return Response(buf.getvalue(), media_type="image/jpeg")
