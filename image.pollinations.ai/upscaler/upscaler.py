import torch
import numpy as np
from PIL import Image
from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer
import os
import time

# Device selection (GPU if available)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device}")

# Load Model
model_path = r"weights/RealESRGAN_x4plus.pth"
state_dict = torch.load(model_path, map_location=device)['params_ema']

model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
model.load_state_dict(state_dict, strict=False)
model = model.to(device)

# Real-ESRGAN Inference
upsampler = RealESRGANer(
    scale=4,
    model_path=model_path,
    model=model,
    tile=512,
    tile_pad=10,
    pre_pad=10,
    half=True,
    device=device
)

def upscale_image(image):
    img_np = np.array(image, dtype=np.uint8)
    output, _ = upsampler.enhance(img_np, outscale=4)

    # Save output
    output_img = Image.fromarray(output)
    output_path = f"uploads/upscaled_{int(time.time())}.png"
    output_img.save(output_path)

    return output_path
