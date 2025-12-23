"""
Pytest configuration and shared fixtures.
"""

import os
import sys
import pytest
import asyncio
from pathlib import Path
from unittest.mock import Mock, MagicMock, AsyncMock

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))


# ============================================================================
# Pytest Configuration
# ============================================================================

def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "unit: Unit tests (fast, no external dependencies)"
    )
    config.addinivalue_line(
        "markers", "integration: Integration tests (may require API)"
    )
    config.addinivalue_line(
        "markers", "slow: Slow running tests"
    )
    config.addinivalue_line(
        "markers", "asyncio: Async tests using pytest-asyncio"
    )
    config.addinivalue_line(
        "markers", "timeout: Test timeout in seconds"
    )


# ============================================================================
# Event Loop Configuration
# ============================================================================

@pytest.fixture(scope="session")
def event_loop_policy():
    """Set event loop policy for tests."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    return asyncio.get_event_loop_policy()


@pytest.fixture(scope="function")
def event_loop(event_loop_policy):
    """Create an event loop for each test function."""
    loop = event_loop_policy.new_event_loop()
    yield loop
    loop.close()


# ============================================================================
# Environment Setup
# ============================================================================

@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """
    Setup test environment variables.
    """
    original_test_mode = os.getenv("BLOSSOM_AI_TEST_MODE")

    try:
        # Enable test mode for security utilities
        os.environ["BLOSSOM_AI_TEST_MODE"] = "true"

        # Clear any existing API keys to avoid accidental API calls
        os.environ.pop("POLLINATIONS_API_KEY", None)

        yield

    finally:
        if original_test_mode is None:
            os.environ.pop("BLOSSOM_AI_TEST_MODE", None)
        else:
            os.environ["BLOSSOM_AI_TEST_MODE"] = original_test_mode


@pytest.fixture(autouse=True)
def reset_environment():
    """Reset environment before each test."""
    # Создаем копию текущего окружения в начале теста
    original_env = os.environ.copy()

    try:
        yield
    finally:
        # Восстанавливаем оригинальное окружение
        os.environ.clear()
        os.environ.update(original_env)


# ============================================================================
# Temporary Directory Fixtures
# ============================================================================

@pytest.fixture
def temp_dir(tmp_path):
    """Create a temporary directory for test files."""
    test_dir = tmp_path / "test_files"
    test_dir.mkdir(exist_ok=True)
    return test_dir


@pytest.fixture
def temp_image_file(temp_dir):
    """Create a temporary image file."""
    image_file = temp_dir / "test_image.png"
    image_file.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
    return image_file


@pytest.fixture
def temp_text_file(temp_dir):
    """Create a temporary text file."""
    text_file = temp_dir / "test_text.txt"
    text_file.write_text("Test content")
    return text_file


# ============================================================================
# Mock Fixtures
# ============================================================================

@pytest.fixture
def mock_http_response():
    """Create a mock HTTP response with full attributes."""
    response = MagicMock()
    response.status_code = 200
    response.content = b"mock response"
    response.text = "mock response"
    response.json = Mock(return_value={"data": "test"})
    response.headers = {}  # CRITICAL: Add headers attribute
    response.raise_for_status = Mock()
    return response


@pytest.fixture
def mock_error_response():
    """Create a mock error response."""
    response = MagicMock()
    response.status_code = 500
    response.content = b"Server error"
    response.text = "Server error"
    response.headers = {}  # CRITICAL: Add headers attribute
    response.raise_for_status = Mock()
    return response


@pytest.fixture
def mock_text_response():
    """Create a mock text generation response."""
    response = MagicMock()
    response.status_code = 200
    response.content = b'{"choices":[{"message":{"content":"Generated text"}}]}'
    response.json = Mock(return_value={
        "choices": [{"message": {"content": "Generated text"}}]
    })
    response.raise_for_status = Mock()
    response.headers = {}  # CRITICAL: Add headers attribute
    return response


@pytest.fixture
def mock_image_response():
    """Create a mock image generation response."""
    response = MagicMock()
    response.status_code = 200
    response.content = b"fake_image_data_png"
    response.raise_for_status = Mock()
    response.headers = {}  # CRITICAL: Add headers attribute
    return response


@pytest.fixture
def mock_stream_response():
    """Create a mock streaming response."""
    response = MagicMock()
    response.status_code = 200
    response.headers = {}  # CRITICAL: Add headers attribute
    response.raise_for_status = Mock()

    async def aiter_lines():
        lines = [
            b"data: {\"choices\":[{\"delta\":{\"content\":\"test\"}}]}",
            b"data: [DONE]"
        ]
        for line in lines:
            yield line

    response.aiter_lines = aiter_lines
    response.aread = AsyncMock(return_value=b"")
    return response


# ============================================================================
# Model Reset Fixtures
# ============================================================================

@pytest.fixture(autouse=True)
def reset_model_caches():
    """Reset model caches before each test."""
    from blossom_ai.core.models import TextModel, ImageModel

    TextModel.reset()
    ImageModel.reset()

    yield

    TextModel.reset()
    ImageModel.reset()


# ============================================================================
# Async Helper Fixtures
# ============================================================================

@pytest.fixture
async def async_mock_http_client():
    """Create an async mock HTTP client with proper MagicMock."""
    client = MagicMock()
    client.get = AsyncMock()
    client.post = AsyncMock()
    client.close = AsyncMock()
    client.stream = MagicMock()

    # Create proper async context manager for stream
    mock_stream_ctx = MagicMock()
    mock_stream_ctx.__aenter__ = AsyncMock()
    mock_stream_ctx.__aexit__ = AsyncMock()
    client.stream.return_value = mock_stream_ctx

    return client


# ============================================================================
# Configuration Fixtures
# ============================================================================

@pytest.fixture
def default_config():
    """Create default configuration for tests."""
    from blossom_ai.core.config import SessionConfig

    return SessionConfig(
        api_key=None,
        timeout=30.0,
        max_retries=3,
        rate_limit_per_minute=60,
        cache_ttl=3600
    )


@pytest.fixture
def test_config():
    """Create test configuration with custom values."""
    from blossom_ai.core.config import SessionConfig

    return SessionConfig(
        api_key="test-key-12345",
        timeout=45.0,
        max_retries=5,
        rate_limit_per_minute=120,
        cache_ttl=1800
    )


# ============================================================================
# Logger Fixtures
# ============================================================================

@pytest.fixture
def mock_logger():
    """Create a mock logger."""
    logger = MagicMock()
    logger.debug = Mock()
    logger.info = Mock()
    logger.warning = Mock()
    logger.error = Mock()
    logger.exception = Mock()
    return logger


# ============================================================================
# Rate Limiter Fixtures
# ============================================================================

@pytest.fixture
def mock_rate_limiter():
    """Create a mock rate limiter."""
    limiter = MagicMock()
    limiter.acquire = AsyncMock(return_value=True)
    limiter.acquire_with_wait = AsyncMock(return_value=True)
    limiter.release = AsyncMock()
    limiter.get_stats = Mock(return_value={})
    return limiter


# ============================================================================
# Utility Functions
# ============================================================================

def assert_valid_json(data):
    """Assert that data is valid JSON."""
    import json
    try:
        if isinstance(data, bytes):
            json.loads(data.decode('utf-8'))
        else:
            json.loads(data)
        return True
    except json.JSONDecodeError:
        return False


def create_streaming_response(chunks):
    """Create a mock streaming response."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = Mock()

    async def aiter_lines():
        for chunk in chunks:
            yield chunk

    mock_response.aiter_lines = aiter_lines
    return mock_response


