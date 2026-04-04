FROM nvidia/cuda:12.4.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV HF_HUB_CACHE=/workspace/hf-cache
ENV HF_XET_HIGH_PERFORMANCE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-venv python3.11-dev python3-pip \
    git libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3.11 /usr/local/bin/python && \
    ln -sf /usr/bin/python3.11 /usr/local/bin/python3

COPY requirements.txt /requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip && \
    python -m pip install --no-cache-dir -r /requirements.txt

COPY handler.py /handler.py

CMD ["python", "-u", "/handler.py"]
