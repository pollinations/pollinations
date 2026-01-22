"""
Blossom AI Core.
Internal core modules (not part of public API).
"""

from blossom_ai.core.config import SessionConfig
from blossom_ai.core.interfaces import (
    ConfigProtocol,
    HttpClientProtocol,
    LoggerProtocol,
    RateLimiterInterface,
    ImageGeneratorInterface,
    TextGeneratorInterface,
    CacheBackendProtocol,
)
from blossom_ai.core.errors import (
    BlossomError,
    AuthenticationError,
    RateLimitError,
    ValidationError,
    ConfigurationError,
)

# Public API: only SessionConfig and core errors that developers might catch
__all__ = [
    # Configuration
    "SessionConfig",

    # Core exceptions (for error handling)
    "BlossomError",
    "ValidationError",
    "ConfigurationError",
    "AuthenticationError",
    "RateLimitError",
]