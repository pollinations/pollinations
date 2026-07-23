FROM python:3.12-slim

# ffmpeg + curl for the bash tool's media post-processing.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching.
COPY pyproject.toml README.md* ./
COPY src ./src
RUN pip install --no-cache-dir .

# Non-root user; /workspace is the bash sandbox + file output dir.
RUN useradd -m -u 10001 polli \
    && mkdir -p /workspace \
    && chown -R polli:polli /workspace /app
USER polli

ENV PYTHONUNBUFFERED=1 \
    POLLI_TEMP_DIR=/workspace \
    OPENAI_BASE_URL=https://gen.pollinations.ai
# NOTE: OPENAI_API_KEY is intentionally NOT baked in. The per-request key
# arrives via the X-Pollinations-Key / Authorization header, so a bash("env")
# call inside the sandbox cannot leak a server-wide credential.

EXPOSE 8000
CMD ["uvicorn", "polli_agent.api:app", "--host", "0.0.0.0", "--port", "8000"]
