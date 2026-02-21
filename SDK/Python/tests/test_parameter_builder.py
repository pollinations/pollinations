# tests/test_parameter_builder.py
"""Tests for parameter builder module."""

import pytest
import base64
from pathlib import Path
from unittest.mock import patch, mock_open
from blossom_ai.generators.parameter_builder import (
    ImageParamsV2,
    ChatParamsV2,
    MessageBuilder,
    ParameterValidator,
    _Validators,
    DEFAULTS,
    LIMITS,
    REASONING,
)
from blossom_ai.core.errors import BlossomError


class TestValidators:
    """Tests for validation functions."""

    def test_positive_int_valid(self):
        """Test positive_int with valid values."""
        assert _Validators.positive_int(1, "test") == 1
        assert _Validators.positive_int(100, "test") == 100
        assert _Validators.positive_int(999999, "test") == 999999

    def test_positive_int_zero(self):
        """Test positive_int with zero raises error."""
        with pytest.raises(BlossomError, match="test must be positive"):
            _Validators.positive_int(0, "test")

    def test_positive_int_negative(self):
        """Test positive_int with negative raises error."""
        with pytest.raises(BlossomError, match="test must be positive"):
            _Validators.positive_int(-1, "test")

    def test_range_check_valid(self):
        """Test range_check with valid values."""
        assert _Validators.range_check(0.0, 0.0, 1.0, "test") == 0.0
        assert _Validators.range_check(0.5, 0.0, 1.0, "test") == 0.5
        assert _Validators.range_check(1.0, 0.0, 1.0, "test") == 1.0

    def test_range_check_below_range(self):
        """Test range_check below range raises error."""
        with pytest.raises(BlossomError, match=r"test must be in \[0.0, 1.0\]"):
            _Validators.range_check(-0.1, 0.0, 1.0, "test")

    def test_range_check_above_range(self):
        """Test range_check above range raises error."""
        with pytest.raises(BlossomError, match=r"test must be in \[0.0, 1.0\]"):
            _Validators.range_check(1.1, 0.0, 1.0, "test")

    def test_choice_valid(self):
        """Test choice with valid value."""
        choices = ("a", "b", "c")
        assert _Validators.choice("a", choices, "test") == "a"
        assert _Validators.choice("b", choices, "test") == "b"

    def test_choice_invalid(self):
        """Test choice with invalid value raises error."""
        choices = ("a", "b")
        with pytest.raises(BlossomError) as exc:
            _Validators.choice("c", choices, "test")

        assert "a, b" in exc.value.suggestion

    def test_prompt_length_valid(self):
        """Test prompt_length with valid length."""
        short_prompt = "x" * 100
        _Validators.prompt_length(short_prompt, 1000, "test")

    def test_prompt_length_too_long(self):
        """Test prompt_length with too long prompt."""
        long_prompt = "x" * 1001
        with pytest.raises(BlossomError, match="exceeds 1,000 characters"):
            _Validators.prompt_length(long_prompt, 1000, "test")

    def test_dimensions_valid(self):
        """Test dimensions with valid values."""
        _Validators.dimensions(64, 64, min_=64, max_=2048)
        _Validators.dimensions(1024, 768, min_=64, max_=2048)
        _Validators.dimensions(2048, 2048, min_=64, max_=2048)

    def test_dimensions_below_min(self):
        """Test dimensions below minimum."""
        with pytest.raises(BlossomError, match="Dimensions must be within"):
            _Validators.dimensions(63, 1024, min_=64, max_=2048)

    def test_dimensions_above_max(self):
        """Test dimensions above maximum."""
        with pytest.raises(BlossomError, match="Dimensions must be within"):
            _Validators.dimensions(1024, 2049, min_=64, max_=2048)

    def test_reasoning_effort_valid(self):
        """Test reasoning_effort with valid values."""
        for effort in REASONING.EFFORTS:
            result = _Validators.reasoning_effort(effort)
            assert result == effort

    def test_reasoning_effort_invalid(self):
        """Test reasoning_effort with invalid value."""
        with pytest.raises(BlossomError, match="Invalid reasoning effort"):
            _Validators.reasoning_effort("extreme")


