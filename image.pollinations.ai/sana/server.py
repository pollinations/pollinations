import os, sys, io, base64, logging, torch, time, threading, warnings, math
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager

os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
os.environ["TQDM_DISABLE"] = "1"
warnings.filterwarnings("ignore")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)
for noisy in ["httpx", "httpcore", "urllib3", "diffusers", "transformers", "huggingface_hub"]:
    logging.getLogger(noisy).setLevel(logging.WARNING)

MODEL_ID = "Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers"
MODEL_CACHE = "model_cache"
NUM_INFERENCE_STEPS = 2
MAX_DIM = 512

generate_lock = threading.Lock()

class ImageRequest(BaseModel):
    prompts: list[str] = Field(default=["a cat"], min_length=1)
    width: int = Field(default=512)
    height: int = Field(default=512)
    seed: int | None = None
    steps: int | None = None
    safety_checker_adj: float | None = None

def clamp_dims(w, h):
    w, h = min(w, MAX_DIM), min(h, MAX_DIM)
    w = max(32, (w // 32) * 32)
    h = max(32, (h // 32) * 32)
    return w, h

pipe = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipe
    from diffusers import SanaSprintPipeline
    logger.info("Loading %s...", MODEL_ID)
    t0 = time.time()
    pipe = SanaSprintPipeline.from_pretrained(MODEL_ID, torch_dtype=torch.bfloat16, cache_dir=MODEL_CACHE).to("cuda")
    logger.info("Model loaded in %.1fs", time.time() - t0)
    yield

app = FastAPI(title="SANA-Sprint Legacy", lifespan=lifespan)

@app.post("/generate")
def generate(request: ImageRequest):
    if pipe is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    seed = request.seed if request.seed is not None else int.from_bytes(os.urandom(8), "big")
    generator = torch.Generator("cuda").manual_seed(seed)
    gen_w, gen_h = clamp_dims(request.width, request.height)
    try:
        t0 = time.time()
        with generate_lock:
            with torch.inference_mode():
                output = pipe(prompt=request.prompts[0], generator=generator, width=gen_w, height=gen_h,
                              num_inference_steps=NUM_INFERENCE_STEPS, guidance_scale=4.5)
            image = output.images[0]
        logger.info("Generated %dx%d in %.3fs", gen_w, gen_h, time.time() - t0)
        buf = io.BytesIO()
        image.save(buf, format="JPEG", quality=90)
        return JSONResponse(content=[{"image": base64.b64encode(buf.getvalue()).decode(), "has_nsfw_concept": False,
                                       "concept": [], "width": image.width, "height": image.height, "seed": seed,
                                       "prompt": request.prompts[0]}])
    except torch.cuda.OutOfMemoryError as e:
        logger.error("OOM: %s", e)
        sys.exit(1)

@app.get("/health")
async def health():
    if pipe is None:
        raise HTTPException(status_code=503, detail="Not loaded")
    return {"status": "healthy", "model": MODEL_ID}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "10003")))
