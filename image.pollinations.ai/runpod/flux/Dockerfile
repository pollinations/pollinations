# RunPod Serverless - Flux Schnell with Nunchaku FP4
#
# Build:
#   docker build --platform linux/amd64 -t pollinations/runpod-flux:v1.0.0 .
#
# The nunchaku library must be compiled for the target GPU arch.
# RTX 4090 = SM 8.9. RunPod 4090 PRO uses the same chip.

FROM nvidia/cuda:12.8.0-devel-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    python3.12 \
    python3.12-venv \
    python3.12-dev \
    python3-pip \
    git \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.12 1 && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1

ENV PATH=/usr/local/cuda-12.8/bin:$PATH
ENV CUDA_HOME=/usr/local/cuda-12.8
ENV LD_LIBRARY_PATH=/usr/local/cuda-12.8/lib64:$LD_LIBRARY_PATH

WORKDIR /app
RUN python3.12 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"
RUN pip install --upgrade pip

# PyTorch with CUDA 12.8
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128

# Python deps (same as nunchaku/requirements.txt + runpod)
COPY requirements.txt .
RUN pip install -r requirements.txt

# Build nunchaku for SM 8.9 (RTX 4090 / 4090 PRO)
ENV TORCH_CUDA_ARCH_LIST="8.9"
ENV NUNCHAKU_INSTALL_SM="89"
RUN git clone --recursive https://github.com/mit-han-lab/nunchaku.git /app/nunchaku && \
    cd /app/nunchaku && \
    pip install ninja && \
    sed -i 's/sm_targets = get_sm_targets()/sm_targets = ["89"]/' setup.py && \
    pip install --no-build-isolation -e .

COPY handler.py .

CMD ["python", "handler.py"]
