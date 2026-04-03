# RunPod Serverless - Z-Image Turbo with SPAN 2x upscaler
#
# Build:
#   docker build --platform linux/amd64 -t pollinations/runpod-zimage:v1.0.1 .

FROM nvidia/cuda:12.8.0-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y python3 python3-pip python3-venv curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# PyTorch with CUDA 12.8 (supports Blackwell/RTX 5090)
RUN pip install --no-cache-dir torch==2.11.0 torchvision --index-url https://download.pytorch.org/whl/cu128

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY handler.py .
RUN mkdir -p /app/model_cache

CMD ["python", "handler.py"]
