"""Polly API - OpenAI-compatible endpoint for Pollinations AI with tool calling."""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from polly_core.config import config
from polly_core.client import PollyClient
from polly_core.tools import init_registry, register_all_handlers, cleanup
from app.api import router, set_client


def setup_logging():
    """Configure structured logging."""
    level = getattr(logging, config.log_level.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )
    # Quiet noisy loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("aiohttp").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger = logging.getLogger(__name__)

    # Validate config
    if not config.validate():
        logger.error("Configuration validation failed")
        sys.exit(1)

    # Initialize tool registry (GitHub App auth, etc.)
    await init_registry()

    # Create PollyClient and register tool handlers
    client = PollyClient(config)
    register_all_handlers(client)
    set_client(client)

    logger.info(f"Polly API ready on {config.host}:{config.port}")

    yield

    # Shutdown
    logger.info("Shutting down...")
    await client.close()
    await cleanup()


setup_logging()

app = FastAPI(
    title="Polly API",
    description="OpenAI-compatible API for Pollinations AI with GitHub, search, and web tools",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — no credentials with wildcard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes
app.include_router(router)


@app.get("/")
async def root():
    """Service info."""
    return {
        "service": "polly-api",
        "version": "1.0.0",
        "endpoints": {
            "chat": "/v1/chat/completions",
            "models": "/v1/models",
            "health": "/health",
        },
    }


@app.get("/health")
async def health():
    """Health check."""
    return {"status": "ok", "model": "polly"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=config.host,
        port=config.port,
        log_level=config.log_level.lower(),
        reload=False,
    )
