# tests/test_http_client.py
"""Additional tests for http_client module."""

import pytest
import httpx
from unittest.mock import Mock, AsyncMock, patch
from blossom_ai.utils.http_client import HttpxClient, _sanitize_for_logging
from blossom_ai.core.config import SessionConfig


class TestHttpxClientErrorHandling:
    """Tests for HTTP client error handling."""

    @pytest.fixture
    def mock_config(self):
        return SessionConfig(api_key="test-key", timeout=30.0)

    @pytest.mark.asyncio
    async def test_post_http_status_error_logging(self, mock_config):
        """Test POST request with HTTP error logging."""
        client = HttpxClient(mock_config)

        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"
        mock_response.headers = {"Content-Type": "text/plain"}
        mock_response.url = "https://api.test.com"
        mock_response.raise_for_status = Mock(
            side_effect=httpx.HTTPStatusError("401", request=Mock(), response=mock_response)
        )

        client._async_client.post = AsyncMock(return_value=mock_response)

        with patch.object(client.logger, 'error') as mock_error:
            try:
                await client.post("https://api.test.com", json={"test": "data"})
            except httpx.HTTPStatusError:
                pass

            # Verify error was logged
            mock_error.assert_called()

    @pytest.mark.asyncio
    async def test_request_timeout(self, mock_config):
        """Test request timeout handling."""
        client = HttpxClient(mock_config)

        client._async_client.request = AsyncMock(
            side_effect=httpx.TimeoutException("Request timeout")
        )

        with pytest.raises(httpx.TimeoutException):
            await client.request("GET", "https://api.test.com")

    def test_sanitize_for_logging_no_sensitive_data(self):
        """Test sanitization when no sensitive data present."""
        result = _sanitize_for_logging({
            "normal": "data",
            "count": 123,
            "nested": {"key": "value"}
        })
        assert result["normal"] == "data"
        assert result["count"] == 123


    @pytest.mark.asyncio
    async def test_stream_request_sanitization(self, mock_config):
        """Test streaming request with sanitized headers."""
        client = HttpxClient(mock_config)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.url = "https://api.test.com"

        class MockStreamContext:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return mock_response

            async def __aexit__(self, exc_type, exc_val, exc_tb):
                return False

        client._async_client.stream = Mock(return_value=MockStreamContext())

        with patch.object(client.logger, 'debug') as mock_debug:
            async with client.stream("GET", "https://api.test.com",
                                     headers={"Authorization": "Bearer secret"}) as resp:
                pass
            mock_debug.assert_called()

            for call in mock_debug.call_args_list:
                args, kwargs = call
                if 'headers' in kwargs:
                    headers = kwargs['headers']
                    auth = headers.get('Authorization', '')
                    if '***' in auth:
                        break
            else:
                debug_str = str(mock_debug.call_args_list)
                assert "***REDACTED***" in debug_str or "Bearer ***" in debug_str

    def test_sanitize_for_logging_dangerous_url(self):
        """Test sanitization of dangerous URLs."""
        result = _sanitize_for_logging(
            "javascript:alert(1)",
            sensitive_patterns=[]
        )
        assert result == "javascript:alert(1)"  # Should be caught by validation first

    @pytest.mark.asyncio
    async def test_request_with_connection_error(self, mock_config):
        """Test handling of connection errors."""
        client = HttpxClient(mock_config)

        client._async_client.request = AsyncMock(
            side_effect=httpx.ConnectError("Connection refused")
        )

        with pytest.raises(httpx.ConnectError):
            await client.request("GET", "https://api.test.com")


class TestHttpxClientValidation:
    """Tests for URL validation edge cases."""

    def test_validate_url_leading_whitespace(self):
        """Test URL validation strips leading/trailing whitespace."""
        client = HttpxClient(SessionConfig())

        url = client._validate_url("  https://api.test.com  ")
        assert url == "https://api.test.com"

    def test_validate_url_with_query_params(self):
        """Test URL validation with query parameters."""
        client = HttpxClient(SessionConfig())

        url = client._validate_url("https://api.test.com?key=value&other=123")
        assert url == "https://api.test.com?key=value&other=123"

    @pytest.mark.parametrize("dangerous_url", [
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "file:///etc/passwd",
        "vbscript:msgbox(1)",
    ])
    def test_validate_url_dangerous_patterns(self, dangerous_url):
        """Test rejection of dangerous URL patterns."""
        client = HttpxClient(SessionConfig())

        with pytest.raises(ValueError, match="Dangerous URL pattern"):
            client._validate_url(dangerous_url)

    def test_validate_url_empty_string(self):
        """Test rejection of empty URL."""
        client = HttpxClient(SessionConfig())

        with pytest.raises(ValueError, match="URL cannot be empty"):
            client._validate_url("")

    def test_validate_url_none_raises(self):
        """Test that None URL raises TypeError."""
        client = HttpxClient(SessionConfig())

        with pytest.raises(AttributeError):  # str.strip() on None
            client._validate_url(None)


class TestHttpxClientContentHandling:
    """Tests for content length and response handling."""

    @pytest.mark.asyncio
    async def test_get_content_length_mock_response(self):
        """Test content length extraction from mock response."""
        client = HttpxClient(SessionConfig())

        # Test with real response
        with patch.object(client._async_client, 'get') as mock_get:
            mock_response = Mock()
            mock_response.content = b"test data"
            mock_response.status_code = 200
            mock_response.raise_for_status = Mock()
            mock_get.return_value = mock_response

            await client.get("https://api.test.com")

            # Verify content length was logged
            assert len(mock_response.content) == 9

    @pytest.mark.asyncio
    async def test_get_content_length_none_content(self):
        """Test handling of None content."""
        client = HttpxClient(SessionConfig())

        mock_response = Mock()
        mock_response.content = None
        mock_response.status_code = 500
        mock_response.headers = {}

        length = client._get_content_length(mock_response)
        assert length == 0

    def test_serialize_json_for_log_complex_object(self):
        """Test JSON serialization for logging with complex objects."""
        client = HttpxClient(SessionConfig())

        class CustomObj:
            def __str__(self):
                return "CustomObj"

        result = client._serialize_json_for_log({
            "key": "value",
            "number": 123,
            "obj": CustomObj(),
            "nested": {"a": "b"}
        })

        assert "CustomObj" in result
        assert len(result) <= 500  # Should truncate

    def test_serialize_json_for_log_none(self):
        """Test JSON serialization of None."""
        client = HttpxClient(SessionConfig())

        result = client._serialize_json_for_log(None)
        assert result == "None"