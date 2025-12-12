import os 
import requests
UPSCALER_MODEL_PATH = "model_cache"
def download_model(model_name="RealESRGAN_x4plus.pth"):
    model_url_map = {
        "RealESRGAN_x2plus.pth": "https://github.com/Circuit-Overtime/upscale.pollinations/releases/download/1.0.0/RealESRGAN_x2plus.pth",
        "RealESRGAN_x4plus.pth": "https://github.com/Circuit-Overtime/upscale.pollinations/releases/download/1.0.0/RealESRGAN_x4plus.pth",
        "GFPGANv1.4.pth": "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth",
        "SwinIR_x2.pth" : "https://github.com/JingyunLiang/SwinIR/releases/download/v0.0/001_classicalSR_DF2K_s64w8_SwinIR-M_x2.pth",
        "SwinIR_x4.pth" : "https://github.com/JingyunLiang/SwinIR/releases/download/v0.0/001_classicalSR_DF2K_s64w8_SwinIR-M_x4.pth",
        "SwinIR_x8.pth" : "https://github.com/JingyunLiang/SwinIR/releases/download/v0.0/001_classicalSR_DF2K_s64w8_SwinIR-M_x8.pth"

    }
    
    
    if not os.path.exists(UPSCALER_MODEL_PATH):
        os.makedirs(UPSCALER_MODEL_PATH, exist_ok=True)
    model_path = os.path.join(UPSCALER_MODEL_PATH, model_name)
    if not os.path.exists(model_path):
        print(f"Downloading {model_name}...")
        url = model_url_map.get(model_name)
        if not url:
            print(f"Model {model_name} not found in available models")
            return
        response = requests.get(url, stream=True)
        response.raise_for_status()
        with open(model_path, "wb") as f:
            for chunk in response.iter_content(8192):
                f.write(chunk)
        
        print(f"Model downloaded: {UPSCALER_MODEL_PATH}/{model_name}")
if __name__ == "__main__":
    download_model("RealESRGAN_x2plus.pth")
    download_model("RealESRGAN_x4plus.pth")
    download_model("GFPGANv1.4.pth")
    # download_model("SwinIR_x2.pth")  
    # download_model("SwinIR_x4.pth")
    # download_model("SwinIR_x8.pth")