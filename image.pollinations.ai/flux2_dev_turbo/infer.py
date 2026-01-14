import torch
from diffusers import Flux2Pipeline
from huggingface_hub import login, snapshot_download, hf_hub_download
from dotenv import load_dotenv
import os
load_dotenv()
login(token=os.getenv("HF_TOKEN"))

# Pre-shifted custom sigmas for 8-step turbo inference
TURBO_SIGMAS = [1.0, 0.6509, 0.4374, 0.2932, 0.1893, 0.1108, 0.0495, 0.00031]

pipe = Flux2Pipeline.from_pretrained(
    "black-forest-labs/FLUX.2-dev", 
    torch_dtype=torch.bfloat16,
    cache_dir = "model_cache"
).to("cuda")

pipe.load_lora_weights(
    "fal/FLUX.2-dev-Turbo", 
    weight_name="flux.2-turbo-lora.safetensors"
)

prompt = "Industrial product shot of a chrome turbocharger with glowing hot exhaust manifold, engraved text 'FLUX.2 [dev] Turbo by fal' on the compressor housing and 'fal' on the turbine wheel, gradient heat glow from orange to electric blue , studio lighting with dramatic shadows, shallow depth of field, engineering blueprint pattern in background."

image = pipe(
    prompt=prompt,
    sigmas=TURBO_SIGMAS,
    guidance_scale=2.5,
    height=1024,
    width=1024,
    num_inference_steps=8,
).images[0]

image.save("output.png")
