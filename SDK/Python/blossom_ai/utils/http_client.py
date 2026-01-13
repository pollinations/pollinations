# blossom_ai/utils/http_client.py

"""
Unified HTTP client based on httpx (async-only).
Security-hardened version: fixes DoS vectors, logging sanitization, and resource leaks.
"""

import asyncio
import json
import re
from typing import Any, Dict, Optional
from contextlib import asynccontextmanager

import httpx
from blossom_ai.core.interfaces import HttpClientProtocol, ConfigProtocol, LoggerProtocol
from blossom_ai.utils.logging import StructuredLogger
from blossom_ai._version import __version__

# Maximum URL length (prevents DoS via huge URLs)
MAX_URL_LENGTH = 2048

# Maximum header size (prevents header-based DoS)
MAX_HEADER_SIZE = 100 * 1024  # 100KB

# Dangerous URL schemes to block
DANGEROUS_SCHEMES = {
    'javascript:', 'data:', 'file:', 'vbscript:', 'about:', 'chrome:',
    'edge:', 'opera:', 'view-source:', 'filesystem:',
}

# Sensitive patterns for sanitization
SENSITIVE_PATTERNS = [
    r'(authorization:\s*Bearer\s+)[\w-]+',
    r'(Bearer\s+)[\w-]+',
    r'([Aa]pi[-_]?[Kk]ey\s*[=:]\s*)[\w-]+',
    r'([Xx]-[Aa]pi-[Kk]ey:\s*)[\w-]+',
    r'([Tt]oken\s*[=:]\s*)[\w-]+',
    r'(key\s*[=:]\s*)[\w-]+',
]


def _sanitize_for_logging(data: Any, sensitive_patterns: Optional[list] = None) -> Any:

    if sensitive_patterns is None:
        sensitive_patterns = SENSITIVE_PATTERNS

    # None handling
    if data is None:
        return None

    # String handling
    if isinstance(data, str):
        if len(data) > MAX_URL_LENGTH:
            data = data[:MAX_URL_LENGTH] + f"...[truncated {len(data) - MAX_URL_LENGTH} chars]"

        for pattern in sensitive_patterns:
            try:
                data = re.sub(pattern, r'\1***REDACTED***', data, flags=re.IGNORECASE)
            except re.error:
                pass
        return data

    # Dict handling
    if isinstance(data, dict):
        result = {}
        for k, v in data.items():
            if isinstance(k, str) and any(
                    sensitive in k.lower() for sensitive in ['api_key', 'authorization', 'bearer', 'key', 'token']):
                result[k] = '***REDACTED***'
            else:
                result[k] = _sanitize_for_logging(v, sensitive_patterns)
        return result

    # List/iterable handling
    if isinstance(data, (list, tuple)):
        return [_sanitize_for_logging(item, sensitive_patterns) for item in data]

    # Other types - return as-is
    return data


def _validate_headers_size(headers: Dict[str, str]) -> None:
    """Validate total headers size."""
    total_size = sum(len(str(k)) + len(str(v)) for k, v in headers.items())
    if total_size > MAX_HEADER_SIZE:
        raise ValueError(f"Headers too large: {total_size} bytes (max {MAX_HEADER_SIZE})")


