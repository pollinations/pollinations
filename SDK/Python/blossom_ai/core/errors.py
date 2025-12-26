"""
Blossom AI — Error Handling
Centralised error types with clear developer-facing messages.
Supports structured API error responses with details.
"""

from __future__ import annotations

import logging
import json
from typing import Optional, Dict, Any, Union, NamedTuple, Final

import aiohttp
import requests

logger = logging.getLogger("blossom_ai")

# --------------------------------------------------------------------------- #
# Central suggestions
# --------------------------------------------------------------------------- #

_SUGGESTIONS: Final[Dict[str, str]] = {
    "auth": "Check your API token at https://enter.pollinations.ai",
    "timeout": "Try increasing timeout or check your connection",
    "rate_limit": "Please wait {retry_after}s before retrying",
    "payment": "Visit https://auth.pollinations.ai to upgrade or check your API token balance",
    "validation": "See allowed values in documentation",
    "file_large": "Reduce file size or compress before upload",
    "stream_fail": "Try non-streaming mode or check your connection",
    "config": "Check your configuration values and environment variables",
    "api_format": "Request body format doesn't match API specification",
    "empty_response": "API returned empty response - check parameters",
    "server_error": "Server error - may be temporary, try again in a few seconds",
}

# --------------------------------------------------------------------------- #
# Error types
# --------------------------------------------------------------------------- #

class ErrorType:
    NETWORK = "NETWORK_ERROR"
    API = "API_ERROR"
    INVALID_PARAM = "INVALID_PARAMETER"
    AUTH = "AUTHENTICATION_ERROR"
    RATE_LIMIT = "RATE_LIMIT_ERROR"
    STREAM = "STREAM_ERROR"
    FILE_TOO_LARGE = "FILE_TOO_LARGE_ERROR"
    TIMEOUT = "TIMEOUT_ERROR"
    UNKNOWN = "UNKNOWN_ERROR"
    HTTP_520 = "HTTP_520_ERROR"
    CONFIG = "CONFIGURATION_ERROR"
    EMPTY_RESPONSE = "EMPTY_RESPONSE_ERROR"
    VALIDATION = "VALIDATION_ERROR"
    PAYMENT_REQUIRED = "PAYMENT_REQUIRED_ERROR"

# --------------------------------------------------------------------------- #
# Error context
# --------------------------------------------------------------------------- #

class ErrorContext(NamedTuple):
    operation: str
    url: Optional[str] = None
    method: Optional[str] = None
    status_code: Optional[int] = None
    request_id: Optional[str] = None
    metadata: Dict[str, Any] = {}

    def __str__(self) -> str:
        parts = [self.operation]
        if self.method and self.url:
            parts.append(f"{self.method} {self.url}")
        elif self.url:
            parts.append(self.url)
        if self.status_code:
            parts.append(f"status={self.status_code}")
        if self.request_id:
            parts.append(f"request_id={self.request_id}")
        if self.metadata:
            parts.append(", ".join(f"{k}={v}" for k, v in self.metadata.items()))
        return " | ".join(parts)

    def to_dict(self) -> Dict[str, Any]:
        return self._asdict()

# --------------------------------------------------------------------------- #
# Base error
# --------------------------------------------------------------------------- #

