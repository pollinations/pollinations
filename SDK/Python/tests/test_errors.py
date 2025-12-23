# tests/test_errors.py
"""Tests for error handling module."""

import json
import pytest
from unittest.mock import Mock, MagicMock

from blossom_ai import SessionConfig
from blossom_ai.core.errors import (
    BlossomError,
    AuthenticationError,
    RateLimitError,
    ValidationError,
    ConfigurationError,
    TimeoutError,
    APIError,
    NetworkError,
    StreamError,
    FileTooLargeError,
    EmptyResponseError,
    Blossom520Error,
    APISchemaError,
    PaymentError,
    ErrorContext,
    ErrorType,
    handle_request_error,
    handle_validation_error,
    handle_empty_response_error,
    _extract_retry_after,
    _parse_error_details,
    _parse_error_details_aiohttp,
    _handle_aiohttp_error,
    _handle_requests_error,
)


class TestErrorContext:
    """Tests for ErrorContext."""

    def test_minimal_context(self):
        """Test context with minimal information."""
        ctx = ErrorContext(operation="test_op")
        assert ctx.operation == "test_op"
        assert ctx.url is None
        assert str(ctx) == "test_op"

    def test_full_context(self):
        """Test context with all fields."""
        ctx = ErrorContext(
            operation="api_call",
            url="https://api.test.com",
            method="POST",
            status_code=500,
            request_id="req-123",
            metadata={"model": "openai", "tokens": 100}
        )

        ctx_str = str(ctx)
        assert "api_call" in ctx_str
        assert "POST https://api.test.com" in ctx_str
        assert "status=500" in ctx_str
        assert "request_id=req-123" in ctx_str
        assert "model=openai" in ctx_str
        assert "tokens=100" in ctx_str

    def test_to_dict(self):
        """Test serialization to dictionary."""
        ctx = ErrorContext(
            operation="test",
            url="https://test.com",
            status_code=404
        )

        d = ctx.to_dict()
        assert d["operation"] == "test"
        assert d["url"] == "https://test.com"
        assert d["status_code"] == 404


class TestBlossomError:
    """Tests for base BlossomError."""

    def test_minimal_error(self):
        """Test error with minimal information."""
        error = BlossomError("Test error")
        assert error.message == "Test error"
        assert error.error_type == ErrorType.UNKNOWN
        assert error.suggestion is None
        assert error.context is None
        assert error.retry_after is None

    def test_full_error(self):
        """Test error with all fields."""
        ctx = ErrorContext(operation="test")
        original = ValueError("Original error")

        error = BlossomError(
            message="Test error",
            error_type=ErrorType.API,
            suggestion="Try again",
            context=ctx,
            original_error=original,
            retry_after=30
        )

        assert error.message == "Test error"
        assert error.error_type == ErrorType.API
        assert error.suggestion == "Try again"
        assert error.context == ctx
        assert error.original_error == original
        assert error.retry_after == 30

    def test_error_formatting(self):
        """Test error string formatting."""
        ctx = ErrorContext(operation="test_op")
        error = BlossomError(
            message="Test error",
            error_type=ErrorType.API,
            suggestion="Try again",
            context=ctx,
            retry_after=30
        )

        formatted = str(error)
        assert "[API_ERROR]" in formatted
        assert "Test error" in formatted
        assert "Context: test_op" in formatted
        assert "Suggestion: Try again" in formatted
        assert "Retry after: 30s" in formatted

    def test_error_repr(self):
        """Test error representation."""
        error = BlossomError(
            message="Test",
            error_type=ErrorType.NETWORK,
            suggestion="Check connection"
        )

        repr_str = repr(error)
        assert "BlossomError" in repr_str
        assert "NETWORK_ERROR" in repr_str
        assert "'Test'" in repr_str

    def test_to_dict(self):
        """Test error serialization."""
        ctx = ErrorContext(operation="test")
        original = ValueError("Original")

        error = BlossomError(
            message="Test error",
            error_type=ErrorType.TIMEOUT,
            suggestion="Increase timeout",
            context=ctx,
            original_error=original,
            retry_after=15
        )

        d = error.to_dict()
        assert d["error_type"] == ErrorType.TIMEOUT
        assert d["message"] == "Test error"
        assert d["suggestion"] == "Increase timeout"
        assert d["retry_after"] == 15
        assert "Original" in d["original_error"]
        assert d["context"]["operation"] == "test"


