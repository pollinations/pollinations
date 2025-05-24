import modal
import torch
import requests
import numpy as np
from PIL import Image
from io import BytesIO
from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer

# Define the Modal function
stub = modal.Stub("image-upscaler")

# Create a GPU-backed container for execution
@stub.function(image=modal.Image.debian_slim().pip_install(["torch", "numpy", "pillow", "requests", "basicsr", "realesrgan"]),
               gpu="A10G")  
               # Use a GPU instance (e.g., A10G or T4 anything according to need pollinations)
def upscale_image(image_bytes: bytes, upscale_value: int = 4) -> bytes:
    """Upscales an image using Real-ESRGAN inside a serverless Modal function."""
    
    # Load the model (this happens inside the Modal function)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model_path = "/real-esrgan/RealESRGAN_x4plus.pth"  # Ensure model is included in container
    model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
    
    state_dict = torch.load(model_path, map_location=device)['params_ema']
    model.load_state_dict(state_dict, strict=False)
    model = model.to(device)
    
    upsampler = RealESRGANer(
        scale=upscale_value,
        model_path=model_path,
        model=model,
        tile=512,
        tile_pad=10,
        pre_pad=10,
        half=True,
        device=device
    )

    # Convert bytes to PIL image
    img = Image.open(BytesIO(image_bytes)).convert("RGB")
    img = np.array(img, dtype=np.uint8)

    # Run upscaling
    output, _ = upsampler.enhance(img, outscale=upscale_value)
    
    # Convert back to bytes
    output_img = Image.fromarray(output)
    img_byte_arr = BytesIO()
    output_img.save(img_byte_arr, format="PNG")

    return img_byte_arr.getvalue()  # Return upscaled image as bytes


# Web API function to receive images
@stub.webhook()
def upscale_request(image_url: str = None, upscale_value: int = 4):
    """Handles API requests for upscaling."""
    
    if not image_url:
        return {"error": "Missing 'image_url' parameter"}, 400
    
    try:
        response = requests.get(image_url, timeout=5)
        if response.status_code != 200:
            return {"error": "Failed to fetch image from URL"}, 400

        image_bytes = response.content  # Read image as bytes
        upscaled_image_bytes = upscale_image.call(image_bytes, upscale_value)

        # Convert to base64 or upload to storage (CDN)
        return {"message": "Upscaling complete!", "image_bytes": upscaled_image_bytes}

    except Exception as e:
        return {"error": str(e)}, 500
