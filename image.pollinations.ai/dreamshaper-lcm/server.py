import os, sys, io, base64, logging, torch, time, threading, warnings, asyncio, aiohttp
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager

os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
os.environ["TQDM_DISABLE"] = "1"
warnings.filterwarnings("ignore")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)
for noisy in ["httpx", "httpcore", "urllib3", "diffusers", "transformers", "huggingface_hub", "peft"]:
    logging.getLogger(noisy).setLevel(logging.WARNING)

MODEL_ID = os.getenv("MODEL_ID", "Lykon/dreamshaper-8")
LCM_LORA_ID = os.getenv("LCM_LORA", "latent-consistency/lcm-lora-sdv1-5")
# Tiny distilled decoder. Measured 3.9x end-to-end on an RTX 3060 versus the
# stock VAE with no visible quality difference - the decode, not the UNet, is
# the bottleneck at low step counts. taesd is the SD1.x/2.x variant; SDXL would
# need taesdxl.
TINY_VAE_ID = os.getenv("TINY_VAE", "madebyollin/taesd")
MODEL_CACHE = "model_cache"
# 3 is the floor for usable output. Measured on an RTX 3090 (512x512, b=1):
# 1 step is unrecoverable mush, 2 holds up on portraits but goes soft on scenes
# and flat-vector work, 3 is clean. 3 steps also runs 6.18 img/s versus 5.06 at
# 4, which is what lets a single card cover the 5.72 img/s peak hour.
NUM_INFERENCE_STEPS = int(os.getenv("NUM_INFERENCE_STEPS", "3"))
# LCM-LoRA bakes guidance into the model. Measured: cfg 1.5 and cfg 0.0 are
# visually identical, but cfg > 1 turns on classifier-free guidance, which runs
# a second unconditional pass per step and costs 1.8x throughput for nothing.
GUIDANCE_SCALE = float(os.getenv("GUIDANCE_SCALE", "0.0"))
MAX_DIM = int(os.getenv("MAX_DIM", "768"))
MAX_PIXELS = int(os.getenv("MAX_PIXELS", str(512 * 512)))

generate_lock = threading.Lock()


class ImageRequest(BaseModel):
    prompts: list[str] = Field(default=["a cat"], min_length=1)
    width: int = Field(default=512)
    height: int = Field(default=512)
    seed: int | None = None
    # Accepted for contract compatibility but deliberately ignored, exactly as
    # the sana worker did. The gen worker hardcodes steps=4 in every request
    # body; honouring that would drop this card below the peak-hour rate it was
    # sized for. Step count belongs to the model config, not the caller.
    steps: int | None = None
    safety_checker_adj: float | None = None