class HttpxClient(HttpClientProtocol):


    def __init__(
            self,
            config: ConfigProtocol,
            logger: Optional[LoggerProtocol] = None
    ) -> None:
        self.config = config
        self.logger = logger or StructuredLogger("http_client")

        # Validate headers size on init
        _validate_headers_size(self._get_default_headers())

        # Configure connection limits
        limits = httpx.Limits(
            max_keepalive_connections=min(20, config.async_limit_per_host),
            max_connections=config.async_limit_total,
            keepalive_expiry=30.0
        )

        # Configure timeout
        timeout = httpx.Timeout(
            connect=config.async_timeout_connect,
            read=config.timeout,
            write=config.timeout,
            pool=30.0
        )

        self._async_client = httpx.AsyncClient(
            timeout=timeout,
            limits=limits,
            headers=self._get_default_headers(),
            follow_redirects=False,
            trust_env=False
        )

    def _get_default_headers(self) -> Dict[str, str]:
        """Get default headers for all requests."""
        headers = {
            "User-Agent": f"blossom-ai/{__version__}",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
        }

        if self.config.api_key:
            key = self.config.api_key.strip()
            if not key:
                raise ValueError("API key cannot be empty")

            import os
            if len(key) < 8 and not os.getenv("BLOSSOM_AI_TEST_MODE"):
                raise ValueError("Invalid API key format")

            headers["Authorization"] = f"Bearer {key}"

        return headers

    def _validate_url(self, url: str) -> str:

        url = url.strip()

        if not url:
            raise ValueError("URL cannot be empty")

        if len(url) > MAX_URL_LENGTH:
            raise ValueError(f"URL too long (max {MAX_URL_LENGTH} characters)")

        # Check for dangerous patterns
        url_lower = url.lower()
        for scheme in DANGEROUS_SCHEMES:
            if scheme in url_lower:
                raise ValueError(f"Dangerous URL pattern detected: {scheme}")

        # Check scheme at start
        if not url.startswith(('http://', 'https://')):
            raise ValueError("Invalid URL scheme. Only http:// and https:// allowed")

        # Path traversal check
        if '..' in url or '/../' in url:
            raise ValueError("Path traversal detected in URL")

        return url

    def _get_content_length(self, response: httpx.Response) -> int:
        """Safely get content length from response for logging."""
        try:
            if hasattr(response, 'content') and response.content is not None:
                return len(response.content)
            return 0
        except Exception:
            return 0

    def _serialize_json_for_log(self, data: Any) -> str:
        """Serialize data for logging with truncation."""
        if data is None:
            return "None"
        try:
            serialized = json.dumps(data, default=str)
            return serialized[:500] + "..." if len(serialized) > 500 else serialized
        except Exception as e:
            return f"[Serialization failed: {e}]"

    async def _log_request(
            self,
            method: str,
            url: str,
            **kwargs: Any
    ) -> None:
        """Log request details with sanitization."""
        headers = kwargs.get("headers", {})
        sanitized_headers = _sanitize_for_logging(headers) if headers else {}

        params = kwargs.get("params")
        sanitized_params = _sanitize_for_logging(params) if params else None

        json_body = kwargs.get("json")
        sanitized_json = _sanitize_for_logging(json_body) if json_body else None

        self.logger.debug(
            "HTTP request",
            method=method,
            url=_sanitize_for_logging(url),
            params=sanitized_params,
            headers=sanitized_headers,
            json=sanitized_json,
            timeout=kwargs.get("timeout")
        )

    async def _log_response(
            self,
            response: httpx.Response,
            duration: Optional[float] = None
    ) -> None:
        """Log response details safely."""
        try:
            status_code = getattr(response, 'status_code', 0)
            content_length = self._get_content_length(response)

            headers_dict = {}
            headers_attr = getattr(response, 'headers', {})
            if headers_attr:
                try:
                    headers_dict = dict(headers_attr)
                except (TypeError, ValueError):
                    headers_dict = {k: str(v) for k, v in headers_attr.items()}

            sanitized_headers = _sanitize_for_logging(headers_dict)

            url = getattr(response, 'url', 'unknown')
            if url != 'unknown':
                url = str(url)

            self.logger.info(
                "HTTP response",
                status_code=status_code,
                url=_sanitize_for_logging(url),
                duration=duration,
                content_length=content_length,
                headers=sanitized_headers
            )
        except Exception as e:
            self.logger.error("Failed to log response", error=str(e))

    async def _log_error_response(
            self,
            response: httpx.Response,
            url: str,
            method: str,
            exc: Optional[Exception] = None
    ) -> None:

        try:
            status_code = getattr(response, 'status_code', 0)
            text = getattr(response, 'text', '')[:1000] if hasattr(response, 'text') else ''

            self.logger.error(
                "HTTP error details",
                method=method,
                status_code=status_code,
                url=_sanitize_for_logging(url),
                response_text=_sanitize_for_logging(text),
                response_headers=_sanitize_for_logging(dict(getattr(response, 'headers', {}))),
                original_error=str(exc) if exc else None
            )
        except Exception as e:
            self.logger.error("Failed to log error response", error=str(e))

    async def get(self, url: str, **kwargs: Any) -> httpx.Response:
        """Execute GET request with security checks."""
        url = self._validate_url(url)

        headers = kwargs.get("headers", {})
        if headers:
            _validate_headers_size(headers)

        start_time = asyncio.get_event_loop().time()

        await self._log_request("GET", url, **kwargs)

        try:
            response = await self._async_client.get(url, **kwargs)
            duration = asyncio.get_event_loop().time() - start_time
            await self._log_response(response, duration)

            if response.status_code >= 400:
                await self._log_error_response(response, url, "GET")

            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as e:
            await self._log_error_response(e.response, url, "GET", e)
            raise
        except httpx.TimeoutException as e:
            self.logger.error(
                "Request timeout",
                method="GET",
                url=_sanitize_for_logging(url),
                timeout=kwargs.get("timeout"),
                error=str(e)
            )
            raise
        except httpx.RequestError as e:
            self.logger.error(
                "Request error",
                method="GET",
                error=str(e),
                url=_sanitize_for_logging(url)
            )
            raise

    async def post(self, url: str, **kwargs: Any) -> httpx.Response:
        """Execute POST request with security checks."""
        url = self._validate_url(url)

        headers = kwargs.get("headers", {})
        if headers:
            _validate_headers_size(headers)

        start_time = asyncio.get_event_loop().time()

        await self._log_request("POST", url, **kwargs)

        try:
            response = await self._async_client.post(url, **kwargs)
            duration = asyncio.get_event_loop().time() - start_time
            await self._log_response(response, duration)

            if response.status_code >= 400:
                await self._log_error_response(response, url, "POST")

            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as e:
            await self._log_error_response(e.response, url, "POST", e)
            raise
        except httpx.TimeoutException as e:
            self.logger.error(
                "Request timeout",
                method="POST",
                url=_sanitize_for_logging(url),
                timeout=kwargs.get("timeout"),
                error=str(e)
            )
            raise
        except httpx.RequestError as e:
            self.logger.error(
                "Request error",
                method="POST",
                error=str(e),
                url=_sanitize_for_logging(url)
            )
            raise

    async def request(
            self,
            method: str,
            url: str,
            **kwargs: Any
    ) -> httpx.Response:
        """Execute arbitrary HTTP request with security validation."""
        method = method.upper()
        allowed_methods = {"GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"}
        if method not in allowed_methods:
            raise ValueError(f"Unsupported HTTP method: {method}")

        url = self._validate_url(url)

        headers = kwargs.get("headers", {})
        if headers:
            _validate_headers_size(headers)

        start_time = asyncio.get_event_loop().time()

        await self._log_request(method, url, **kwargs)

        try:
            response = await self._async_client.request(method, url, **kwargs)
            duration = asyncio.get_event_loop().time() - start_time
            await self._log_response(response, duration)

            if response.status_code >= 400:
                await self._log_error_response(response, url, method)

            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as e:
            await self._log_error_response(e.response, url, method, e)
            raise
        except httpx.TimeoutException as e:
            self.logger.error(
                "Request timeout",
                method=method,
                url=_sanitize_for_logging(url),
                timeout=kwargs.get("timeout"),
                error=str(e)
            )
            raise
        except httpx.RequestError as e:
            self.logger.error(
                "Request error",
                method=method,
                error=str(e),
                url=_sanitize_for_logging(url)
            )
            raise

    async def close(self) -> None:
        try:
            await self._async_client.aclose()
            self.logger.debug("HTTP client closed")
        except Exception as e:
            self.logger.error("Error closing HTTP client", error=str(e))

    @asynccontextmanager
    async def stream(self, method: str, url: str, **kwargs: Any):
        """Execute streaming request with security validation."""
        method = method.upper()
        if method not in {"GET", "POST"}:
            raise ValueError(f"Streaming not supported for method: {method}")

        url = self._validate_url(url)

        headers = kwargs.get("headers", {})
        sanitized_headers = _sanitize_for_logging(headers)

        if headers:
            _validate_headers_size(headers)

        self.logger.debug(
            "HTTP stream request",
            method=method,
            url=_sanitize_for_logging(url),
            headers=sanitized_headers
        )

        async with self._async_client.stream(method, url, **kwargs) as response:
            yield response


__all__ = ["HttpxClient"]