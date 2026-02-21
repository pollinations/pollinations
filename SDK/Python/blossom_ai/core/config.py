# blossom_ai/core/config.py
"""
Configuration with unified API endpoints and HTTP pool settings.
All URLs and settings are defined here and imported by other modules.
Auto-detects rate limits based on API key type.
"""

import os
from typing import Optional, NamedTuple
from dataclasses import dataclass, field

from blossom_ai._version import __version__


class Endpoints(NamedTuple):
    """API endpoints for Pollinations.AI"""

    # Base URL for new API
    BASE: str = "https://gen.pollinations.ai"

    # Text generation endpoints (OpenAI-compatible)
    TEXT_CHAT: str = f"{BASE}/v1/chat/completions"
    TEXT_MODELS: str = f"{BASE}/v1/models"
    TEXT_SIMPLE: str = f"{BASE}/text"  # GET endpoint (not used in SDK)

    # Image generation endpoints
    IMAGE_GENERATE: str = f"{BASE}/image"
    IMAGE_MODELS: str = f"{BASE}/image/models"

    # Audio is generated via TEXT_CHAT endpoint with audio parameters
    # No separate endpoint needed.


ENDPOINTS = Endpoints()


@dataclass(frozen=True)
class SugarLayerConfig:
    """Configuration for sugar layer defaults (immutable)."""
    default_image_model: str = "flux"
    default_image_width: int = 1024
    default_image_height: int = 1024
    default_image_quality: str = "medium"
    default_text_model: str = "openai"


@dataclass
class SessionConfig:
    """
    Unified session configuration with HTTP pool settings.
    Auto-detects rate limits based on API key type.
    """

    # Auth & basic settings
    api_key: Optional[str] = field(default=None)
    timeout: float = field(default=30.0)
    max_retries: int = field(default=3)
    rate_limit_per_minute: int = field(default=60)  # Auto-detected in __post_init__
    cache_ttl: int = field(default=3600)
    base_url: Optional[str] = field(default=None)  # Deprecated, kept for compatibility

    # HTTP Pool settings
    sync_pool_maxsize: int = field(default=50)
    sync_pool_connections: int = field(default=20)
    sync_pool_block: bool = field(default=False)
    async_limit_total: int = field(default=100)
    async_limit_per_host: int = field(default=30)
    async_ttl_dns_cache: int = field(default=300)
    async_timeout_connect: int = field(default=30)
    async_timeout_sock_read: int = field(default=30)
    user_agent: str = field(default_factory=lambda: f"blossom-ai/{__version__}")
    ssl: bool = field(default=True)

    # Cache settings
    cache_enabled: bool = field(default=True)
    cache_backend: str = field(default="hybrid")
    cache_max_memory: int = field(default=100)
    cache_max_disk: int = field(default=1000)

    sugar_config: SugarLayerConfig = field(default_factory=SugarLayerConfig)

    def __post_init__(self) -> None:
        """Validate configuration and auto-detect rate limits."""
        if self.timeout <= 0:
            raise ValueError("timeout must be positive")
        if self.max_retries < 0:
            raise ValueError("max_retries cannot be negative")
        if self.rate_limit_per_minute <= 0:
            raise ValueError("rate_limit_per_minute must be positive")
        if self.rate_limit_per_minute > 10000:  # Increased for sk_ keys
            raise ValueError("rate_limit_per_minute cannot exceed 10000")

        # Validate pool settings
        if self.sync_pool_maxsize <= 0 or self.sync_pool_connections <= 0:
            raise ValueError("Pool size settings must be positive")
        if self.async_limit_total <= 0 or self.async_limit_per_host <= 0:
            raise ValueError("Async limit settings must be positive")
        if self.async_timeout_connect <= 0 or self.async_timeout_sock_read <= 0:
            raise ValueError("Timeout settings must be positive")

        # Validate cache settings
        if self.cache_ttl < 0:
            raise ValueError("cache_ttl must be non-negative")
        if self.cache_max_memory <= 0:
            raise ValueError("cache_max_memory must be positive")
        if self.cache_max_disk <= 0:
            raise ValueError("cache_max_disk must be positive")

        is_default_rate = (self.rate_limit_per_minute == 60 and
                          not os.getenv("POLLINATIONS_RATE_LIMIT"))

        if is_default_rate and self.api_key:
            self._detect_rate_limits()

    def _detect_rate_limits(self) -> None:
        """Auto-detect rate limits based on API key type."""
        if not self.api_key:
            # No key provided - use publishable limits (conservative)
            self.rate_limit_per_minute = 60
            return

        key = self.api_key

        # Check for secret key (sk_ anywhere in key)
        if "sk_" in key:
            # Secret key - no practical limits
            self.rate_limit_per_minute = 100000  # Very high for production
            return

        # Check for publishable key (pk_ anywhere in key) or unknown key type
        if "pk_" in key:
            # Publishable key - strict limits from API docs
            # 3 burst capacity, 1 request per 15 seconds refill
            self.rate_limit_per_minute = 4  # Conservative default
            return

        # Unknown key format - keep current value (don't override 60)
        pass

    @property
    def __version__(self) -> str:
        """Backward compatibility property for version."""
        return __version__

    @classmethod
    def from_env(cls) -> "SessionConfig":
        """Create configuration from environment variables."""
        return cls(
            api_key=os.getenv("POLLINATIONS_API_KEY"),
            timeout=float(os.getenv("POLLINATIONS_TIMEOUT", "30.0")),
            max_retries=int(os.getenv("POLLINATIONS_MAX_RETRIES", "3")),
            rate_limit_per_minute=int(os.getenv("POLLINATIONS_RATE_LIMIT", "60")),
            cache_ttl=int(os.getenv("BLOSSOM_AI_CACHE_TTL", "3600")),
            cache_enabled=os.getenv("BLOSSOM_AI_CACHE_ENABLED", "true").lower() == "true",
            cache_backend=os.getenv("BLOSSOM_AI_CACHE_BACKEND", "hybrid"),
            cache_max_memory=int(os.getenv("BLOSSOM_AI_CACHE_MAX_MEMORY", "100")),
            cache_max_disk=int(os.getenv("BLOSSOM_AI_CACHE_MAX_DISK", "1000")),
            # HTTP pool settings
            sync_pool_maxsize=int(os.getenv("BLOSSOM_AI_SYNC_POOL_MAXSIZE", "50")),
            sync_pool_connections=int(os.getenv("BLOSSOM_AI_SYNC_POOL_CONNECTIONS", "20")),
            sync_pool_block=os.getenv("BLOSSOM_AI_SYNC_POOL_BLOCK", "false").lower() == "true",
            async_limit_total=int(os.getenv("BLOSSOM_AI_ASYNC_LIMIT_TOTAL", "100")),
            async_limit_per_host=int(os.getenv("BLOSSOM_AI_ASYNC_LIMIT_PER_HOST", "30")),
            async_ttl_dns_cache=int(os.getenv("BLOSSOM_AI_ASYNC_TTL_DNS_CACHE", "300")),
            async_timeout_connect=int(os.getenv("BLOSSOM_AI_ASYNC_TIMEOUT_CONNECT", "30")),
            async_timeout_sock_read=int(os.getenv("BLOSSOM_AI_ASYNC_TIMEOUT_SOCK_READ", "30")),
            ssl=os.getenv("BLOSSOM_AI_SSL_ENABLED", "true").lower() == "true",
            user_agent=os.getenv("BLOSSOM_AI_USER_AGENT", f"blossom-ai/{__version__}"),
        )