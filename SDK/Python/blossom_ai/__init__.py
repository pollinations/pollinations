# blossom_ai/__init__.py
"""
Blossom AI — Unified AI Generation Library
"""

# Core components
from blossom_ai._version import __version__
from blossom_ai.client import BlossomClient
from blossom_ai.core.config import SessionConfig

# Error types for exception handling
from blossom_ai.core.errors import (
    BlossomError,
    RateLimitError,
    AuthenticationError,
    ValidationError,
    ConfigurationError,
    StreamError,
    EmptyResponseError,
    Blossom520Error,
    PaymentError,
    TimeoutError,
    NetworkError,
    APIError,
)

# Caching system
from blossom_ai.utils.cache import (
    CacheManager,
    CacheConfig,
    CacheBackend,
    CacheStats,
)

# Logging infrastructure
from blossom_ai.utils.logging import (
    StructuredLogger,
    set_correlation_id,
    get_correlation_id,
    get_cached_logger,
)

# Security and validation utilities
from blossom_ai.utils.security import (
    validate_file_path,
    validate_image_file,
    sanitize_filename,
    ensure_safe_directory,
    generate_safe_filename,
)

# Reasoning system for prompt enhancement
from blossom_ai.utils.reasoning import (
    ReasoningEnhancer,
    ReasoningChain,
    ReasoningLevel,
    ReasoningConfig,
    create_reasoning_enhancer,
    quick_enhance,
)

# Advanced reasoning (optional dependencies)
try:
    from blossom_ai.utils.reasoning import (
        SelfCorrectingEnhancer,
        CorrectionConfig,
        ConsensusReasoning,
        ConsensusStrategy,
        ConsensusConfig,
        create_self_correcting_enhancer,
        create_consensus_reasoning,
    )
    _ADVANCED_REASONING_AVAILABLE = True
except ImportError:
    _ADVANCED_REASONING_AVAILABLE = False

# Sugar Layer - ИМПОРТ В КОНЦЕ ФАЙЛА
try:
    from blossom_ai.utils.sugar_layer.simple import ai
except ImportError:
    ai = None  # Для избежания ошибки импорта

__all__ = [
    # Core
    "BlossomClient",
    "SessionConfig",
    "__version__",

    # Errors
    "BlossomError",
    "ValidationError",
    "ConfigurationError",
    "AuthenticationError",
    "RateLimitError",
    "StreamError",
    "EmptyResponseError",
    "Blossom520Error",
    "PaymentError",
    "TimeoutError",
    "NetworkError",
    "APIError",

    # Cache
    "CacheManager",
    "CacheConfig",
    "CacheBackend",
    "CacheStats",

    # Logging
    "StructuredLogger",
    "set_correlation_id",
    "get_correlation_id",
    "get_cached_logger",

    # Security
    "validate_file_path",
    "validate_image_file",
    "sanitize_filename",
    "ensure_safe_directory",
    "generate_safe_filename",

    # Reasoning (base)
    "ReasoningEnhancer",
    "ReasoningChain",
    "ReasoningLevel",
    "ReasoningConfig",
    "create_reasoning_enhancer",
    "quick_enhance",

    # Sugar Layer API
    "ai",
]

# Conditionally add advanced reasoning to public API
if _ADVANCED_REASONING_AVAILABLE:
    __all__.extend([
        "SelfCorrectingEnhancer",
        "CorrectionConfig",
        "ConsensusReasoning",
        "ConsensusStrategy",
        "ConsensusConfig",
        "create_self_correcting_enhancer",
        "create_consensus_reasoning",
    ])

# Version string for compatibility
__version__: str = __version__