def clamp_dims(w, h):
    w, h = min(w, MAX_DIM), min(h, MAX_DIM)
    w = max(32, (w // 32) * 32)
    h = max(32, (h // 32) * 32)
    if w * h > MAX_PIXELS:
        scale = (MAX_PIXELS / (w * h)) ** 0.5
        w = max(32, int(w * scale) // 32 * 32)
        h = max(32, int(h * scale) // 32 * 32)
    return w, h


pipe = None
BACKEND_TOKEN = os.getenv("PLN_GPU_TOKEN")


def get_public_ip():
    import requests
    try:
        return requests.get("https://api.ipify.org", timeout=5).text
    except Exception:
        return None


async def send_heartbeat():
    # Registering puts this worker into the live pool immediately. Keep it off
    # while validating a new host so a half-checked box cannot take traffic.
    if os.getenv("HEARTBEAT_ENABLED", "true").lower() not in ("1", "true", "yes"):
        return
    public_hostname = os.getenv("PUBLIC_HOSTNAME")
    if public_hostname:
        url = f"https://{public_hostname}"
    else:
        public_ip = os.getenv("PUBLIC_IP")
        if not public_ip:
            public_ip = await asyncio.get_event_loop().run_in_executor(None, get_public_ip)
        if not public_ip:
            return
        url = f"http://{public_ip}:{int(os.getenv('PORT', '8766'))}"
    register_url = os.getenv("REGISTER_URL", "https://gen.pollinations.ai/register")
    # Pool key is "sana", not "dreamshaper": /register rejects unknown types, so
    # keeping the old key lets this worker join the pool before the gen routing
    # change deploys. See VALID_TYPES in gen's availableServers.ts.
    service_type = os.getenv("SERVICE_TYPE", "sana")
    token = os.getenv("PLN_GPU_TOKEN", "")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(register_url, json={"url": url, "type": service_type}, headers=headers) as resp:
                if resp.status == 200:
                    logger.info("Heartbeat sent: %s", url)
                else:
                    logger.error("Heartbeat failed: %s", resp.status)
    except Exception as e:
        logger.error("Heartbeat error: %s", e)


async def periodic_heartbeat():
    while True:
        try:
            await send_heartbeat()
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error("Heartbeat loop error: %s", e)
            await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipe
    from diffusers import StableDiffusionPipeline, AutoencoderTiny, LCMScheduler
    if not BACKEND_TOKEN:
        logger.critical("PLN_GPU_TOKEN not configured - refusing to start")
        raise RuntimeError("PLN_GPU_TOKEN must be configured")
    logger.info("Loading %s + %s...", MODEL_ID, LCM_LORA_ID)
    t0 = time.time()
    pipe = StableDiffusionPipeline.from_pretrained(
        MODEL_ID, torch_dtype=torch.float16, variant="fp16", cache_dir=MODEL_CACHE,
        safety_checker=None, requires_safety_checker=False,
    ).to("cuda")
    # Fuse the LCM LoRA into the UNet so there is no per-request adapter cost.
    # Requires `peft` - diffusers >= 0.30 dropped the non-PEFT LoRA backend.
    pipe.load_lora_weights(LCM_LORA_ID)
    pipe.fuse_lora()
    pipe.unload_lora_weights()  # frees adapter modules; does NOT unmerge
    # MANDATORY: dreamshaper-8 ships DEISMultistepScheduler with solver_order=2
    # and timestep_spacing="leading". Running an LCM model on that produces
    # washed-out mush with no exception raised.
    pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
    pipe.vae = AutoencoderTiny.from_pretrained(
        TINY_VAE_ID, torch_dtype=torch.float16, cache_dir=MODEL_CACHE).to("cuda")
    pipe.set_progress_bar_config(disable=True)
    logger.info("Loaded in %.1fs (scheduler=%s, vae=%s)", time.time() - t0,
                pipe.scheduler.__class__.__name__, pipe.vae.__class__.__name__)

    heartbeat_task = None
    try:
        await send_heartbeat()
        heartbeat_task = asyncio.create_task(periodic_heartbeat())
        app.state.heartbeat_task = heartbeat_task
        logger.info("Heartbeat started")
    except Exception as e:
        logger.error("Heartbeat init error: %s", e)

    try:
        yield
    finally:
        if heartbeat_task:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass


app = FastAPI(title="DreamShaper-8 LCM", lifespan=lifespan)


def verify_backend_token(x_backend_token: str = Header(None, alias="x-backend-token")):
    if x_backend_token != BACKEND_TOKEN:
        logger.warning("Invalid or missing backend token")
        raise HTTPException(status_code=403, detail="Unauthorized")
    return True


@app.post("/generate")
def generate(request: ImageRequest, _auth: bool = Depends(verify_backend_token)):
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
                              num_inference_steps=NUM_INFERENCE_STEPS, guidance_scale=GUIDANCE_SCALE)
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
    return {"status": "healthy", "model": MODEL_ID, "lora": LCM_LORA_ID,
            "steps": NUM_INFERENCE_STEPS, "guidance": GUIDANCE_SCALE}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8766")))
