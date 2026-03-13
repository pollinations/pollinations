from huggingface_hub import hf_hub_download
import os
import shutil
from dotenv import load_dotenv
load_dotenv()


# ==== CONFIGURE ====
HF_TOKEN = os.getenv("HF_TOKEN")  
MODEL_DIR = "LongCat-Image"

files = [
    "config.json",
    "model_index.json",
    "scheduler/scheduler_config.json",
    "text_encoder/model-00001-of-00005.safetensors",
    "text_encoder/model-00002-of-00005.safetensors",
    "text_encoder/model-00003-of-00005.safetensors",
    "text_encoder/model-00004-of-00005.safetensors",
    "text_encoder/model-00005-of-00005.safetensors",
    "text_processor/tokenizer_config.json",
    "tokenizer/tokenizer.json",
    "tokenizer/tokenizer_config.json",
    "transformer/diffusion_pytorch_model.safetensors",
    "vae/diffusion_pytorch_model.safetensors",
]

for f in files:
    folder = os.path.join(MODEL_DIR, os.path.dirname(f))
    os.makedirs(folder, exist_ok=True)

# Download files
for f in files:
    print(f"Downloading {f}...")
    local_path = hf_hub_download(
        repo_id="meituan-longcat/LongCat-Image",
        filename=f,
        use_auth_token=HF_TOKEN
    )
    shutil.copy(local_path, os.path.join(MODEL_DIR, f))

print("All files downloaded successfully!")