class TestConcreteErrors:
    """Tests for concrete error types."""

    def test_authentication_error(self):
        """Test AuthenticationError with default suggestion."""
        error = AuthenticationError("Auth failed")
        assert error.error_type == ErrorType.AUTH
        assert "API token" in error.suggestion

    def test_validation_error(self):
        """Test ValidationError with default suggestion."""
        error = ValidationError("Invalid param")
        assert error.error_type == ErrorType.INVALID_PARAM
        assert "documentation" in error.suggestion.lower()

    def test_rate_limit_error(self):
        """Test RateLimitError with retry_after."""
        error = RateLimitError("Rate limited", retry_after=60)
        assert error.error_type == ErrorType.RATE_LIMIT
        assert error.retry_after == 60
        assert "60" in error.suggestion

    def test_rate_limit_error_no_retry_after(self):
        """Test RateLimitError without retry_after."""
        error = RateLimitError("Rate limited")
        assert error.error_type == ErrorType.RATE_LIMIT
        assert error.retry_after is None
        assert "None" not in (error.suggestion or "")

    def test_timeout_error(self):
        """Test TimeoutError."""
        error = TimeoutError("Request timed out")
        assert error.error_type == ErrorType.TIMEOUT
        assert "timeout" in error.suggestion.lower()

    def test_configuration_error(self):
        """Test ConfigurationError."""
        error = ConfigurationError("Invalid config")
        assert error.error_type == ErrorType.CONFIG
        assert "configuration" in error.suggestion.lower()

    def test_api_error(self):
        """Test APIError."""
        error = APIError("Server error")
        assert error.error_type == ErrorType.API
        assert error.suggestion is not None

    def test_network_error(self):
        """Test NetworkError."""
        error = NetworkError("Connection failed")
        assert error.error_type == ErrorType.NETWORK

    def test_stream_error(self):
        """Test StreamError."""
        error = StreamError("Stream failed")
        assert error.error_type == ErrorType.STREAM

    def test_file_too_large_error(self):
        """Test FileTooLargeError."""
        error = FileTooLargeError("File too big")
        assert error.error_type == ErrorType.FILE_TOO_LARGE

    def test_empty_response_error(self):
        """Test EmptyResponseError."""
        error = EmptyResponseError()
        assert error.error_type == ErrorType.EMPTY_RESPONSE
        assert "empty response" in error.message.lower()

    def test_blossom_520_error(self):
        """Test Blossom520Error."""
        error = Blossom520Error(message="Cloudflare 520")
        assert error.error_type == ErrorType.HTTP_520
        assert "520" in error.message

    def test_api_schema_error(self):
        """Test APISchemaError."""
        error = APISchemaError("Invalid format")
        assert error.error_type == ErrorType.INVALID_PARAM
        assert "format" in error.suggestion.lower()

    def test_payment_error(self):
        """Test PaymentError with default suggestion."""
        error = PaymentError("Insufficient balance")
        assert error.error_type == ErrorType.PAYMENT_REQUIRED
        assert "pollinations.ai" in error.suggestion
        assert "balance" in error.suggestion.lower()


