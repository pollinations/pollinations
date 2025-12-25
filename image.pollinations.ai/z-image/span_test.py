import torch
import numpy as np
from PIL import Image

# -----------------------------
# Z-IMAGE (GENERATION)
# -----------------------------
from diffusers import ZImagePipeline

device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.float16 if device == "cuda" else torch.float32

zpipe = ZImagePipeline.from_pretrained(
    "Tongyi-MAI/Z-Image-Turbo",
    torch_dtype=dtype,
    cache_dir="model_cache"
).to(device)

prompt = "an indian girl and a korean girl in a field of flowers, high detail, 4k"

with torch.inference_mode():
    zimage = zpipe(
        prompt=prompt,
        height=768,
        width=768,
        guidance_scale=1.0,
        num_inference_steps=4
    ).images[0]

zimage.save("zimage_raw.png")

# -----------------------------
# SPAN (UPSCALE)
# -----------------------------
from spandrel import ModelLoader

loader = ModelLoader(device=device)
model = loader.load_from_file(
    repo_id="chaiNNer-org/spandrel",
    model_name="SPANx4",
    cache_dir="model_cache"
).eval()

def pil_to_tensor(img):
    arr = np.array(img).astype(np.float32) / 255.0
    return torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0)

def tensor_to_pil(t):
    t = t.clamp(0, 1)[0].permute(1, 2, 0).cpu().numpy()
    return Image.fromarray((t * 255).astype(np.uint8))

inp = pil_to_tensor(zimage).to(device)

with torch.inference_mode():
    out = model(inp)

upscaled = tensor_to_pil(out)
upscaled.save("zimage_upscaled_span.png")

# -----------------------------
# GFPGAN (FACE RESTORATION)
# -----------------------------
from gfpgan import GFPGANer

face_enhancer = GFPGANer(
    model_path="model_cache/GFPGANv1.4.pth",
    upscale=1,                 # IMPORTANT: already upscaled by SPAN
    arch="clean",
    channel_multiplier=2,
    bg_upsampler=None,
    device=device
)

upscaled_np = np.array(upscaled)

# GFPGAN internally detects faces
with torch.inference_mode():
    _, _, restored = face_enhancer.enhance(
        upscaled_np,
        has_aligned=False,
        only_center_face=False,
        paste_back=True,
        weight=0.5          # 0.3–0.6 recommended
    )

# Fallback if no faces were detected
final_img = restored if restored is not None else upscaled_np

Image.fromarray(final_img).save("zimage_upscaled_span_gfpgan.png")

print("Done:")
print(" - zimage_raw.png")
print(" - zimage_upscaled_span.png")
print(" - zimage_upscaled_span_gfpgan.png")
