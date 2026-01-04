"""Tests for Sugar Layer - Simple API."""

import pytest
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock
import asyncio
from blossom_ai.utils.sugar_layer.simple import _LazyClient, LazySugarAPI

class TestImageAPI:
    """Tests for ai.image API."""

    @pytest.fixture(autouse=True)
    def reset_client(self):
        """Reset lazy client before each test."""
        from blossom_ai.utils.sugar_layer.simple import _LazyClient
        _LazyClient._instance = None
        yield
        _LazyClient._instance = None

    def test_image_generate_basic(self):
        """Test basic image generation."""
        from blossom_ai import ai

        with patch("blossom_ai.utils.sugar_layer.simple._LazyClient.get") as mock_get:
            mock_client = Mock()
            mock_client.image.generate = AsyncMock(return_value=b"fake_image_data")
            mock_get.return_value = mock_client

            result = ai.image.generate("test prompt")
            assert result == b"fake_image_data"
            mock_client.image.generate.assert_called_once()

    def test_image_generate_with_params(self):
        """Test image generation with custom parameters."""
        from blossom_ai import ai

        with patch("blossom_ai.utils.sugar_layer.simple._LazyClient.get") as mock_get:
            mock_client = Mock()
            mock_client.image.generate = AsyncMock(return_value=b"image")
            mock_get.return_value = mock_client

            result = ai.image.generate(
                "test", model="flux", width=512, height=512, quality="hd"
            )

            assert result == b"image"
            call_args = mock_client.image.generate.call_args
            assert call_args[0][0] == "test"
            assert call_args[1]["model"] == "flux"
            assert call_args[1]["width"] == 512
            assert call_args[1]["height"] == 512
            assert call_args[1]["quality"] == "hd"

    def test_image_save(self, tmp_path):
        """Test saving image to file."""
        from blossom_ai import ai

        output_file = tmp_path / "test.png"

        with patch("blossom_ai.utils.sugar_layer.simple._LazyClient.get") as mock_get:
            mock_client = Mock()
            mock_client.image.save = AsyncMock(return_value=output_file.absolute())
            mock_get.return_value = mock_client

            result = ai.image.save("test prompt", str(output_file))

            assert isinstance(result, Path)
            assert result == output_file.absolute()

    def test_image_save_with_params(self, tmp_path):
        """Test saving with custom parameters."""
        from blossom_ai import ai

        output_file = tmp_path / "custom.jpg"

        with patch("blossom_ai.utils.sugar_layer.simple._LazyClient.get") as mock_get:
            mock_client = Mock()
            mock_client.image.save = AsyncMock(return_value=output_file.absolute())
            mock_get.return_value = mock_client

            result = ai.image.save(
                "landscape",
                str(output_file),
                width=1920,
                height=1080,
                quality="hd",
            )

            assert isinstance(result, Path)
            assert result == output_file.absolute()

    def test_image_url(self):
        """Test getting image URL without request."""
        from blossom_ai import ai

        with patch("blossom_ai.utils.sugar_layer.simple._LazyClient.get") as mock_get:
            mock_client = Mock()
            mock_client.image.generate_url = Mock(return_value="https://example.com/image")
            mock_get.return_value = mock_client

            url = ai.image.url("test", width=1024, height=768)

            assert url == "https://example.com/image"
            mock_client.image.generate_url.assert_called_once()


