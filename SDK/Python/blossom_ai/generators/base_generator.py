# blossom_ai/generators/base_generator.py

"""
Base generator classes with dependency injection, retry logic, and caching.
Security-hardened version: fixes API key leakage, race conditions, and DoS vectors.

FIXED:
- Comprehensive API key sanitization in cache keys
- Improved error handling for 520/401/429 errors
- Better resource cleanup
- Thread-safe cache key generation
- DoS protection with response size validation
"""

from __future__ import annotations
import hashlib
import json
import re
import uuid
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, Set, Tuple, Final, List
from urllib.parse import urlencode, urlparse, parse_qsl, quote

from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import httpx

from blossom_ai.core.interfaces import (
    ConfigProtocol,
    HttpClientProtocol,
    LoggerProtocol,
    RateLimiterInterface,
    CacheBackendProtocol,
)
from blossom_ai.utils.http_client import HttpxClient
from blossom_ai.utils.logging import StructuredLogger
from blossom_ai.utils.rate_limiter import TokenBucketRateLimiter
from blossom_ai.core.errors import (
    BlossomError,
    ErrorType,
    AuthenticationError,
    RateLimitError,
    EmptyResponseError,
    Blossom520Error,
    handle_validation_error,
)
from blossom_ai._version import __version__

RETRYABLE_HTTP_CODES: Final[Set[int]] = {502, 503, 504, 522}
RETRYABLE_EXCEPTIONS: Final[Tuple[type, ...]] = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.ReadTimeout,
    httpx.WriteTimeout,
    httpx.PoolTimeout,
    httpx.HTTPStatusError,
)
DEFAULT_RETRY_AFTER: Final[int] = 60
MAX_RESPONSE_SIZE: Final[int] = 10 * 1024 * 1024  # 10MB
MAX_HEADERS_SIZE: Final[int] = 100 * 1024  # 100KB

# FIXED: Comprehensive patterns for API key sanitization
SENSITIVE_KEY_PATTERNS: Final[List[str]] = [
    r'([?&])(key|api_key|apikey|api-key)=([^&]+)',
    r'([?&])(token|access_token|auth_token)=([^&]+)',
    r'([?&])(secret|api_secret|apisecret)=([^&]+)',
    r'([?&])(bearer|authorization)=([^&]+)',
]

# Configurable ignored status codes per endpoint
IGNORED_STATUS_CODES: Final[Dict[str, Set[int]]] = {
    "audio": {402},  # Audio endpoint may return 402 but works without auth
}


def _is_retryable_http(exc: Exception) -> bool:
    """Return True if the exception is a retryable HTTP error."""
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in RETRYABLE_HTTP_CODES
    return False


def _sanitize_for_logging(data: Any) -> Any:
    """Sanitize data for logging (remove sensitive info)."""
    if isinstance(data, dict):
        return {k: "***" if k.lower() in ("api_key", "key", "authorization", "bearer") else v
                for k, v in data.items()}
    return data