class TestImageParamsV2:
    """Tests for ImageParamsV2."""

    def test_default_initialization(self):
        """Test default parameter values."""
        params = ImageParamsV2()
        assert params.model == DEFAULTS.IMAGE_MODEL
        assert params.width == DEFAULTS.IMAGE_WIDTH
        assert params.height == DEFAULTS.IMAGE_HEIGHT
        assert params.seed == 42
        assert params.enhance is False
        assert params.negative_prompt == ""
        assert params.private is False
        assert params.nologo is False
        assert params.safe is False
        assert params.quality == DEFAULTS.IMAGE_QUALITY  # medium (исправлено)
        assert params.transparent is False

    def test_custom_initialization(self):
        """Test custom parameter values."""
        params = ImageParamsV2(
            model="turbo",
            width=512,
            height=768,
            seed=999,
            enhance=True,
            negative_prompt="blurry",
            quality="hd",
            private=True,
            nologo=True,
            safe=True,
            transparent=True,
            guidance_scale=7.5,
            style="cartoon"
        )

        assert params.model == "turbo"
        assert params.width == 512
        assert params.height == 768
        assert params.seed == 999
        assert params.enhance is True
        assert params.negative_prompt == "blurry"
        assert params.quality == "hd"
        assert params.private is True
        assert params.nologo is True
        assert params.safe is True
        assert params.transparent is True
        assert params.guidance_scale == 7.5
        assert params.style == "cartoon"

    def test_validation_negative_width(self):
        """Test negative width raises error."""
        with pytest.raises(BlossomError, match="width must be positive"):
            ImageParamsV2(width=-100)

    def test_validation_negative_height(self):
        """Test negative height raises error."""
        with pytest.raises(BlossomError, match="height must be positive"):
            ImageParamsV2(height=-500)

    def test_validation_zero_dimensions(self):
        """Test zero dimensions raise error."""
        with pytest.raises(BlossomError, match="width must be positive"):
            ImageParamsV2(width=0)

        with pytest.raises(BlossomError, match="height must be positive"):
            ImageParamsV2(height=0)

    def test_validation_negative_prompt_length(self):
        """Test negative_prompt length limit."""
        long_prompt = "x" * (LIMITS.MAX_IMAGE_PROMPT_LENGTH + 1)
        with pytest.raises(BlossomError, match="negative_prompt exceeds"):
            ImageParamsV2(negative_prompt=long_prompt)

    def test_to_dict_includes_all(self):
        """Test to_dict includes all parameters."""
        params = ImageParamsV2(
            model="turbo",
            width=512,
            quality="hd"
        )

        d = params.to_dict()
        assert d["model"] == "turbo"
        assert d["width"] == 512
        assert d["quality"] == "hd"

    def test_to_dict_excludes_defaults(self):
        """Test to_dict excludes defaults when requested."""
        params = ImageParamsV2(width=512)  # Only width is non-default
        d = params.to_dict(include_defaults=False)

        assert "width" in d
        assert d["width"] == 512

    def test_to_query_string(self):
        """Test query string generation."""
        params = ImageParamsV2(
            model="turbo",
            width=512,
            height=768,
            seed=999,
            quality="hd"
        )

        query = params.to_query()
        assert "model=turbo" in query
        assert "width=512" in query
        assert "height=768" in query
        assert "seed=999" in query
        assert "quality=hd" in query

    def test_to_query_bool_conversion(self):
        """Test boolean values converted to lowercase strings."""
        params = ImageParamsV2(enhance=True, private=True)
        query = params.to_query()

        assert "enhance=true" in query.lower()
        assert "private=true" in query.lower()

    def test_to_query_full_url_compatibility(self):
        params = ImageParamsV2(
            model="turbo",
            width=1024,
            height=1024,
            quality="hd",
            enhance=True
        )

        query = params.to_query()

        # Verify all parameters are present and correctly formatted
        assert "model=turbo" in query
        assert "width=1024" in query
        assert "height=1024" in query
        assert "quality=hd" in query
        assert "enhance=true" in query

    def test_immutability(self):
        """Test params are immutable."""
        params = ImageParamsV2()
        with pytest.raises(AttributeError):
            params.width = 999


