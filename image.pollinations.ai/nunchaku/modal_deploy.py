import os
import io
import base64
import modal
from typing import List
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import torch
from diffusers import FluxPipeline
from nunchaku.models.transformer_flux import NunchakuFluxTransformer2dModel
import sys
sys.path.append("/root")
from safety_checker.censor import check_safety

# Modal stub and image configuration
stub = modal.Stub("flux-image-generator")

# Create Modal image with all required dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.4.1",
        "torchvision==0.19.1",
        "torchaudio==2.4.1",
        "diffusers",
        "transformers",
        "accelerate",
        "sentencepiece",
        "protobuf",
        "huggingface_hub",
        "peft",
        "opencv-python",
        "einops",
        "fastapi",
    )
    .run_commands(
        # Install system dependencies
        "apt-get update && apt-get install -y libgl1-mesa-glx libglib2.0-0 git ninja-build gcc-11 g++-11",
        # Clone and install nunchaku
        "git clone https://github.com/mit-han-lab/nunchaku.git",
        "cd nunchaku && git submodule init && git submodule update",
        "cd nunchaku && pip install -e .",
    )
    # Copy safety checker module
    .copy_local_dir("safety_checker", "/root/safety_checker")
    # Add safety checker to Python path
    .run_commands("export PYTHONPATH=/root:$PYTHONPATH")
)

# Constants
MODEL_ID = "black-forest-labs/FLUX.1-schnell"
QUANT_MODEL_PATH = "mit-han-lab/svdq-int4-flux.1-schnell"

class ImageRequest(BaseModel):
    prompts: List[str] = ["a photo of an astronaut riding a horse on mars"]
    width: int = 1024
    height: int = 1024
    steps: int = 4
    seed: int | None = None
    safety_checker_adj: float = 0.5

def find_nearest_valid_dimensions(width: float, height: float) -> tuple[int, int]:
    """Find the nearest dimensions that are multiples of 8 and their product is divisible by 65536."""
    start_w = round(width)
    start_h = round(height)
    
    def is_valid(w: int, h: int) -> bool:
        return w % 8 == 0 and h % 8 == 0 and (w * h) % 65536 == 0
    
    nearest_w = round(start_w / 8) * 8
    nearest_h = round(start_h / 8) * 8
    
    offset = 0
    while offset < 100:
        for w in range(nearest_w - offset * 8, nearest_w + offset * 8 + 1, 8):
            if w <= 0:
                continue
            for h in range(nearest_h - offset * 8, nearest_h + offset * 8 + 1, 8):
                if h <= 0:
                    continue
                if is_valid(w, h):
                    return w, h
        offset += 1
    
    return nearest_w, nearest_h

# FastAPI app
web_app = FastAPI(title="FLUX Image Generator", version="1.0.0")

@web_app.get("/health")
async def health_check():
    """Health check endpoint to verify service is running."""
    if not hasattr(generate, "model"):
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "message": "Model not initialized"}
        )
    return {"status": "healthy", "model": "FLUX.1-schnell"}

@web_app.post("/generate")
async def generate(request: ImageRequest):
    try:
        # Get model from context
        pipe = generate.model
        if pipe is None:
            raise RuntimeError("Model not initialized")
        
        print(f"Processing request with prompt: {request.prompts[0][:100]}...")
        
        seed = request.seed if request.seed is not None else int.from_bytes(os.urandom(2), "big")
        generator = torch.Generator("cuda").manual_seed(seed)
        
        # Find nearest valid dimensions
        width, height = find_nearest_valid_dimensions(request.width, request.height)
        if width != request.width or height != request.height:
            print(f"Adjusted dimensions from {request.width}x{request.height} to {width}x{height}")

        # Generate image
        try:
            with torch.inference_mode():
                output = pipe(
                    prompt=request.prompts[0],
                    generator=generator,
                    width=width,
                    height=height,
                    num_inference_steps=request.steps,
                )
        except Exception as e:
            print(f"Error during image generation: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")

        # Check for NSFW content
        try:
            image = output.images[0]
            concepts, has_nsfw = check_safety([image], request.safety_checker_adj)
            print(f"Safety check results - NSFW: {has_nsfw[0]}")
        except Exception as e:
            print(f"Error during safety check: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Safety check failed: {str(e)}")
        
        # Convert image to base64
        try:
            img_byte_arr = io.BytesIO()
            image.save(img_byte_arr, format='JPEG', quality=95)
            img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')
        except Exception as e:
            print(f"Error encoding image: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Image encoding failed: {str(e)}")
        
        response_content = [{
            "image": img_base64,
            "has_nsfw_concept": has_nsfw[0],
            "concept": concepts[0],
            "width": width,
            "height": height,
            "seed": seed,
            "prompt": request.prompts[0]
        }]
        
        print(f"Successfully generated image with seed {seed}")
        return JSONResponse(content=response_content)
        
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Modal endpoint configuration
@stub.function(
    image=image,
    gpu="A100",
    timeout=600,
)
@modal.web_endpoint(method="POST")
def generate():
    if not hasattr(generate, "model"):
        print("=== Starting FLUX Image Generator Service ===")
        print(f"GPU Info: {torch.cuda.get_device_name()}")
        print(f"CUDA Version: {torch.version.cuda}")
        print(f"PyTorch Version: {torch.__version__}")
        
        print("\nInitializing models...")
        print(f"Loading transformer from {QUANT_MODEL_PATH}")
        try:
            transformer = NunchakuFluxTransformer2dModel.from_pretrained(QUANT_MODEL_PATH)
            print("Transformer loaded successfully")
            
            print(f"\nLoading FLUX pipeline from {MODEL_ID}")
            generate.model = FluxPipeline.from_pretrained(
                MODEL_ID,
                transformer=transformer,
                torch_dtype=torch.bfloat16
            ).to("cuda")
            print("FLUX pipeline loaded successfully")
            
            print("\nModel initialization complete")
            print("=== Service Ready ===")
        except Exception as e:
            print(f"Error during model initialization: {str(e)}")
            raise
    
    return web_app

if __name__ == "__main__":
    stub.serve()