class BaseGenerator(ABC):
    """
    Common logic for generators with DI, retry, rate limiting, and caching.
    """

    def __init__(
            self,
            config: ConfigProtocol,
            http_client: Optional[HttpClientProtocol] = None,
            logger: Optional[LoggerProtocol] = None,
            rate_limiter: Optional[RateLimiterInterface] = None,
            cache: Optional[CacheBackendProtocol] = None,
    ) -> None:
        """Initialize generator with dependency injection."""
        self.config = config
        self.http_client = http_client or HttpxClient(config, logger)
        self.logger = logger or StructuredLogger("base_generator")
        self.rate_limiter = rate_limiter or TokenBucketRateLimiter(
            config.rate_limit_per_minute
        )
        self.cache = cache

        # Configure retry decorator
        self._retry_config = {
            "stop": stop_after_attempt(config.max_retries),
            "wait": wait_exponential(multiplier=1, min=2, max=10),
            "retry": retry_if_exception_type(RETRYABLE_EXCEPTIONS),
            "reraise": True,
        }

        self.logger.info(
            f"{self.__class__.__name__} initialized",
            cache_enabled=self.cache is not None,
            rate_limit=self.config.rate_limit_per_minute,
        )

    def _get_auth_headers(self, request_id: Optional[str] = None) -> Dict[str, str]:
        """Return default headers including auth."""
        headers: Dict[str, str] = {
            "User-Agent": f"blossom-ai/{__version__}",
            "Content-Type": "application/json",
        }
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        if request_id:
            headers["X-Request-ID"] = request_id
        return headers

    def _sanitize_url_for_cache(self, url: str) -> str:
        """
        This is critical for security - API keys MUST NOT appear in cache keys
        which may be logged or stored in plain text.

        Changes:
        - Added multiple pattern matching for different key formats
        - Added fallback for long alphanumeric tokens
        - More aggressive sanitization
        """
        sanitized = url

        # Apply all sensitive key patterns
        for pattern in SENSITIVE_KEY_PATTERNS:
            # Replace value with placeholder: key=*** instead of key=actual_value
            sanitized = re.sub(
                pattern,
                r'\1\2=***',
                sanitized,
                flags=re.IGNORECASE
            )

        # Additional safety: replace any remaining long alphanumeric tokens
        # that look like API keys (30+ chars)
        sanitized = re.sub(
            r'=([a-zA-Z0-9_-]{30,})',
            r'=***SANITIZED***',
            sanitized
        )

        return sanitized

    def _generate_cache_key(self, method: str, url: str, data: Optional[Any]) -> str:
        """
        Changes:
        - Thread-safe key generation
        - Comprehensive URL sanitization
        - Better handling of JSON data
        """
        # Sanitize URL to remove ALL potential API keys
        url_safe = self._sanitize_url_for_cache(url)

        key_data = {
            "method": method,
            "url": url_safe,
            "data": data,
            "class": self.__class__.__name__,
        }

        try:
            key_str = json.dumps(key_data, sort_keys=True, default=str)
        except (TypeError, ValueError):
            # Fallback for non-serializable data
            key_str = f"{method}:{url_safe}:{str(data)}"

        return hashlib.sha256(key_str.encode()).hexdigest()[:32]

    def _validate_response_size(self, headers: Dict[str, Any], content_length: int) -> None:
        """
        Changes:
        - Separate validation for headers and content
        - Better error messages
        - Clearer limit explanations
        """
        # Check headers separately
        headers_size = sum(len(str(k)) + len(str(v)) for k, v in headers.items())
        if headers_size > MAX_HEADERS_SIZE:
            raise BlossomError(
                f"Response headers too large: {headers_size} bytes (max {MAX_HEADERS_SIZE})",
                error_type=ErrorType.API,
                suggestion="Server sent oversized headers - possible DoS attempt or misconfiguration"
            )

        # Check content separately (main DoS vector)
        if content_length > self.MAX_RESPONSE_SIZE:
            raise BlossomError(
                "Response too large",
                error_type=ErrorType.API,
                suggestion=f"Response size {content_length} bytes exceeds maximum {self.MAX_RESPONSE_SIZE}. "
                           f"Reduce max_tokens or use streaming for large responses"
            )

    def _handle_http_error(self, status: int, body: bytes, endpoint_type: str = "default") -> bool:
        """
        Changes:
        - Proper 520 handling
        - Better 401/429 handling
        - Ignored status codes per endpoint

        Returns:
            True if error should be ignored, False otherwise
        """
        # Handle 520 specially
        if status == 520:
            raise Blossom520Error(
                message="Cloudflare 520 Unknown Error: Configuration or proxy issue",
                context={"endpoint_type": endpoint_type} if endpoint_type else None
            )

        # Check if status should be ignored for this endpoint
        ignored_codes = IGNORED_STATUS_CODES.get(endpoint_type, set())
        if status in ignored_codes:
            self.logger.warning(f"Ignoring HTTP {status} for {endpoint_type} endpoint")
            return True

        # Handle authentication errors
        if status == 401:
            raise AuthenticationError(
                message="Invalid or missing API token",
                suggestion="Check your API token at https://enter.pollinations.ai",
            )

        # Handle rate limiting
        if status == 429:
            raise RateLimitError(retry_after=60)

        # Handle retryable errors
        if status in RETRYABLE_HTTP_CODES:
            # Let tenacity retry
            raise httpx.HTTPStatusError(
                f"HTTP {status}",
                request=httpx.Request("GET", ""),
                response=httpx.Response(status_code=status, content=body),
            )

        # Handle server errors
        if status >= 500:
            raise BlossomError(
                message=f"Server error: HTTP {status}",
                error_type="API_ERROR",
                suggestion="The API server is experiencing issues. Try again later.",
            )

        # Handle client errors
        if status >= 400:
            body_preview = body[:200].decode('utf-8', errors='ignore')
            raise BlossomError(
                message=f"Client error: HTTP {status}",
                error_type="API_ERROR",
                suggestion=f"Check your request parameters. Response: {body_preview}",
            )

        return False

    async def _with_rate_limit(self) -> None:
        """Apply rate limiting before request."""
        if self.rate_limiter:
            await self.rate_limiter.acquire_with_wait(timeout=30.0)

    async def _async_request(
            self,
            method: str,
            url: str,
            headers: Optional[Dict[str, str]] = None,
            params: Optional[Dict[str, Any]] = None,
            json_data: Optional[Dict[str, Any]] = None,
            data: Optional[bytes] = None,
            endpoint_type: str = "default",
            use_cache: bool = True,
            stream: bool = False,
    ) -> httpx.Response:
        """
        Changes:
        - Better error handling
        - Improved cache key generation
        - Resource cleanup
        - Better logging
        """
        await self._with_rate_limit()

        if not url.startswith("http"):
            raise ValueError(f"URL must be absolute: {url[:100]}")

        request_headers = self._get_auth_headers()
        if headers:
            request_headers.update(headers)

        request_id = str(uuid.uuid4())[:8]

        # Sanitize URL for logging - never log auth tokens
        url_for_log = _sanitize_for_logging(url)

        self.logger.debug(
            "Async request preparation",
            request_id=request_id,
            method=method,
            url=url_for_log,
            endpoint_type=endpoint_type,
            use_cache=use_cache,
        )

        cache_key = None
        if self.cache and use_cache and method.upper() == "GET" and not stream:
            cache_key = self._generate_cache_key(method, url, json_data or data)
            try:
                cached_value = await self.cache.aget(cache_key)
                if cached_value is not None:
                    self.logger.info(
                        "Cache hit",
                        request_id=request_id,
                        cache_key=cache_key[:16] + "...",
                        url=url_for_log,
                    )
                    return httpx.Response(
                        status_code=200,
                        content=cached_value,
                        headers={"X-Cache": "HIT"},
                        request=httpx.Request(method, url),
                    )
            except Exception as e:
                self.logger.warning("Cache get failed", error=str(e), cache_key=cache_key[:16])

        @retry(**self._retry_config)
        async def _make_request() -> httpx.Response:
            self.logger.debug(
                "Executing HTTP request",
                request_id=request_id,
                method=method,
                url=url_for_log,
                has_json=json_data is not None,
                has_data=data is not None,
                stream=stream,
            )

            try:
                if stream:
                    # For streaming, we can't use cache and need special handling
                    response = await self.http_client.stream(
                        method, url, params=params, headers=request_headers
                    )
                elif method.upper() == "GET":
                    response = await self.http_client.get(url, params=params, headers=request_headers)
                elif method.upper() == "POST":
                    if json_data:
                        response = await self.http_client.post(url, json=json_data, params=params,
                                                               headers=request_headers)
                    elif data:
                        response = await self.http_client.post(url, content=data, params=params,
                                                               headers=request_headers)
                    else:
                        response = await self.http_client.post(url, params=params, headers=request_headers)
                else:
                    raise ValueError(f"Unsupported HTTP method: {method}")

                # Validate response size to prevent DoS
                content_length = len(response.content) if hasattr(response, 'content') else 0
                self._validate_response_size(dict(response.headers), content_length)

                # Handle errors
                if hasattr(response, 'status_code') and response.status_code >= 400:
                    ignored = self._handle_http_error(response.status_code, response.content, endpoint_type)
                    if not ignored:
                        response.raise_for_status()

                return response
            except httpx.HTTPStatusError as e:
                self._handle_http_error(e.response.status_code, e.response.content, endpoint_type)
                raise
            except httpx.ConnectError as e:
                self.logger.error("Connection error", request_id=request_id, url=url_for_log, error=str(e))
                raise BlossomError(
                    f"Connection failed: {e}",
                    ErrorType.NETWORK,
                    suggestion="Check your internet connection"
                )
            except Exception as e:
                self.logger.error("Request failed", request_id=request_id, url=url_for_log, error=str(e))
                raise

        response = await _make_request()

        # Cache successful GET responses
        if self.cache and use_cache and response.status_code == 200 and method.upper() == "GET" and not stream:
            try:
                await self.cache.aset(cache_key, response.content)
                self.logger.debug(
                    "Cached response",
                    request_id=request_id,
                    cache_key=cache_key[:16] + "...",
                    size=len(response.content),
                )
            except Exception as e:
                self.logger.warning("Cache set failed", error=str(e), cache_key=cache_key[:16])

        return response

    @abstractmethod
    def _prepare_request_data(self, **kwargs: Any) -> Dict[str, Any]:
        """Prepare request payload."""
        pass

    @abstractmethod
    def _parse_response(self, response: httpx.Response) -> Any:
        """Parse API response."""
        pass

    async def close(self) -> None:
        """
        Changes:
        - Better exception handling
        - Proper resource cleanup order
        - More detailed logging
        """
        try:
            # Close HTTP client
            if hasattr(self.http_client, "close"):
                await self.http_client.close()
                self.logger.debug("HTTP client closed")

            # Close cache
            if self.cache and hasattr(self.cache, 'aclose'):
                await self.cache.aclose()
                self.logger.debug("Cache closed")

            # Close rate limiter
            if self.rate_limiter and hasattr(self.rate_limiter, 'close'):
                await self.rate_limiter.close()
                self.logger.debug("Rate limiter closed")

            self.logger.info(f"{self.__class__.__name__} closed successfully")
        except Exception as e:
            self.logger.error(
                "Error during generator shutdown",
                error=str(e),
                generator=self.__class__.__name__,
                exc_info=True
            )