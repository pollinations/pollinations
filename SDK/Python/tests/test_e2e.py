import pytest
import os
import asyncio
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from blossom_ai.client import BlossomClient
from blossom_ai.core.errors import BlossomError
from blossom_ai import ai  # Sugar layer

API_KEY_PRESENT = bool(os.getenv("POLLINATIONS_API_KEY"))

pytestmark = [
    pytest.mark.e2e,
    pytest.mark.skipif(not API_KEY_PRESENT, reason="POLLINATIONS_API_KEY is missing in .env")
]


@pytest.fixture
async def client():
    """Fixture to create and close the client for each test."""
    # The config is pulled automatically from env inside the client's __init__
    async with BlossomClient() as c:
        yield c


class TestE2EText:
    """End-to-end tests for text generation using the real API."""

    @pytest.mark.asyncio
    async def test_simple_text_generation(self, client):
        """Verify basic text generation."""
        prompt = "Say 'Hello E2E Test' and nothing else."
        response = await client.text.generate(prompt, model="openai")

        assert response is not None
        assert isinstance(response, str)
        assert len(response) > 0
        assert "Hello" in response

    @pytest.mark.asyncio
    async def test_chat_context(self, client):
        """Verify chat functionality with message history."""
        messages = [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "What is 2 + 2? Reply with just the number."}
        ]
        response = await client.text.chat(messages, model="openai")

        assert "4" in response

    @pytest.mark.asyncio
    async def test_text_streaming(self, client):
        """Verify streaming logic (response should be gathered correctly)."""
        prompt = "Count from 1 to 5."
        # Enable streaming via parameters
        full_response = await client.text.generate(prompt, stream=True)

        # In your implementation, generate(stream=True) returns the aggregated string
        # while processing chunks internally.
        assert len(full_response) > 0
        assert "1" in full_response
        assert "5" in full_response


class TestE2EImage:
    """End-to-end tests for image generation using the real API."""

    @pytest.mark.asyncio
    async def test_image_generation_binary(self, client):
        """Verify receiving binary image data."""
        prompt = "A red apple on a wooden table, photorealistic"
        image_data = await client.image.generate(
            prompt,
            model="flux",
            width=512,
            height=512
        )

        assert isinstance(image_data, bytes)
        assert len(image_data) > 0

        # Verify magic bytes for PNG or JPEG
        is_png = image_data.startswith(b'\x89PNG')
        is_jpg = image_data.startswith(b'\xff\xd8')
        assert is_png or is_jpg, "API response is not a valid image (PNG/JPG)"

    @pytest.mark.asyncio
    async def test_image_save_to_disk(self, client, tmp_path):
        """Verify saving an image directly to the file system."""
        prompt = "A cute robot logo, vector style"
        output_path = tmp_path / "robot_test.png"

        result_path = await client.image.save(
            prompt,
            output_path,
            width=256,
            height=256
        )

        assert result_path == output_path.resolve()
        assert output_path.exists()
        assert output_path.stat().st_size > 0


class TestE2ESugarLayer:
    """
    Tests for the Simplified API (Sugar Layer).
    Note: These tests are synchronous to avoid event loop conflicts.
    """

    @pytest.fixture(autouse=True)
    def reset_sugar(self):
        ai.reset()
        yield
        ai.reset()

    def test_sugar_text_generate(self):
        """Verify ai.text.generate (lazy initialization, sync call)."""
        response = ai.text.generate("What year is it? Just the number.")
        assert isinstance(response, str)
        assert len(response) > 0
        # The AI might return extra text, but we check for a digit presence
        assert any(char.isdigit() for char in response)

    def test_sugar_image_generate(self):
        """Verify ai.image.generate (sync call)."""
        image_data = ai.image.generate("Blue sky", width=64, height=64)
        assert isinstance(image_data, bytes)
        assert len(image_data) > 100  # Image should not be empty


class TestE2EErrorHandling:
    """Tests for proper error handling from the real API."""

    @pytest.mark.asyncio
    async def test_invalid_model_handling(self, client):
        """The API might fallback to a default model or return an error; it shouldn't crash."""
        try:
            await client.text.generate("Test", model="non-existent-model-xyz-123")
        except BlossomError:
            pass
        except Exception as e:
            pytest.fail(f"Unexpected exception raised: {e}")

    @pytest.mark.asyncio
    async def test_content_filter_safety(self, client):
        """
        Verify that safety flags don't cause the client to crash.
        """
        try:
            await client.image.generate("A harmless kitten", safe=True)
        except Exception as e:
            pytest.fail(f"Request with safe=True failed: {e}")