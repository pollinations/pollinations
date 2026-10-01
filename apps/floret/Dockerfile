FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching.
COPY pyproject.toml README.md* ./
COPY src ./src
RUN pip install --no-cache-dir .

# Non-root user; /workspace holds fallback file outputs served by the API.
RUN useradd -m -u 10001 polli \
    && mkdir -p /workspace \
    && chown -R polli:polli /workspace /app
USER polli

ENV PYTHONUNBUFFERED=1 \
    POLLI_TEMP_DIR=/workspace \
    OPENAI_BASE_URL=https://gen.pollinations.ai
# Hosted credentials arrive per request and are never baked into the image.

EXPOSE 8000
CMD ["uvicorn", "floret.api:app", "--host", "0.0.0.0", "--port", "8000"]
