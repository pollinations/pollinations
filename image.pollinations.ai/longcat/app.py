import modal
import torch
from diffusers import LongCatImagePipeline
from fastapi import FastAPI, Response, Request
import io
app = modal.App("longcat_t2i")
vol = modal.Volume.from_name("longcat_t2i_volume")
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

class LongCatInfer:
    def __init__(self, model_path="/models/diffusion_models/Longcat"):
        self.device = "cuda"
        self.pipe = LongCatImagePipeline.from_pretrained(
            model_path,
            torch_dtype=torch.bfloat16
        ).to(self.device)
        self.pipe.enable_xformers_memory_efficient_attention()
        self.pipe.set_progress_bar_config(disable=True)

    def generate_image(self, prompt: str, height=768, width=768, steps=10, seed=42):
        with torch.inference_mode():  
            image = self.pipe(
                prompt=prompt,
                height=height,
                width=width,
                guidance_scale=4.0,
                num_inference_steps=steps,
                num_images_per_prompt=1,
                generator=torch.Generator("cuda").manual_seed(seed),
                enable_cfg_renorm=True,
                enable_prompt_rewrite=True,
            ).images[0]
        return image


@app.cls(
    gpu=modal.gpu.H100(memory=80),
    volumes={"/models": vol},
    image=image,
    container_idle_timeout=300,
    timeout=1800,
)
class LongCatServer:

    @modal.enter()
    def load(self):
        # Load model once per container
        self.infer = LongCatInfer()

        # Initialize FastAPI app
        self.fastapi_app = FastAPI(title="LongCat T2I API")

        @self.fastapi_app.get("/")
        def root():
            return {
                "endpoints": {
                    "/generate?prompt=...": "Generate an image from a text prompt (GET)",
                    "/health": "Health check endpoint"
                },
                "example": "/generate?prompt=a cute bear"
            }

        @self.fastapi_app.get("/health")
        def health():
            return {"status": "healthy"}

        @self.fastapi_app.get("/generate")
        def generate(request: Request):
            prompt = request.query_params.get("prompt")
            if not prompt:
                return {"error": "Missing query parameter 'prompt'"}
            img = self.infer.generate_image(prompt, height=768, width=768, steps=15)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=95)
            return Response(buf.getvalue(), media_type="image/jpeg")


server = LongCatServer()
public_endpoint = modal.Network.from_cls(server, port=5000)