class TestChatParamsV2:
    """Tests for ChatParamsV2."""

    def test_default_initialization(self):
        """Test default parameter values."""
        params = ChatParamsV2()
        assert params.model == DEFAULTS.TEXT_MODEL
        assert params.messages == []
        assert params.temperature == 1.0
        assert params.max_tokens is None
        assert params.stream is False
        assert params.json_mode is False
        assert params.top_p == 1.0
        assert params.n == 1
        assert params.frequency_penalty == 0.0
        assert params.presence_penalty == 0.0

    def test_custom_initialization(self):
        """Test custom parameter values."""
        messages = [{"role": "user", "content": "Hello"}]
        params = ChatParamsV2(
            model="gemini",
            messages=messages,
            temperature=0.7,
            max_tokens=500,
            stream=True,
            json_mode=True,
            top_p=0.9,
            n=2,
            frequency_penalty=0.5,
            presence_penalty=0.3,
            reasoning_effort="high"
        )

        assert params.model == "gemini"
        assert params.messages == messages
        assert params.temperature == 0.7
        assert params.max_tokens == 500
        assert params.stream is True
        assert params.json_mode is True
        assert params.top_p == 0.9
        assert params.n == 2
        assert params.frequency_penalty == 0.5
        assert params.presence_penalty == 0.3
        assert params.reasoning_effort == "high"

    def test_validation_temperature_range(self):
        """Test temperature validation."""
        ChatParamsV2(temperature=0.0)
        ChatParamsV2(temperature=2.0)

        with pytest.raises(BlossomError, match=r"temperature must be in \[0.0, 2.0\]"):
            ChatParamsV2(temperature=-0.1)

        with pytest.raises(BlossomError, match=r"temperature must be in \[0.0, 2.0\]"):
            ChatParamsV2(temperature=2.1)

    def test_validation_top_p_range(self):
        """Test top_p validation."""
        ChatParamsV2(top_p=0.0)
        ChatParamsV2(top_p=1.0)

        with pytest.raises(BlossomError, match=r"top_p must be in \[0.0, 1.0\]"):
            ChatParamsV2(top_p=-0.1)

        with pytest.raises(BlossomError, match=r"top_p must be in \[0.0, 1.0\]"):
            ChatParamsV2(top_p=1.1)

    def test_validation_max_tokens_positive(self):
        """Test max_tokens validation."""
        ChatParamsV2(max_tokens=100)
        ChatParamsV2(max_tokens=None)

        with pytest.raises(BlossomError, match="max_tokens must be positive"):
            ChatParamsV2(max_tokens=0)

        with pytest.raises(BlossomError, match="max_tokens must be positive"):
            ChatParamsV2(max_tokens=-100)

    def test_validation_reasoning_effort(self):
        """Test reasoning_effort validation."""
        for effort in REASONING.EFFORTS:
            ChatParamsV2(reasoning_effort=effort)

        with pytest.raises(BlossomError, match="Invalid reasoning effort"):
            ChatParamsV2(reasoning_effort="extreme")

    def test_to_body_basic(self):
        """Test to_body with basic parameters."""
        messages = [{"role": "user", "content": "Test"}]
        params = ChatParamsV2(
            model="openai",
            messages=messages,
            max_tokens=100
        )

        body = params.to_body()
        assert body["model"] == "openai"
        assert body["messages"] == messages
        assert body["max_tokens"] == 100

    def test_to_body_excludes_default_temperature(self):
        """Test to_body excludes temperature if default."""
        params = ChatParamsV2(temperature=1.0)
        body = params.to_body()
        assert "temperature" not in body

    def test_to_body_includes_non_default_temperature(self):
        """Test to_body includes non-default temperature."""
        params = ChatParamsV2(temperature=0.7)
        body = params.to_body()
        assert body["temperature"] == 0.7

    def test_to_body_with_stream(self):
        """Test to_body includes stream flag."""
        params = ChatParamsV2(stream=True)
        body = params.to_body()
        assert body["stream"] is True

    def test_to_body_prompt_length_validation(self):
        """Test to_body validates total prompt length."""
        long_content = "x" * (LIMITS.MAX_TEXT_PROMPT_LENGTH + 1)
        messages = [{"role": "user", "content": long_content}]
        params = ChatParamsV2(messages=messages)

        with pytest.raises(BlossomError, match="exceeds limit"):
            params.to_body()

    def test_extra_params(self):
        """Test extra_params field."""
        extra = {"custom_field": "value"}
        params = ChatParamsV2(extra_params=extra)
        body = params.to_body()
        assert body["custom_field"] == "value"

    def test_immutability(self):
        """Test params are immutable."""
        params = ChatParamsV2()
        with pytest.raises(AttributeError):
            params.temperature = 0.5