# ============================================================================
# Pytest Hooks
# ============================================================================

def pytest_collection_modifyitems(config, items):
    """Modify test items during collection."""
    for item in items:
        # Add asyncio marker to all async tests
        if asyncio.iscoroutinefunction(item.function):
            item.add_marker(pytest.mark.asyncio)

        # Add unit marker to fast tests
        if "unit" not in item.keywords and "integration" not in item.keywords:
            item.add_marker(pytest.mark.unit)


# ============================================================================
# Custom Assertions
# ============================================================================

@pytest.fixture
def custom_assertions():
    """Provide custom assertion helpers."""

    class Assertions:
        @staticmethod
        def assert_valid_url(url):
            """Assert URL is valid."""
            assert isinstance(url, str)
            assert url.startswith(("http://", "https://"))

        @staticmethod
        def assert_valid_image_data(data):
            """Assert data looks like valid image."""
            assert isinstance(data, bytes)
            assert len(data) > 0
            # Check for common image headers
            png_header = b'\x89PNG\r\n\x1a\n'
            jpeg_header = b'\xff\xd8\xff'
            assert data.startswith(png_header) or data.startswith(jpeg_header)

        @staticmethod
        def assert_valid_model_name(name):
            """Assert model name is valid."""
            assert isinstance(name, str)
            assert len(name) > 0
            assert not name.isspace()

    return Assertions()