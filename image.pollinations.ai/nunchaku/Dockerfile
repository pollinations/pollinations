# Flux Schnell Server with Nunchaku Quantization
# 
# Build for RTX 4090 (SM 8.9):
#   docker build -t flux-schnell-nunchaku .
#
# Run:
#   docker run --gpus all -p 8000:8000 -e HF_TOKEN=your_token flux-schnell-nunchaku

FROM nvidia/cuda:12.8.0-devel-ubuntu24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.12 \
    python3.12-venv \
    python3.12-dev \
    python3-pip \
    git \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set up Python alternatives
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.12 1 && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1

# Set CUDA environment variables
ENV PATH=/usr/local/cuda-12.8/bin:$PATH
ENV CUDA_HOME=/usr/local/cuda-12.8
ENV LD_LIBRARY_PATH=/usr/local/cuda-12.8/lib64:$LD_LIBRARY_PATH

# Create app directory
WORKDIR /app

# Create and activate virtual environment
RUN python3.12 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Upgrade pip
RUN pip install --upgrade pip

# Install PyTorch with CUDA 12.8 support
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128

# Copy and install Python requirements
COPY requirements.txt .
RUN pip install -r requirements.txt

# Clone and build nunchaku from source for RTX 4090 (SM 8.9)
# This takes 10-15 minutes during build
# Force SM targets since Docker build doesn't have GPU access
ENV TORCH_CUDA_ARCH_LIST="8.9"
ENV NUNCHAKU_INSTALL_SM="89"
RUN git clone --recursive https://github.com/mit-han-lab/nunchaku.git /app/nunchaku && \
    cd /app/nunchaku && \
    pip install ninja && \
    sed -i 's/sm_targets = get_sm_targets()/sm_targets = ["89"]/' setup.py && \
    pip install --no-build-isolation -e .

# Copy application code
COPY server.py .
COPY safety_checker/ ./safety_checker/

# Expose port
EXPOSE 8765

# Environment variables (can be overridden at runtime)
ENV PORT=8765
ENV CUDA_VISIBLE_DEVICES=0

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:${PORT}/docs || exit 1

# Run the server
CMD ["python", "server.py"]