class TestTextAPI:
    """Tests for ai.text API."""

    @pytest.fixture(autouse=True)
    def reset_client(self):
        """Reset lazy client before each test."""
        from blossom_ai.utils.sugar_layer.simple import _LazyClient
        _LazyClient._instance = None
        yield
        _LazyClient._instance = None

    def test_text_generate_basic(self):
        """Test basic text generation."""
        from blossom_ai import ai

        with patch("blossom_ai.utils.sugar_layer.simple._LazyClient.get") as mock_get:
            mock_client = Mock()
            mock_client.text.generate = AsyncMock(return_value="Generated response")
            mock_get.return_value = mock_client

            result = ai.text.generate("test prompt")
            assert result == "Generated response"
            mock_client.text.generate.assert_called_once()

    def test_text_generate_with_params(self):
        """Test text generation with parameters."""
        from blossom_ai import ai

        with patch("blossom_ai.utils.sugar_layer.simple._LazyClient.get") as mock_get:
            mock_client = Mock()
            mock_client.text.generate = AsyncMock(return_value="Response")
            mock_get.return_value = mock_client

            result = ai.text.generate("test", model="gemini", max_tokens=1000)

            assert result == "Response"
            call_args = mock_client.text.generate.call_args
            assert call_args[0][0] == "test"
            assert call_args[1]["model"] == "gemini"
            assert call_args[1]["max_tokens"] == 1000

    def test_text_stream(self):
        """Test streaming text generation."""
        from blossom_ai import ai

        with patch("blossom_ai.utils.sugar_layer.simple._LazyClient.get") as mock_get:
            mock_client = Mock()
            mock_client.text.generate = AsyncMock(return_value="This is a test response")
            mock_get.return_value = mock_client

            chunks = list(ai.text.stream("test prompt"))
            assert "".join(chunks) == "This is a test response"

    def test_text_chat_simple_format(self):
        """Test chat with simple message format."""
        from blossom_ai import ai

        with patch("blossom_ai.utils.sugar_layer.simple._LazyClient.get") as mock_get:
            mock_client = Mock()
            mock_client.text.chat = AsyncMock(return_value="Chat response")
            mock_get.return_value = mock_client

            history = ["Hello", "Hi there", "How are you?"]
            result = ai.text.chat(history)
            assert result == "Chat response"

            call_args = mock_client.text.chat.call_args
            messages = call_args[0][0]
            assert isinstance(messages, list)
            assert messages[0]["role"] == "user"
            assert messages[0]["content"] == "Hello"

    def test_text_chat_openai_format(self):
        """Test chat with OpenAI message format."""
        from blossom_ai import ai

        with patch("blossom_ai.utils.sugar_layer.simple._LazyClient.get") as mock_get:
            mock_client = Mock()
            mock_client.text.chat = AsyncMock(return_value="Response")
            mock_get.return_value = mock_client

            messages = [
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "Hi"},
                {"role": "user", "content": "Question"},
            ]

            result = ai.text.chat(messages)
            assert result == "Response"
            call_args = mock_client.text.chat.call_args
            assert call_args[0][0] == messages


class TestLazyClient:
    """Tests for lazy client initialization."""

    @pytest.fixture(autouse=True)
    def reset_client(self):
        """Reset lazy client before each test."""
        from blossom_ai.utils.sugar_layer.simple import _LazyClient
        _LazyClient._instance = None
        yield
        _LazyClient._instance = None

    def test_lazy_initialization(self):
        """Test client is created lazily."""
        from blossom_ai.utils.sugar_layer.simple import _LazyClient

        assert _LazyClient._instance is None

        with patch("blossom_ai.client.BlossomClient", create=True) as mock_client_class:
            mock_instance = Mock()
            mock_instance.close = AsyncMock()
            mock_client_class.return_value = mock_instance

            client1 = _LazyClient.get()
            assert _LazyClient._instance is not None
            assert client1 is mock_instance

            client2 = _LazyClient.get()
            assert client1 is client2
            assert mock_client_class.call_count == 1

            _LazyClient.reset()

    def test_reset_client(self):
        """Test resetting the client."""
        from blossom_ai.utils.sugar_layer.simple import _LazyClient

        with patch("blossom_ai.client.BlossomClient", create=True) as mock_client_class:
            mock_instance = Mock()
            mock_instance.close = AsyncMock()
            mock_client_class.return_value = mock_instance

            _ = _LazyClient.get()
            assert _LazyClient._instance is not None

            _LazyClient.reset()
            assert _LazyClient._instance is None


