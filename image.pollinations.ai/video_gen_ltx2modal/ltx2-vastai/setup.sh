#!/bin/bash
# LTX-2 Video Generation Setup for Vast.ai RTX 5090
# Deploy on GPU 0 of instance 32608960 (114.32.64.6)
#
# Usage:
#   screen -S ltx2
#   export CUDA_VISIBLE_DEVICES=0
#   bash setup.sh
#
set -e

INSTALL_DIR="/root/ltx2"
COMFYUI_ROOT="$INSTALL_DIR/ComfyUI"
MODELS_DIR="$COMFYUI_ROOT/models"
HF_TOKEN="${HF_TOKEN:?Set HF_TOKEN env var}"

echo "=== LTX-2 Setup on Vast.ai ==="
echo "CUDA_VISIBLE_DEVICES=$CUDA_VISIBLE_DEVICES"
echo "Install dir: $INSTALL_DIR"

# Step 1: Install system deps
echo ">>> Installing system dependencies..."
apt-get update -qq && apt-get install -y -qq ffmpeg git > /dev/null 2>&1

# Step 2: Create venv
echo ">>> Creating Python venv..."
python3 -m venv "$INSTALL_DIR/venv"
source "$INSTALL_DIR/venv/bin/activate"

# Step 3: Install ComfyUI via comfy-cli
echo ">>> Installing comfy-cli and ComfyUI..."
pip install -q comfy-cli==1.5.4 huggingface-hub==0.36.0 websocket-client==1.8.0 fastapi[standard]==0.115.4 uvicorn aiohttp requests
comfy --skip-prompt install --nvidia --version 0.8.1 --comfyui-home "$COMFYUI_ROOT"

# Step 4: Download models (fp4 text encoder for 32GB VRAM)
echo ">>> Downloading models..."
mkdir -p "$MODELS_DIR/checkpoints" "$MODELS_DIR/text_encoders" "$MODELS_DIR/latent_upscale_models" "$MODELS_DIR/loras"

python3 - <<'PYEOF'
import os
from huggingface_hub import hf_hub_download

cache_dir = "/root/ltx2/hf-cache"
models_dir = os.environ.get("MODELS_DIR", "/root/ltx2/ComfyUI/models")
token = os.environ.get("HF_TOKEN")

MODEL_MAP = [
    {"repo": "Lightricks/LTX-2", "filename": "ltx-2-19b-distilled-fp8.safetensors", "dest": "checkpoints/ltx-2-19b-distilled-fp8.safetensors"},
    {"repo": "Comfy-Org/ltx-2", "filename": "split_files/text_encoders/gemma_3_12B_it_fp8_scaled.safetensors", "dest": "text_encoders/gemma_3_12B_it_fp8_scaled.safetensors"},
    {"repo": "Lightricks/LTX-2", "filename": "ltx-2-spatial-upscaler-x2-1.0.safetensors", "dest": "latent_upscale_models/ltx-2-spatial-upscaler-x2-1.0.safetensors"},
]

for item in MODEL_MAP:
    print(f"  Downloading {item['repo']} / {item['filename']}...")
    cached = hf_hub_download(
        repo_id=item["repo"],
        filename=item["filename"],
        cache_dir=cache_dir,
        token=token,
    )
    target = os.path.join(models_dir, item["dest"])
    os.makedirs(os.path.dirname(target), exist_ok=True)
    if os.path.exists(target) or os.path.islink(target):
        os.unlink(target)
    os.symlink(cached, target)
    print(f"    -> {target}")

print("All models downloaded and linked.")
PYEOF

# Step 5: Copy workflow and server
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/video_ltx2_t2v_distilled_fp4.json" "$INSTALL_DIR/workflow.json"
cp "$SCRIPT_DIR/server.py" "$INSTALL_DIR/server.py"

echo ""
echo "=== Setup complete! ==="
echo ""
echo "To start the server:"
echo "  source $INSTALL_DIR/venv/bin/activate"
echo "  export CUDA_VISIBLE_DEVICES=0"
echo "  cd $INSTALL_DIR"
echo "  python server.py"
echo ""
echo "Or use the run script:"
echo "  bash $SCRIPT_DIR/run.sh"