class BlossomError(Exception):
    """Base exception for all Blossom AI errors."""
    __slots__ = ("message", "error_type", "suggestion", "context", "original_error", "retry_after", "details")

    def __init__(
        self,
        message: str,
        error_type: str = ErrorType.UNKNOWN,
        suggestion: Optional[str] = None,
        context: Optional[ErrorContext] = None,
        original_error: Optional[Exception] = None,
        retry_after: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.message = message
        self.error_type = error_type
        self.suggestion = suggestion
        self.context = context
        self.original_error = original_error
        self.retry_after = retry_after
        self.details = details
        super().__init__(self._format())

    def _format(self) -> str:
        parts = [f"[{self.error_type}] {self.message}"]
        if self.context:
            parts.append(f"Context: {self.context}")
        if self.suggestion:
            parts.append(f"Suggestion: {self.suggestion}")
        if self.retry_after:
            parts.append(f"Retry after: {self.retry_after}s")
        if self.details:
            parts.append(f"Details: {self.details}")
        if self.original_error:
            parts.append(f"Original error: {type(self.original_error).__name__}: {self.original_error}")
        return "\n".join(parts)

    def __repr__(self) -> str:
        return (
            f"BlossomError(type={self.error_type}, message={self.message!r}, "
            f"suggestion={self.suggestion!r})"
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error_type": self.error_type,
            "message": self.message,
            "suggestion": self.suggestion,
            "context": self.context.to_dict() if self.context else None,
            "retry_after": self.retry_after,
            "original_error": str(self.original_error) if self.original_error else None,
            "details": self.details,
        }

# --------------------------------------------------------------------------- #
# Concrete errors
# --------------------------------------------------------------------------- #

class NetworkError(BlossomError):
    def __init__(self, message: str, **kwargs: Any):
        super().__init__(message, ErrorType.NETWORK, **kwargs)

class APIError(BlossomError):
    def __init__(self, message: str, **kwargs: Any):
        kwargs.setdefault("suggestion", _SUGGESTIONS["server_error"])
        super().__init__(message, ErrorType.API, **kwargs)

class AuthenticationError(BlossomError):
    def __init__(self, message: str, **kwargs: Any):
        kwargs.setdefault("suggestion", _SUGGESTIONS["auth"])
        super().__init__(message, ErrorType.AUTH, **kwargs)

class ValidationError(BlossomError):
    def __init__(self, message: str, **kwargs: Any):
        kwargs.setdefault("suggestion", _SUGGESTIONS["validation"])
        super().__init__(message, ErrorType.INVALID_PARAM, **kwargs)

class RateLimitError(BlossomError):
    def __init__(self, message: str, retry_after: Optional[int] = None, **kwargs: Any):
        if retry_after:
            kwargs.setdefault("suggestion", _SUGGESTIONS["rate_limit"].format(retry_after=retry_after))
        super().__init__(message, ErrorType.RATE_LIMIT, retry_after=retry_after, **kwargs)

class StreamError(BlossomError):
    def __init__(self, message: str, **kwargs: Any):
        kwargs.setdefault("suggestion", _SUGGESTIONS["stream_fail"])
        super().__init__(message, ErrorType.STREAM, **kwargs)

class FileTooLargeError(BlossomError):
    def __init__(self, message: str, **kwargs: Any):
        kwargs.setdefault("suggestion", _SUGGESTIONS["file_large"])
        super().__init__(message, ErrorType.FILE_TOO_LARGE, **kwargs)

class TimeoutError(BlossomError):
    def __init__(self, message: str, **kwargs: Any):
        kwargs.setdefault("suggestion", _SUGGESTIONS["timeout"])
        super().__init__(message, ErrorType.TIMEOUT, **kwargs)

class EmptyResponseError(BlossomError):
    """Raised when API returns empty response."""
    def __init__(self, message: str = "Empty response from API", **kwargs: Any):
        kwargs.setdefault("suggestion", _SUGGESTIONS["empty_response"])
        super().__init__(message, ErrorType.EMPTY_RESPONSE, **kwargs)

class Blossom520Error(BlossomError):
    """Special handling for Cloudflare 520 (unknown error)."""
    def __init__(self, message: str = "Cloudflare 520 Unknown Error", **kwargs: Any):
        super().__init__(message, ErrorType.HTTP_520, **kwargs)

class ConfigurationError(BlossomError):
    """Raised when configuration is invalid."""
    def __init__(self, message: str, **kwargs: Any):
        kwargs.setdefault("suggestion", _SUGGESTIONS["config"])
        super().__init__(message, ErrorType.CONFIG, **kwargs)

class APISchemaError(BlossomError):
    """Raised when request format doesn't match API schema."""
    def __init__(self, message: str, **kwargs: Any):
        kwargs.setdefault("suggestion", _SUGGESTIONS["api_format"])
        super().__init__(message, ErrorType.INVALID_PARAM, **kwargs)

class PaymentError(BlossomError):
    """Raised when payment is required (insufficient pollen balance)."""
    def __init__(self, message: str = "Payment required", **kwargs: Any):
        kwargs.setdefault("suggestion", _SUGGESTIONS["payment"])
        super().__init__(message, ErrorType.PAYMENT_REQUIRED, **kwargs)

# --------------------------------------------------------------------------- #
# Handlers
# --------------------------------------------------------------------------- #

def _extract_retry_after(response_or_headers: Any) -> int:
    """Extract retry-after value from response or headers."""
    try:
        headers = getattr(response_or_headers, "headers", response_or_headers)
        retry_after = headers.get("Retry-After") or headers.get("retry-after")
        return int(retry_after) if retry_after else 60
    except (ValueError, TypeError, AttributeError):
        return 60


def _parse_error_details(response: Any) -> tuple[str, Optional[Dict[str, Any]]]:
    """
    Parse error response body for details (sync version for requests).

    Returns:
        tuple: (message, details_dict)
    """
    try:
        # Try to parse JSON error response
        if hasattr(response, 'json'):
            error_data = response.json()
        else:
            error_data = json.loads(response.text)

        error_info = error_data.get("error", {})
        message = error_info.get("message", "Unknown error")
        details = error_info.get("details")

        # Enhance message with field errors if present
        if details and "fieldErrors" in details:
            field_errors = details["fieldErrors"]
            message += f" | Field errors: {field_errors}"
        elif details and "message" in details:
            message += f" | {details['message']}"

        return message, details
    except Exception:
        # If parsing fails, return raw text
        try:
            text = getattr(response, 'text', None)
            if text is not None:
                return text[:200], None
            else:
                return "Unknown error", None
        except AttributeError:
            return "Unknown error", None


def _parse_error_details_aiohttp(response: Any) -> tuple[str, Optional[Dict[str, Any]]]:
    """
    Parse error response body for details (for aiohttp).
    Tries to handle both sync and async json() methods.
    """
    try:
        # For aiohttp, json might be awaitable
        json_attr = getattr(response, 'json', None)
        if callable(json_attr):
            # Try to call synchronously (for Mock objects in tests)
            try:
                error_data = json_attr()
            except TypeError:
                # JSON is not available, try to get text
                text_attr = getattr(response, 'text', None)
                if text_attr:
                    if callable(text_attr):
                        return text_attr(), None
                    return str(text_attr), None
                return "Unknown error", None
        elif hasattr(response, 'text'):
            try:
                # Try to parse text as JSON
                text = response.text
                if callable(text):
                    text = text()
                error_data = json.loads(text)
            except (ValueError, TypeError):
                # Text is not JSON, return it as message
                return str(text), None
        else:
            return "Unknown error", None

        error_info = error_data.get("error", {})
        message = error_info.get("message", "Unknown error")
        details = error_info.get("details")

        # Enhance message with field errors if present
        if details and "fieldErrors" in details:
            field_errors = details["fieldErrors"]
            message += f" | Field errors: {field_errors}"
        elif details and "message" in details:
            message += f" | {details['message']}"

        return message, details
    except Exception:
        # Last resort - try to get any text content
        try:
            text = getattr(response, 'text', None)
            if text is not None:
                if callable(text):
                    return text(), None
                return str(text), None
            else:
                return "Unknown error", None
        except Exception:
            return "Unknown error", None


def handle_request_error(
        exc: Exception,
        operation: str,
        url: Optional[str] = None,
        method: Optional[str] = None,
        request_id: Optional[str] = None,
) -> BlossomError:
    """Convert a request exception into a BlossomError."""
    context = ErrorContext(operation=operation, url=url, method=method, request_id=request_id)

    # Check for requests-like errors first (has response with status_code)
    try:
        if hasattr(exc, 'response') and hasattr(exc.response, 'status_code'):
            return _handle_requests_error(exc, context)
    except (AttributeError, TypeError):
        pass

    # Duck typing for aiohttp-like errors (has status but no response attribute)
    if hasattr(exc, 'status') and not hasattr(exc, 'response'):
        return _handle_aiohttp_error(exc, context)

    return NetworkError(
        f"Network error: {str(exc)}",
        context=context,
        original_error=exc,
    )


def _handle_aiohttp_error(exc: aiohttp.ClientResponseError, ctx: ErrorContext) -> BlossomError:
    """Handle aiohttp-specific errors."""
    ctx = ctx._replace(status_code=exc.status)

    if exc.status == 402:
        message, details = _parse_error_details_aiohttp(exc)
        return PaymentError(message, context=ctx, original_error=exc, details=details)

    if exc.status == 401:
        return AuthenticationError("Authentication failed", context=ctx, original_error=exc)
    if exc.status == 429:
        retry_after = _extract_retry_after(exc)
        return RateLimitError("Rate limit exceeded", retry_after=retry_after, context=ctx, original_error=exc)
    if exc.status == 520:
        return Blossom520Error(context=ctx, original_error=exc)
    if exc.status >= 500:
        return APIError(f"Server error {exc.status}", context=ctx, original_error=exc)

    if exc.status == 400:
        message, details = _parse_error_details_aiohttp(exc)
        return ValidationError(message, context=ctx, original_error=exc, details=details)

    return APIError(f"HTTP {exc.status}: {exc.message}", context=ctx, original_error=exc)


def _handle_requests_error(exc: Any, ctx: ErrorContext) -> BlossomError:
    """Handle requests-specific errors."""
    try:
        status = exc.response.status_code
        ctx = ctx._replace(status_code=status)

        if status == 402:
            message, details = _parse_error_details(exc.response)
            return PaymentError(message, context=ctx, original_error=exc, details=details)

        if status == 401:
            return AuthenticationError("Authentication failed", context=ctx, original_error=exc)
        if status == 429:
            retry_after = _extract_retry_after(exc.response)
            return RateLimitError("Rate limit exceeded", retry_after=retry_after, context=ctx, original_error=exc)
        if status == 520:
            return Blossom520Error(context=ctx, original_error=exc)
        if status >= 500:
            return APIError(f"Server error {status}", context=ctx, original_error=exc)

        if status == 400:
            message, details = _parse_error_details(exc.response)
            return ValidationError(message, context=ctx, original_error=exc, details=details)

        # Try to get response text
        try:
            response_text = exc.response.text[:200]
        except (AttributeError, TypeError):
            response_text = "No response text"

        return APIError(f"HTTP {status}: {response_text}", context=ctx, original_error=exc)
    except AttributeError:
        # If we can't get status_code, treat as generic network error
        return NetworkError(f"Network error: {exc}", context=ctx, original_error=exc)


def handle_validation_error(
    param_name: str,
    param_value: Any,
    reason: str,
    allowed: Optional[tuple[str, ...]] = None,
) -> ValidationError:
    """Create a validation error with context."""
    meta: Dict[str, Any] = {"parameter": param_name, "value": str(param_value)}
    if allowed:
        meta["allowed_values"] = allowed
    ctx = ErrorContext(operation="parameter_validation", metadata=meta)
    msg = f"Invalid parameter '{param_name}': {reason}"
    if allowed:
        msg += f"\nAllowed values: {', '.join(allowed)}"
    return ValidationError(msg, context=ctx)


def handle_empty_response_error(
    operation: str,
    url: Optional[str] = None,
) -> EmptyResponseError:
    """Create an empty response error."""
    ctx = ErrorContext(operation=operation, url=url)
    return EmptyResponseError(
        "API returned empty response",
        context=ctx,
    )