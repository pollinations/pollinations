# blossom_ai/utils/__init__.py
"""
Blossom AI Utilities
"""

from blossom_ai.utils.logging import (
    StructuredLogger,
    set_correlation_id,
    get_correlation_id
)
from blossom_ai.utils.http_client import HttpxClient
from blossom_ai.utils.rate_limiter import TokenBucketRateLimiter
from blossom_ai.utils.security import (
    validate_file_path,
    validate_image_file,
    sanitize_filename,
    ensure_safe_directory
)

# Reasoning modules
from blossom_ai.utils.reasoning import (
    ReasoningEnhancer,
    ReasoningChain,
    ReasoningLevel,
    ReasoningConfig,
    create_reasoning_enhancer,
    quick_enhance,
)

# Sugar layer - ДОБАВЛЕНО
from blossom_ai.utils.sugar_layer.simple import ai

__all__ = [
    # Logging utilities
    "StructuredLogger",
    "set_correlation_id",
    "get_correlation_id",
    # HTTP client
    "HttpxClient",
    # Rate limiting
    "TokenBucketRateLimiter",
    # Security utilities
    "validate_file_path",
    "validate_image_file",
    "sanitize_filename",
    "ensure_safe_directory",
    # Base reasoning
    "ReasoningEnhancer",
    "ReasoningChain",
    "ReasoningLevel",
    "ReasoningConfig",
    "create_reasoning_enhancer",
    "quick_enhance",
    # Sugar layer - ДОБАВЛЕНО
    "ai",
]