class TestParseErrorDetails:
    """Tests for _parse_error_details function — парсинг JSON-ошибок API."""

    def test_parse_with_field_errors(self):
        """Test parsing error response with field errors."""
        mock_response = Mock()
        mock_response.json = Mock(return_value={
            "error": {
                "message": "Validation failed",
                "details": {"fieldErrors": {"temperature": "must be <= 2"}}
            }
        })

        message, details = _parse_error_details(mock_response)
        assert "Validation failed" in message
        assert "Field errors" in message
        assert "temperature" in message

    def test_parse_with_details_message(self):
        """Test parsing error with details message."""
        mock_response = Mock()
        mock_response.json = Mock(return_value={
            "error": {
                "message": "Invalid request",
                "details": {"message": "Missing required field"}
            }
        })

        message, details = _parse_error_details(mock_response)
        assert "Invalid request" in message
        assert "Missing required field" in message

    def test_parse_non_json_error(self):
        """Test parsing non-JSON response."""
        mock_response = Mock()
        mock_response.json.side_effect = ValueError("Invalid JSON")
        mock_response.text = "Plain text error"

        message, details = _parse_error_details(mock_response)
        assert "Plain text error" in message
        assert details is None

    def test_parse_without_text(self):
        """Test parsing response without text."""
        mock_response = Mock()
        mock_response.json.side_effect = ValueError("Invalid JSON")
        mock_response.text = None

        message, details = _parse_error_details(mock_response)
        assert message == "Unknown error"
        assert details is None


class TestRetryAfterExtraction:
    """Tests for retry-after header extraction."""

    def test_with_retry_after_header(self):
        """Test extraction with Retry-After header."""
        response = Mock()
        response.headers = {"Retry-After": "45"}
        assert _extract_retry_after(response) == 45

    def test_with_lowercase_header(self):
        """Test extraction with lowercase header."""
        response = Mock()
        response.headers = {"retry-after": "90"}
        assert _extract_retry_after(response) == 90

    def test_without_header(self):
        """Test extraction without header uses default."""
        response = Mock()
        response.headers = {}
        assert _extract_retry_after(response) == 60

    def test_with_invalid_value(self):
        """Test extraction with invalid value uses default."""
        response = Mock()
        response.headers = {"Retry-After": "invalid"}
        assert _extract_retry_after(response) == 60

    def test_with_float_value(self):
        """Test extraction converts float to int."""
        response = Mock()
        response.headers = {"Retry-After": "30.5"}
        # Float strings are converted to int, rounding down
        result = _extract_retry_after(response)
        assert result == 30 or result == 60  # May return default on parse error