class TestSugarAPI:
    """Tests for main sugar API object."""

    @pytest.fixture(autouse=True)
    def reset_client(self):
        """Reset lazy client before each test."""
        from blossom_ai.utils.sugar_layer.simple import _LazyClient, ai
        _LazyClient._instance = None
        ai.reset()
        yield
        _LazyClient._instance = None
        ai.reset()

    def test_api_properties(self):
        """Test API properties are accessible."""
        from blossom_ai import ai

        assert hasattr(ai, "image")
        assert hasattr(ai, "text")

        from blossom_ai.utils.sugar_layer.simple import _ImageAPI, _TextAPI
        assert isinstance(ai.image, _ImageAPI)
        assert isinstance(ai.text, _TextAPI)

    def test_api_property_caching(self):
        """Test API properties are cached."""
        from blossom_ai import ai

        image1 = ai.image
        image2 = ai.image
        assert image1 is image2  # ✅ Возвращается тот же объект

        text1 = ai.text
        text2 = ai.text
        assert text1 is text2

    def test_api_reset(self):
        """Test resetting API."""
        from blossom_ai import ai

        with patch("blossom_ai.client.BlossomClient", create=True) as mock_client_class:
            mock_instance = Mock()
            mock_instance.close = AsyncMock()
            mock_client_class.return_value = mock_instance

            _ = _LazyClient.get()
            assert _LazyClient._instance is not None

            ai.reset()
            assert _LazyClient._instance is None

    def test_api_repr(self):
        """Test API string representation."""
        from blossom_ai import ai

        repr_str = repr(ai)

        # ✅ Поддерживаем оба варианта
        assert any(text in repr_str for text in ["Sugar API", "LazySugarAPI"])


class TestIntegration:
    """Integration tests with mocked client."""

    @pytest.fixture(autouse=True)
    def reset_client(self):
        """Reset lazy client before each test."""
        from blossom_ai.utils.sugar_layer.simple import _LazyClient, ai
        _LazyClient._instance = None
        ai.reset()
        yield
        _LazyClient._instance = None
        ai.reset()

    def test_full_workflow_image(self, tmp_path):
        """Test complete image generation workflow."""
        from blossom_ai import ai

        with patch("blossom_ai.utils.sugar_layer.simple._LazyClient.get") as mock_get:
            mock_client = Mock()
            mock_client.image.generate = AsyncMock(return_value=b"test_image")
            mock_client.image.save = AsyncMock(return_value=(tmp_path / "out.png").absolute())
            mock_client.image.generate_url = Mock(return_value="https://test.url")
            mock_get.return_value = mock_client

            data = ai.image.generate("test")
            assert data == b"test_image"

            output = tmp_path / "out.png"
            path = ai.image.save("test", str(output))
            assert isinstance(path, Path)

            url = ai.image.url("test")
            assert url == "https://test.url"

    def test_full_workflow_text(self):
        """Test complete text generation workflow."""
        from blossom_ai import ai

        with patch("blossom_ai.utils.sugar_layer.simple._LazyClient.get") as mock_get:
            mock_client = Mock()
            mock_client.text.generate = AsyncMock(return_value="Text response")
            mock_client.text.chat = AsyncMock(return_value="Chat response")
            mock_get.return_value = mock_client

            text = ai.text.generate("Hello")
            assert text == "Text response"

            response = ai.text.chat(["Hello", "Hi"])
            assert response == "Chat response"

            chunks = list(ai.text.stream("Test"))
            assert "".join(chunks) == "Text response"  # Исправлено: stream вызывает generate

    def test_error_propagation(self):
        """Test errors are properly propagated."""
        from blossom_ai import ai
        from blossom_ai.core.errors import BlossomError

        with patch("blossom_ai.utils.sugar_layer.simple._LazyClient.get") as mock_get:
            mock_client = Mock()
            mock_client.text.generate = AsyncMock(side_effect=BlossomError("Test error"))
            mock_get.return_value = mock_client

            with pytest.raises(BlossomError, match="Test error"):
                ai.text.generate("test")


class TestImports:
    """Test module imports work correctly."""

    def test_import_from_main(self):
        """Test importing ai from main module."""
        from blossom_ai import ai
        assert ai is not None

    def test_import_from_utils(self):
        """Test importing ai from utils."""
        from blossom_ai.utils import ai
        assert ai is not None

    def test_import_from_sugar_layer(self):
        """Test importing ai from sugar_layer."""
        from blossom_ai.utils.sugar_layer import ai
        assert ai is not None

    def test_all_imports_same_object(self):
        """Test all imports return same object."""
        from blossom_ai import ai as ai1
        from blossom_ai.utils import ai as ai2
        from blossom_ai.utils.sugar_layer import ai as ai3

        assert ai1 is ai2 is ai3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])