class TestMessageBuilder:
    """Tests for MessageBuilder."""

    def test_text_message(self):
        """Test creating text message."""
        msg = MessageBuilder.text("user", "Hello world")
        assert msg["role"] == "user"
        assert msg["content"] == "Hello world"
        assert "name" not in msg

    def test_text_message_with_name(self):
        """Test creating text message with name."""
        msg = MessageBuilder.text("user", "Hello", name="Alice")
        assert msg["role"] == "user"
        assert msg["content"] == "Hello"
        assert msg["name"] == "Alice"

    def test_image_message_with_url(self):
        """Test creating image message with URL."""
        msg = MessageBuilder.image(
            role="user",
            text="Describe this",
            image_url="https://example.com/image.jpg",
            detail="high"
        )

        assert msg["role"] == "user"
        content = msg["content"]
        assert len(content) == 2
        assert content[0]["type"] == "text"
        assert content[0]["text"] == "Describe this"
        assert content[1]["type"] == "image_url"
        assert content[1]["image_url"]["url"] == "https://example.com/image.jpg"
        assert content[1]["image_url"]["detail"] == "high"

    @patch("pathlib.Path.exists", return_value=True)
    @patch("pathlib.Path.read_bytes", return_value=b"fake_image_data")
    @patch("mimetypes.guess_type", return_value=("image/png", None))
    def test_image_message_with_path(self, mock_guess, mock_read, mock_exists):
        """Test creating image message with file path."""
        msg = MessageBuilder.image(
            role="user",
            text="Analyze",
            image_path="/tmp/test.png"
        )

        content = msg["content"]
        assert content[1]["type"] == "image_url"
        assert "data:image/png;base64," in content[1]["image_url"]["url"]
        assert content[1]["image_url"]["detail"] == "auto"

    def test_image_message_with_binary_data(self):
        """Test creating image message with binary data."""
        image_data = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"

        msg = MessageBuilder.image(
            role="user",
            text="What is this?",
            image_data=image_data
        )

        content = msg["content"]
        assert "data:image/jpeg;base64," in content[1]["image_url"]["url"]

        encoded_part = content[1]["image_url"]["url"].split(",")[1]
        decoded = base64.b64decode(encoded_part)
        assert decoded == image_data

    def test_image_message_no_source_error(self):
        """Test error when no image source provided."""
        with pytest.raises(ValueError, match="One image source required"):
            MessageBuilder.image(role="user", text="No image")


class TestConstants:
    """Tests for constant values."""

    def test_defaults_exist(self):
        """Test default constants are defined."""
        assert hasattr(DEFAULTS, 'IMAGE_MODEL')
        assert hasattr(DEFAULTS, 'IMAGE_WIDTH')
        assert hasattr(DEFAULTS, 'IMAGE_HEIGHT')
        assert hasattr(DEFAULTS, 'TEXT_MODEL')

    def test_limits_exist(self):
        """Test limit constants are defined."""
        assert hasattr(LIMITS, 'MAX_IMAGE_PROMPT_LENGTH')
        assert hasattr(LIMITS, 'MAX_TEXT_PROMPT_LENGTH')

    def test_reasoning_efforts(self):
        """Test reasoning effort constants."""
        assert REASONING.EFFORTS == ("low", "medium", "high")