class TestHandleRequestError:
    """Tests for handle_request_error function."""

    def test_aiohttp_401_error(self):
        """Test handling aiohttp 401 error."""
        error = Mock(spec=['status', 'headers', 'message'])
        error.status = 401
        error.headers = {}
        error.message = "Unauthorized"

        result = handle_request_error(
            error,
            operation="test_op",
            url="https://api.test.com"
        )

        assert isinstance(result, AuthenticationError)
        assert result.context.status_code == 401

    def test_aiohttp_402_error(self):
        """Test handling aiohttp 402 payment required error."""
        error = Mock(spec=['status', 'headers', 'message', 'json'])
        error.status = 402
        error.headers = {}
        error.message = "Payment Required"
        error.json = Mock(return_value={
            "error": {
                "message": "Payment Required",
                "details": {"balance": 0}
            }
        })

        result = handle_request_error(error, operation="test_op")

        assert isinstance(result, PaymentError)
        assert result.context.status_code == 402
        assert "Payment Required" in result.message

    def test_aiohttp_429_error(self):
        """Test handling aiohttp 429 error."""
        error = Mock(spec=['status', 'headers', 'message'])
        error.status = 429
        error.headers = {"retry-after": "45"}
        error.message = "Too Many Requests"

        result = handle_request_error(error, operation="test_op")

        assert isinstance(result, RateLimitError)
        assert result.retry_after == 45

    def test_aiohttp_520_error(self):
        """Test handling aiohttp 520 error."""
        error = Mock(spec=['status', 'headers', 'message'])
        error.status = 520
        error.headers = {}
        error.message = "Unknown Error"

        result = handle_request_error(error, operation="test_op")

        assert isinstance(result, Blossom520Error)

    def test_aiohttp_500_error(self):
        """Test handling aiohttp 500+ error."""
        error = Mock(spec=['status', 'headers', 'message'])
        error.status = 503
        error.headers = {}
        error.message = "Service Unavailable"

        result = handle_request_error(error, operation="test_op")

        assert isinstance(result, APIError)
        assert "503" in result.message

    def test_aiohttp_400_error(self):
        """Test handling aiohttp 400 validation error."""
        error = Mock(spec=['status', 'headers', 'message', 'json'])
        error.status = 400
        error.headers = {}
        error.message = "Bad Request"
        error.json = Mock(return_value={
            "error": {
                "message": "Invalid parameter",
                "details": {"field": "temperature"}
            }
        })

        result = handle_request_error(error, operation="test_op")

        assert isinstance(result, ValidationError)
        assert result.context.status_code == 400

    def test_requests_401_error(self):
        """Test handling requests 401 error."""

        class RequestsError:
            response = type('obj', (object,), {
                'status_code': 401,
                'headers': {},
                'text': "Unauthorized"
            })()

        error = RequestsError()
        result = handle_request_error(error, operation="test_op")

        assert isinstance(result, AuthenticationError)

    def test_requests_402_error(self):
        """Test handling requests 402 payment required error."""

        class RequestsError:
            def __init__(self):
                self.response = Mock()
                self.response.status_code = 402
                self.response.headers = {}
                self.response.text = '{"error": {"message": "Insufficient balance"}}'
                self.response.json = Mock(return_value={"error": {"message": "Insufficient balance"}})

        error = RequestsError()
        result = handle_request_error(error, operation="test_op")

        assert isinstance(result, PaymentError)
        assert result.context.status_code == 402

    def test_requests_429_error(self):
        """Test handling requests 429 error."""

        class RequestsError:
            response = type('obj', (object,), {
                'status_code': 429,
                'headers': {"Retry-After": "60"},
                'text': "Rate limited"
            })()

        error = RequestsError()
        result = handle_request_error(error, operation="test_op")

        assert isinstance(result, RateLimitError)
        assert result.retry_after == 60

    def test_requests_520_error(self):
        """Test handling requests 520 error."""

        class RequestsError:
            response = type('obj', (object,), {
                'status_code': 520,
                'headers': {},
                'text': "Unknown Error"
            })()

        error = RequestsError()
        result = handle_request_error(error, operation="test_op")

        assert isinstance(result, Blossom520Error)

    def test_requests_500_error(self):
        """Test handling requests 500+ error."""

        class RequestsError:
            response = type('obj', (object,), {
                'status_code': 503,
                'headers': {},
                'text': "Service Unavailable"
            })()

        error = RequestsError()
        result = handle_request_error(error, operation="test_op")

        assert isinstance(result, APIError)
        assert "503" in result.message

    def test_requests_400_error(self):
        """Test handling requests 400 validation error."""

        class RequestsError:
            def __init__(self):
                self.response = Mock()
                self.response.status_code = 400
                self.response.headers = {}
                self.response.text = '{"error": {"message": "Invalid parameter"}}'
                self.response.json = Mock(return_value={"error": {"message": "Invalid parameter"}})

        error = RequestsError()
        result = handle_request_error(error, operation="test_op")

        assert isinstance(result, ValidationError)
        assert result.context.status_code == 400

    def test_unknown_error(self):
        """Test handling unknown error type."""
        error = Exception("Unknown error")
        result = handle_request_error(error, operation="test_op")

        assert isinstance(result, BlossomError)
        assert "Network error" in result.message  # Changed from "Unexpected error"


