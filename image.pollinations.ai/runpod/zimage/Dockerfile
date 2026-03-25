# RunPod Serverless - Z-Image Turbo with SPAN 2x upscaler
#
# Build:
#   docker build --platform linux/amd64 -t pollinations/runpod-zimage:v1.0.0 .

FROM nvidia/cuda:12.4.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y --no-install-recommends \
    python3.12 \
    python3.12-venv \
    python3.12-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.12 1 && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1

ENV PATH=/usr/local/cuda-12.4/bin:$PATH
ENV CUDA_HOME=/usr/local/cuda-12.4
ENV LD_LIBRARY_PATH=/usr/local/cuda-12.4/lib64:$LD_LIBRARY_PATH
ENV CUDA_VISIBLE_DEVICES=0

WORKDIR /app
RUN python3.12 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

RUN pip install --upgrade pip setuptools wheel
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu124

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir wheel ninja && \
    pip install --no-cache-dir https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/flash_attn-2.7.4.post1+cu12torch2.6cxx11abiFALSE-cp312-cp312-linux_x86_64.whl 2>/dev/null || true

COPY handler.py .
RUN mkdir -p /app/model_cache

CMD ["python", "handler.py"]
