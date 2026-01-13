import pytest
from unittest.mock import Mock, patch
import sys

from blossom_ai.utils.logging import StructuredLogger, set_correlation_id, get_correlation_id
from blossom_ai.utils.async_utils import _run_async  # ДОБАВЬТЕ ЭТОТ ИМПОРТ


class TestLoggingEdgeCases:
    """Edge cases for structured logging."""

    def test_logger_without_structlog(self):
        """Test logger when structlog is not available."""
        with patch('blossom_ai.utils.logging.STRUCTLOG_AVAILABLE', False):
            logger = StructuredLogger("test")

            with patch('logging.Logger.info') as mock_info:
                logger.info("Test message", key="value")
                mock_info.assert_called_once()

    def test_correlation_id_persists_in_context(self):
        """Test correlation ID persists in async context."""
        set_correlation_id("test-123")

        async def async_function():
            return get_correlation_id()

        result = _run_async(async_function())
        assert result == "test-123"
        set_correlation_id(None)  # Cleanup

    def test_add_context_removes_message_key(self):
        """Test that _add_context removes 'message' key."""
        logger = StructuredLogger("test")

        context = logger._add_context({"message": "should be removed", "key": "value"})
        assert "message" not in context
        assert context["key"] == "value"

    def test_exception_logging_with_correlation(self):
        """Test exception logging includes correlation ID."""
        set_correlation_id("corr-456")
        logger = StructuredLogger("test")

        try:
            raise ValueError("Test exception")
        except ValueError:
            with patch.object(logger._logger, 'exception') as mock_exception:
                logger.exception("Error occurred", details="test")
                mock_exception.assert_called_once()

        set_correlation_id(None)  # Cleanup