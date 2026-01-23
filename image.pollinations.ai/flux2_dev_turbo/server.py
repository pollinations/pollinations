import os
import sys
import io
import base64
import logging
import asyncio
import gc
from huggingface_hub import login, snapshot_download, hf_hub_download
from dotenv import load_dotenv
load_dotenv()
login(token=os.getenv("HF_TOKEN"))

os.environ['FLASH_ATTENTION_SKIP_CUDA_BUILD'] = '1'
# Memory management optimization to reduce fragmentation
os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'expandable_segments:True'

import torch
import aiohttp
import requests
import numpy as np
from PIL import Image
from diffusers import Flux2Pipeline
import time
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import threading
import warnings
from contextlib import asynccontextmanager
import math

os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
os.environ["TQDM_DISABLE"] = "1"
warnings.filterwarnings("ignore")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger(__name__)
for noisy in ["httpx", "httpcore", "urllib3", "diffusers", "transformers", "huggingface_hub"]:
    logging.getLogger(noisy).setLevel(logging.WARNING)


def get_public_ip():
    try:
        response = requests.get('https://api.ipify.org', timeout=5)
        return response.text
    except Exception:
        return None


async def send_heartbeat():
    public_ip = os.getenv("PUBLIC_IP")
    if not public_ip:
        public_ip = await asyncio.get_event_loop().run_in_executor(None, get_public_ip)
    if public_ip:
        try:
            port = int(os.getenv("PUBLIC_PORT", os.getenv("PORT", "10003")))
            url = f"http://{public_ip}:{port}"
            service_type = os.getenv("SERVICE_TYPE", "flux2-dev-turbo")
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    'https://image.pollinations.ai/register',
                    json={'url': url, 'type': service_type}
                ) as response:
                    if response.status == 200:
                        logger.info(f"Heartbeat sent successfully. URL: {url}, type: {service_type}")
                    else:
                        logger.error(f"Failed to send heartbeat. Status: {response.status}")
        except Exception as e:
            logger.error(f"Error sending heartbeat: {e}")


async def periodic_heartbeat():
    while True:
        try:
            await send_heartbeat()
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            logger.info("Heartbeat task cancelled")
            raise
        except Exception as e:
            logger.error(f"Error in periodic heartbeat: {e}")
            await asyncio.sleep(5)



FLUX_BASE_MODEL = "black-forest-labs/FLUX.2-dev"
LORA_REPO_ID = "fal/FLUX.2-dev-Turbo"
LORA_FILENAME = "flux.2-turbo-lora.safetensors"
MODEL_CACHE = "model_cache"

# Pre-shifted custom sigmas for 8-step turbo inference
TURBO_SIGMAS = [1.0, 0.6509, 0.4374, 0.2932, 0.1893, 0.1108, 0.0495, 0.00031]

generate_lock = threading.Lock()


class ImageRequest(BaseModel):
    prompts: list[str] = Field(default=["a photo of an astronaut riding a horse on mars"], min_length=1)
    width: int = Field(default=1024, le=2048)
    height: int = Field(default=1024, le=2048)
    seed: int | None = None


def calc_time(start, end, msg):
    elapsed = end - start
    print(f"{msg} time: {elapsed:.2f} seconds")


def free_gpu_memory():
    """Aggressively free GPU memory"""
    try:
        if torch.cuda.is_available():
            # Clear all GPU caches
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
            # Force garbage collection
            gc.collect()
            
            # Log memory usage
            reserved = torch.cuda.memory_reserved() / 1e9
            allocated = torch.cuda.memory_allocated() / 1e9
            logger.info(f"GPU Memory - Reserved: {reserved:.2f}GB, Allocated: {allocated:.2f}GB")
    except Exception as e:
        logger.warning(f"Error freeing GPU memory: {e}")


pipe = None
heartbeat_task = None


def pil_to_tensor(image: Image.Image) -> torch.Tensor:
    image_np = np.array(image).astype(np.float32) / 255.0
    tensor = torch.from_numpy(image_np).permute(2, 0, 1).unsqueeze(0)
    return tensor