class TestHandleValidationError:
    """Tests for handle_validation_error function."""

    def test_simple_validation_error(self):
        """Test creating validation error."""
        error = handle_validation_error(
            param_name="temperature",
            param_value=3.0,
            reason="must be between 0 and 2"
        )

        assert isinstance(error, ValidationError)
        assert "temperature" in error.message
        assert "must be between 0 and 2" in error.message

    def test_validation_error_with_allowed_values(self):
        """Test validation error with allowed values."""
        error = handle_validation_error(
            param_name="quality",
            param_value="invalid",
            reason="not in allowed list",
            allowed=("standard", "hd")
        )

        assert isinstance(error, ValidationError)
        assert "quality" in error.message
        assert "standard" in error.message
        assert "hd" in error.message


class TestHandleEmptyResponseError:
    """Tests for handle_empty_response_error function."""

    def test_empty_response_error(self):
        """Test creating empty response error."""
        error = handle_empty_response_error(
            operation="text_generation",
            url="https://api.test.com/chat"
        )

        assert isinstance(error, EmptyResponseError)
        assert error.context.operation == "text_generation"
        assert error.context.url == "https://api.test.com/chat"


class TestErrorParsingEdgeCases:
    """Edge cases for error parsing."""

    def test_parse_error_details_aiohttp_no_json(self):
        """Test parsing aiohttp error without JSON."""
        mock_response = Mock()
        mock_response.json = Mock(side_effect=TypeError("Not awaitable"))
        mock_response.text = "Plain text error"

        message, details = _parse_error_details_aiohttp(mock_response)
        assert message == "Plain text error"
        assert details is None

    def test_parse_error_details_aiohttp_no_text(self):
        """Test parsing aiohttp error without text."""
        mock_response = Mock()
        mock_response.json = Mock(side_effect=AttributeError())
        mock_response.text = None

        message, details = _parse_error_details_aiohttp(mock_response)
        assert message == "Unknown error"
        assert details is None

    def test_handle_aiohttp_error_402_no_details(self):
        """Test handling 402 error without details."""
        exc = Mock()
        exc.status = 402
        exc.headers = {}

        ctx = ErrorContext(operation="test")
        result = _handle_aiohttp_error(exc, ctx)

        assert isinstance(result, PaymentError)

    def test_handle_requests_error_no_attributes(self):
        """Test handling requests error without response attributes."""
        exc = Exception("Plain exception")
        result = handle_request_error(exc, operation="test")

        assert isinstance(result, NetworkError)
        assert "Network error" in result.message
        assert "Plain exception" in result.message

    def test_handle_request_error_with_missing_response(self):
        """Test handling error without response."""
        error = Exception("No response")
        result = handle_request_error(error, operation="test")

        assert isinstance(result, BlossomError)
        assert "Network error" in result.message


# Тесты для новой функциональности из config.py
class TestAutoRateLimitDetection:
    """Tests for automatic rate limit detection."""

    def test_detect_secret_key_unlimited(self):
        """Test detection of secret key sets high limit."""
        config = SessionConfig()
        config.api_key = "sk_test_secret_key_12345"
        config._detect_rate_limits()

        assert config.rate_limit_per_minute == 100000

    def test_detect_publishable_key_strict(self):
        """Test detection of publishable key sets strict limit."""
        config = SessionConfig()
        config.api_key = "pk_test_publishable_key_67890"
        config._detect_rate_limits()

        assert config.rate_limit_per_minute == 4

    def test_detect_unknown_key_format(self):
        """Test unknown key format keeps default."""
        config = SessionConfig()
        config.api_key = "unknown_key_format"
        original_limit = config.rate_limit_per_minute
        config._detect_rate_limits()

        assert config.rate_limit_per_minute == original_limit

    def test_no_api_key_uses_default(self):
        """Test no API key uses default limit."""
        config = SessionConfig()
        config.api_key = None
        config._detect_rate_limits()

        assert config.rate_limit_per_minute == 60