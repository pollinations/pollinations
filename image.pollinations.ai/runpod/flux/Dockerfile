# RunPod Serverless - Flux Schnell with Nunchaku FP4
#
# Build:
#   docker build --platform linux/amd64 -t elliotetag/runpod-flux:v1.0.3 .
#
# Uses CUDA 12.4 for broad RunPod driver compatibility (driver >= 550.x).
# Nunchaku is compiled from source for SM 8.9 (RTX 4090).

FROM nvidia/cuda:12.4.1-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv python3-dev \
    git curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"
RUN pip install --upgrade pip

# PyTorch with CUDA 12.4
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu124

# Python deps
RUN pip install --no-cache-dir diffusers transformers accelerate safetensors sentencepiece protobuf huggingface_hub runpod Pillow

# Build nunchaku from source for SM 8.9 (RTX 4090)
ENV TORCH_CUDA_ARCH_LIST="8.9"
ENV NUNCHAKU_INSTALL_SM="89"
RUN pip install --no-cache-dir ninja wheel setuptools && \
    git clone --recursive https://github.com/mit-han-lab/nunchaku.git /app/nunchaku && \
    cd /app/nunchaku && \
    sed -i 's/sm_targets = get_sm_targets()/sm_targets = ["89"]/' setup.py && \
    python setup.py install

COPY handler.py .
RUN mkdir -p /app/model_cache

CMD ["python", "handler.py"]
