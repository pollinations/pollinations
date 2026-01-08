"""
Abstract interfaces for dependency injection and testability.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Protocol


class ConfigProtocol(Protocol):
    """Protocol for configuration objects."""

    @property
    def api_key(self) -> Optional[str]:
        """API key for authentication."""
        ...

    @property
    def base_url(self) -> str:
        """Base API URL."""
        ...

    @property
    def timeout(self) -> float:
        """Request timeout in seconds."""
        ...

    @property
    def max_retries(self) -> int:
        """Maximum number of retry attempts."""
        ...


class CacheBackendProtocol(Protocol):
    """Protocol for cache backends."""

    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        ...

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Store value in cache."""
        ...

    async def clear(self, prefix: Optional[str] = None) -> None:
        """Clear cache entries."""
        ...

    def get_stats(self) -> Any:
        """Get cache statistics."""
        ...


class LoggerProtocol(Protocol):
    """Protocol for loggers."""

    def debug(self, message: str, **kwargs: Any) -> None:
        """Debug logging."""
        ...

    def info(self, message: str, **kwargs: Any) -> None:
        """Info logging."""
        ...

    def warning(self, message: str, **kwargs: Any) -> None:
        """Warning logging."""
        ...

    def error(self, message: str, **kwargs: Any) -> None:
        """Error logging."""
        ...


class HttpClientProtocol(Protocol):
    """Protocol for HTTP clients."""

    async def get(self, url: str, **kwargs: Any) -> Any:
        """GET request."""
        ...

    async def post(self, url: str, **kwargs: Any) -> Any:
        """POST request."""
        ...

    async def close(self) -> None:
        """Close connection."""
        ...


class ImageGeneratorInterface(ABC):
    """Abstract interface for image generators."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        size: Optional[str] = None,
        quality: Optional[str] = None,
        style: Optional[str] = None,
        **kwargs: Any
    ) -> bytes:
        """Generate image from text prompt."""
        pass


class TextGeneratorInterface(ABC):
    """Abstract interface for text generators."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        **kwargs: Any
    ) -> str:
        """Generate text from prompt."""
        pass


class RateLimiterInterface(ABC):
    """Abstract interface for rate limiters."""

    @abstractmethod
    async def acquire(self, key: str = "default") -> bool:
        """Acquire permission to execute operation."""
        pass

    @abstractmethod
    async def release(self, key: str = "default") -> None:
        """Release permission."""
        pass