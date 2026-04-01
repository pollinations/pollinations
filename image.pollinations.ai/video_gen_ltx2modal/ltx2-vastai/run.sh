#!/bin/bash
# Run LTX-2 server on GPU 0
# Usage: screen -dmS ltx2 bash run.sh

export CUDA_VISIBLE_DEVICES=0
export PORT=8765
export PUBLIC_IP="${PUBLIC_IP:-114.32.64.6}"
export PUBLIC_PORT="${PUBLIC_PORT:-}"
export SERVICE_TYPE=ltx2
export REGISTER_URL="${REGISTER_URL:-http://ec2-3-80-56-235.compute-1.amazonaws.com:16384/register}"
export PLN_IMAGE_BACKEND_TOKEN="${PLN_IMAGE_BACKEND_TOKEN:?Set PLN_IMAGE_BACKEND_TOKEN env var}"
export COMFYUI_ROOT="/root/ltx2/ComfyUI"
export WORKFLOW_PATH="/root/ltx2/workflow.json"

source /root/ltx2/venv/bin/activate
cd /root/ltx2
python server.py 2>&1 | tee /tmp/ltx2.log