def tensor_to_pil(tensor: torch.Tensor) -> Image.Image:
    tensor = tensor.squeeze(0).permute(1, 2, 0).cpu()
    image_np = torch.clamp(tensor * 255, 0, 255).numpy().astype(np.uint8)
    return Image.fromarray(image_np)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipe, heartbeat_task
    
    logger.info("Starting up...")
    
    load_model_time = time.time()
    try:
        logger.info(f"Loading base FLUX.2-dev model...")
        pipe = Flux2Pipeline.from_pretrained(
            FLUX_BASE_MODEL,
            torch_dtype=torch.bfloat16,
            cache_dir=MODEL_CACHE,
        ).to("cuda")
        
        logger.info("Base FLUX.2-dev model loaded")
        
        logger.info(f"Loading LoRA weights from local cache...")
        lora_path = os.path.join(
            MODEL_CACHE,
            "models--fal--FLUX.2-dev-Turbo",
            "snapshots",
            "9ee51cd87578162cf8d02355a870bc5f4570045c",
            LORA_FILENAME
        )
        
        if os.path.exists(lora_path):
            logger.info(f"LoRA file found at: {lora_path}")
            try:
                lora_load_start = time.time()
                logger.info("Starting LoRA weights loading...")
                pipe.load_lora_weights(lora_path)
                lora_load_end = time.time()
                logger.info(f"LoRA weights loaded successfully in {lora_load_end - lora_load_start:.2f}s")
            except Exception as lora_err:
                logger.error(f"Error loading LoRA weights: {lora_err}")
                raise
        else:
            logger.warning(f"LoRA file not found at {lora_path}, attempting to download...")
            try:
                lora_file = hf_hub_download(
                    repo_id=LORA_REPO_ID,
                    filename=LORA_FILENAME,
                    cache_dir=MODEL_CACHE,
                    repo_type="model"
                )
                logger.info(f"LoRA file downloaded to: {lora_file}")
                pipe.load_lora_weights(lora_file)
                logger.info("LoRA weights loaded successfully")
            except Exception as download_err:
                logger.error(f"Error downloading/loading LoRA weights: {download_err}")
                raise
        
        load_model_time_end = time.time()
        calc_time(load_model_time, load_model_time_end, "Time to load models")
        logger.info("All models loaded successfully")
        
        # Initial memory cleanup
        free_gpu_memory()
        
    except Exception as e:
        logger.error(f"Failed to load models: {e}")
        raise
    
    heartbeat_task = asyncio.create_task(periodic_heartbeat())
    
    yield
    
    if heartbeat_task:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
    
    logger.info("Shutting down...")
    free_gpu_memory()


app = FastAPI(title="FLUX.2-dev-Turbo API", lifespan=lifespan)


def _truthy_env(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip() in {"1", "true", "TRUE", "yes", "YES"}


def verify_enter_token(x_enter_token: str = Header(None, alias="x-enter-token")):
    expected_token = os.getenv("PLN_ENTER_TOKEN")
    if not expected_token:
        logger.warning("PLN_ENTER_TOKEN not configured - allowing request")
        return True
    if x_enter_token != expected_token:
        logger.warning("Invalid or missing PLN_ENTER_TOKEN")
        raise HTTPException(status_code=403, detail="Unauthorized")
    return True


@app.post("/generate")
def generate(request: ImageRequest, _auth: bool = Depends(verify_enter_token)):
    logger.info(f"Request: {request}")
    if pipe is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    # Pre-generation memory cleanup
    free_gpu_memory()
    
    seed = request.seed if request.seed is not None else int.from_bytes(os.urandom(8), "big")
    logger.info(f"Using seed: {seed}")
    generator = torch.Generator("cuda").manual_seed(seed)
    
    try:
        with generate_lock:
            with torch.inference_mode():
                with torch.cuda.amp.autocast(dtype=torch.float16, enabled=True):
                    output = pipe(
                        prompt=request.prompts[0],
                        sigmas=TURBO_SIGMAS,
                        guidance_scale=2.5,
                        height=request.height,
                        width=request.width,
                        num_inference_steps=8,
                        generator=generator,
                    )
            
            image = output.images[0]
            logger.info(f"Generated image: {image.size}")
        
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='JPEG', quality=95)
        img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')
        
        # Post-generation memory cleanup
        del output
        free_gpu_memory()
        
        response_content = [{
            "image": img_base64,
            "width": image.width,
            "height": image.height,
            "seed": seed,
            "prompt": request.prompts[0]
        }]
        return JSONResponse(content=response_content)
    
    except torch.cuda.OutOfMemoryError as e:
        logger.error(f"CUDA OOM Error: {e}")
        free_gpu_memory()
        logger.error("Out of memory - attempting cleanup and exit for restart")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Generation failed: {e}")
        free_gpu_memory()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    if pipe is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "healthy", "model": FLUX_BASE_MODEL, "lora": LORA_REPO_ID}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "10003"))
    uvicorn.run(app, host="0.0.0.0", port=port)
