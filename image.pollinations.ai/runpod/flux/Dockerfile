# RunPod Serverless - Flux Schnell with Nunchaku FP4
#
# Build:
#   docker build --platform linux/amd64 -t elliotetag/runpod-flux:v1.0.3 .

FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
    software-properties-common && \
    add-apt-repository -y ppa:deadsnakes/ppa && \
    apt-get update && apt-get install -y \
    python3.12 python3.12-venv python3.12-dev curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN python3.12 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# PyTorch with CUDA 12.4 (compatible with older RunPod drivers)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu124

# Python deps
RUN pip install --no-cache-dir diffusers transformers accelerate safetensors sentencepiece protobuf huggingface_hub runpod Pillow

# Pre-built nunchaku wheel (cp312, bundles its own CUDA kernels)
RUN pip install --no-cache-dir --no-deps 'https://github.com/nunchaku-ai/nunchaku/releases/download/v1.3.0dev20260213/nunchaku-1.3.0.dev20260213%2Bcu12.8torch2.11-cp312-cp312-linux_x86_64.whl'

COPY handler.py .
RUN mkdir -p /app/model_cache

CMD ["python", "handler.py"]
