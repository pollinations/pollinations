FROM nvidia/cuda:12.4.0-devel-ubuntu22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHON_VERSION=3.11

# Install system dependencies
RUN apt-get update && apt-get install -y \
    software-properties-common \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y \
    python${PYTHON_VERSION} \
    python3-pip \
    python3.11-dev \
    python3-setuptools \
    python3-pkg-resources \
    libgl1-mesa-glx \
    libglib2.0-0 \
    git \
    ninja-build \
    gcc-11 \
    g++-11 \
    && rm -rf /var/lib/apt/lists/*

# Set gcc/g++ 11 as default
RUN update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-11 110 \
    --slave /usr/bin/g++ g++ /usr/bin/g++-11 \
    --slave /usr/bin/gcov gcov /usr/bin/gcov-11

# Set Python 3.11 as default
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python${PYTHON_VERSION} 1 \
    && update-alternatives --set python3 /usr/bin/python${PYTHON_VERSION} \
    && ln -s /usr/bin/python3 /usr/bin/python

# Upgrade pip and install basic packages
RUN python3 -m pip install --no-cache-dir --upgrade pip setuptools wheel

# Install numpy first
RUN pip3 install --no-cache-dir numpy

# Install PyTorch
RUN pip3 install --no-cache-dir \
    torch==2.4.1 \
    torchvision==0.19.1 \
    torchaudio==2.4.1 \
    --index-url https://download.pytorch.org/whl/cu121

# Install other dependencies
RUN pip3 install --no-cache-dir \
    diffusers \
    ninja \
    transformers \
    accelerate \
    sentencepiece \
    protobuf \
    huggingface_hub \
    peft \
    opencv-python \
    einops \
    gradio \
    spaces \
    GPUtil \
    fastapi \
    uvicorn \
    pydantic

# Clone and install nunchaku
# Patch setup.py to hardcode SM 89 target since GPU detection doesn't work during Docker build
WORKDIR /app
ENV TORCH_CUDA_ARCH_LIST="8.9"
RUN git clone https://github.com/mit-han-lab/nunchaku.git \
    && cd nunchaku \
    && git submodule init \
    && git submodule update \
    && sed -i 's/sm_targets = get_sm_targets()/sm_targets = ["89"]/' setup.py \
    && python3 -m pip install -e .

# Install hf_transfer separately to keep cache layers
RUN pip3 install --no-cache-dir hf_transfer

# Install aiohttp for async HTTP requests
RUN pip3 install --no-cache-dir aiohttp

# Copy server code and safety checker
COPY server.py .
COPY safety_checker ./safety_checker

# Expose the port
EXPOSE 8000

# Run the server
CMD ["python3", "-m", "server"]
