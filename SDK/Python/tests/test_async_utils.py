# tests/test_async_utils.py
"""Additional tests for async utilities."""

import pytest
import asyncio
from unittest.mock import patch, MagicMock
from blossom_ai.utils.async_utils import _run_async, run_sync_in_pool


class TestAsyncUtilsEdgeCases:
    """Tests for async utilities edge cases."""

    def test_run_async_with_exception(self):
        """Test that exceptions in coroutine are propagated."""

        async def failing_coroutine():
            raise ValueError("Test error")

        with pytest.raises(ValueError, match="Test error"):
            _run_async(failing_coroutine())

    def test_run_async_with_keyboard_interrupt(self):
        """Test handling of KeyboardInterrupt."""

        async def interrupt_coroutine():
            raise KeyboardInterrupt()

        with pytest.raises(KeyboardInterrupt):
            _run_async(interrupt_coroutine())

    def test_run_sync_in_pool_with_exception(self):
        """Test that exceptions in sync function are propagated."""

        def failing_function():
            raise RuntimeError("Pool error")

        with pytest.raises(RuntimeError, match="Pool error"):
            run_sync_in_pool(failing_function)

    def test_run_sync_in_pool_with_args(self):
        """Test sync function execution with arguments."""

        def add(a, b, c=0):
            return a + b + c

        result = run_sync_in_pool(add, 1, 2, c=3)
        assert result == 6

    def test_run_async_when_loop_already_running(self):
        """Test running async when event loop is already running.

        This test simulates the case where _run_async detects an existing
        event loop and uses run_coroutine_threadsafe instead.
        """
        # Mock the loop detection
        mock_loop = MagicMock()

        # Create a mock future that immediately returns the result
        mock_future = MagicMock()
        mock_future.result.return_value = "test_result"
        mock_future.cancel = MagicMock()  # Mock cancel to avoid AttributeError

        # Mock asyncio.run_coroutine_threadsafe to return our mock future
        with patch('asyncio.get_running_loop', return_value=mock_loop):
            with patch('asyncio.run_coroutine_threadsafe', return_value=mock_future):
                async def simple_coroutine():
                    return "test_result"

                # This will use the run_coroutine_threadsafe path
                result = _run_async(simple_coroutine())
                assert result == "test_result"
                mock_future.result.assert_called_once()

    def test_run_sync_in_pool_with_complex_return(self):
        """Test sync function returning complex object."""

        def return_complex():
            return {"key": "value", "list": [1, 2, 3], "nested": {"a": "b"}}

        result = run_sync_in_pool(return_complex)
        assert result == {"key": "value", "list": [1, 2, 3], "nested": {"a": "b"}}