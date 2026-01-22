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
        "diffusers",
        "Pillow",
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
class LongCatInference:
    model_path: str = modal.parameter(default="/models/diffusion_models/Longcat")
    
    def setup(self):
        """Initialize the model on container startup."""
        device = "cuda"
        self.pipeline = LongCatImagePipeline.from_pretrained(
            self.model_path,
            torch_dtype=torch.bfloat16
        ).to(device)
        self.pipeline.enable_xformers_memory_efficient_attention()
        self.pipeline.set_progress_bar_config(disable=True)

    @modal.method()
    def generate(self, prompt: str) -> bytes:
        """Generate an image from a text prompt and return as JPEG bytes."""
        with torch.inference_mode():
            img = self.pipeline(
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

# ---- FastAPI web endpoint ----
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
    """Generate endpoint that accepts JSON payload."""
    try:
        data = await request.json()
        prompt = data.get("prompt")
        if not prompt:
            return {"error": "Missing 'prompt' field in request body"}
        
        model = LongCatInference()
        img_bytes = await model.generate.aio(prompt)
        return Response(img_bytes, media_type="image/jpeg")
    except Exception as e:
        return {"error": str(e)}

@app.function()
def web():
    """Run the FastAPI server."""
    import uvicorn
    uvicorn.run(web_app, host="0.0.0.0", port=8000)

@app.local_entrypoint()
def main(prompt: str = "a cute bear"):
    """Local entrypoint for testing inference."""
    model = LongCatInference()
    img_bytes = model.generate.remote(prompt)
    print(f"✓ Generated image for prompt: '{prompt}'")
    print(f"✓ Image size: {len(img_bytes)} bytes")
    with open("/tmp/output.jpg", "wb") as f:
        f.write(img_bytes)
    print(f"✓ Image saved to /tmp/output.jpg")
