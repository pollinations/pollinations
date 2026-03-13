# tests/test_models.py
"""Tests for models module."""

import pytest
import time
from unittest.mock import Mock, patch, AsyncMock
from blossom_ai.core.models import (
    ModelInfo,
    TextModel,
    ImageModel,
    DynamicModel,
    DEFAULT_TEXT_MODELS,
    DEFAULT_IMAGE_MODELS,
)


class TestModelInfo:
    """Tests for ModelInfo."""

    def test_minimal_model_info(self):
        """Test ModelInfo with minimal data."""
        info = ModelInfo(name="test-model", aliases=[])
        assert info.name == "test-model"
        assert info.aliases == []
        assert info.description is None
        assert info.tier is None

    def test_full_model_info(self):
        """Test ModelInfo with all fields."""
        info = ModelInfo(
            name="test-model",
            aliases=["alias1", "alias2"],
            description="A test model",
            tier="premium"
        )
        assert info.name == "test-model"
        assert info.aliases == ["alias1", "alias2"]
        assert info.description == "A test model"
        assert info.tier == "premium"

    def test_all_identifiers(self):
        """Test all_identifiers property."""
        info = ModelInfo(
            name="main-model",
            aliases=["alias1", "alias2"]
        )
        identifiers = info.all_identifiers
        assert "main-model" in identifiers
        assert "alias1" in identifiers
        assert "alias2" in identifiers
        assert len(identifiers) == 3


class TestTextModel:
    """Tests for TextModel."""

    def setup_method(self):
        """Reset cache before each test."""
        TextModel.reset()

    def teardown_method(self):
        """Clean up after each test."""
        TextModel.reset()

    def test_get_defaults(self):
        """Test default text models."""
        defaults = TextModel.get_defaults()
        assert isinstance(defaults, list)
        assert len(defaults) > 0
        assert "openai" in defaults
        assert "gemini" in defaults
        assert "claude" in defaults
        # Image models should not be in text defaults
        assert "flux" not in defaults

    def test_from_string_valid(self):
        """Test validating valid model name."""
        result = TextModel.from_string("openai")
        assert result == "openai"

    def test_from_string_strips_whitespace(self):
        """Test from_string strips whitespace."""
        result = TextModel.from_string("  custom-model  ")
        assert result == "custom-model"

    def test_from_string_not_string(self):
        """Test from_string with non-string raises error."""
        with pytest.raises(ValueError, match="Model name must be a string"):
            TextModel.from_string(123)

    def test_from_string_empty(self):
        """Test from_string with empty string raises error."""
        with pytest.raises(ValueError, match="Model name cannot be empty"):
            TextModel.from_string("")

    def test_from_string_whitespace_only(self):
        """Test from_string with whitespace only raises error."""
        with pytest.raises(ValueError, match="Model name cannot be empty"):
            TextModel.from_string("   ")

    def test_from_string_custom_model(self):
        """Test from_string accepts custom model names."""
        result = TextModel.from_string("my-custom-model")
        assert result == "my-custom-model"

    @pytest.mark.asyncio
    async def test_afrom_string(self):
        """Test async from_string."""
        result = await TextModel.afrom_string("async-model")
        assert result == "async-model"

    def test_get_all_known(self):
        """Test get_all_known returns defaults."""
        known = TextModel.get_all_known()
        assert isinstance(known, list)
        defaults = TextModel.get_defaults()
        for model in defaults:
            assert model in known

    @pytest.mark.asyncio
    async def test_aget_all_known(self):
        """Test async get_all_known."""
        known = await TextModel.aget_all_known()
        assert isinstance(known, list)
        assert len(known) > 0

    def test_is_known_default_model(self):
        """Test is_known for default models."""
        assert TextModel.is_known("openai") is True
        assert TextModel.is_known("gemini") is True

    def test_is_known_unknown_model(self):
        """Test is_known for unknown models."""
        assert TextModel.is_known("completely-unknown-xyz123") is False

    def test_is_known_after_registration(self):
        """Test is_known after registering model."""
        TextModel.from_string("new-model")
        assert TextModel.is_known("new-model") is True

    @pytest.mark.asyncio
    async def test_ais_known(self):
        """Test async is_known."""
        result = await TextModel.ais_known("openai")
        assert result is True

    def test_cache_ttl(self):
        """Test cache TTL behavior."""
        TextModel._ensure_initialized()
        assert TextModel._cache.initialized is True
        first_timestamp = TextModel._cache.timestamp

        TextModel._ensure_initialized()
        assert TextModel._cache.timestamp == first_timestamp

        TextModel._cache.timestamp = time.time() - 400
        TextModel._ensure_initialized(force=True)
        assert TextModel._cache.timestamp > first_timestamp

    def test_reset_cache(self):
        """Test cache reset."""
        TextModel.from_string("test-model")
        assert TextModel.is_known("test-model")

        TextModel.reset()
        assert TextModel.is_known("test-model") is False

    @patch('blossom_ai.core.models.get_sync_session')
    def test_fallback_on_api_failure(self, mock_session):
        """Test fallback to defaults when API fails."""
        mock_session.return_value.__enter__.side_effect = Exception("API error")

        TextModel.reset()
        result = TextModel._ensure_initialized()

        # Should return False but still work with defaults
        assert result is False
        assert TextModel.is_known("openai") is True

    @patch('blossom_ai.core.models.get_sync_session')
    def test_fetch_models_success(self, mock_session):
        """Test successful model fetching."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {"name": "model1", "aliases": ["m1"]},
            {"name": "model2", "aliases": []}
        ]

        mock_ctx = Mock()
        mock_ctx.__enter__ = Mock(return_value=Mock(get=Mock(return_value=mock_response)))
        mock_ctx.__exit__ = Mock(return_value=False)
        mock_session.return_value = mock_ctx

        TextModel.reset()
        result = TextModel._ensure_initialized()

        assert result is True
        assert TextModel.is_known("model1")
        assert TextModel.is_known("m1")
        assert TextModel.is_known("model2")

    def test_get_model_info_exists(self):
        """Test getting info for existing model."""
        with patch('blossom_ai.core.models.get_sync_session') as mock_session:
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = [
                {
                    "name": "test-model",
                    "aliases": ["tm"],
                    "description": "Test model",
                    "tier": "free"
                }
            ]

            mock_ctx = Mock()
            mock_ctx.__enter__ = Mock(return_value=Mock(get=Mock(return_value=mock_response)))
            mock_ctx.__exit__ = Mock(return_value=False)
            mock_session.return_value = mock_ctx

            TextModel.reset()
            TextModel._ensure_initialized()

            info = TextModel.get_model_info("test-model")
            assert info is not None
            assert info.name == "test-model"
            assert info.description == "Test model"

    def test_get_model_info_not_exists(self):
        """Test getting info for non-existent model."""
        info = TextModel.get_model_info("non-existent-model-xyz")
        assert info is None

    @pytest.mark.asyncio
    async def test_aget_model_info(self):
        """Test async get_model_info."""
        with patch('blossom_ai.core.models.get_async_session') as mock_get_session:
            response_mock = Mock()
            response_mock.status = 200
            response_mock.json = AsyncMock(return_value=[
                {"name": "async-model", "aliases": [], "description": "Async"}
            ])

            response_cm = Mock()
            response_cm.__aenter__ = AsyncMock(return_value=response_mock)
            response_cm.__aexit__ = AsyncMock(return_value=None)

            session_mock = Mock()
            session_mock.get = Mock(return_value=response_cm)

            session_cm = Mock()
            session_cm.__aenter__ = AsyncMock(return_value=session_mock)
            session_cm.__aexit__ = AsyncMock(return_value=None)

            mock_get_session.return_value = session_cm

            TextModel.reset()
            await TextModel._aensure_initialized()

            info = await TextModel.aget_model_info("async-model")
            assert info is not None
            assert info.name == "async-model"

    def test_configure_cache_size(self):
        """Test configuring cache size."""
        TextModel.configure_cache(max_size=100)
        assert TextModel._cache.max_size == 100

    def test_configure_cache_invalid_size(self):
        """Test configuring cache with invalid size."""
        with pytest.raises(ValueError, match="max_size must be positive"):
            TextModel.configure_cache(max_size=0)

    def test_lru_eviction(self):
        """Test LRU eviction when cache is full."""
        TextModel.configure_cache(max_size=3)
        TextModel.reset()

        # Fill cache
        TextModel.from_string("model1")
        TextModel.from_string("model2")
        TextModel.from_string("model3")

        # This should evict model1
        TextModel.from_string("model4")

        known = TextModel.get_all_known()
        assert "model4" in known


class TestImageModel:
    """Tests for ImageModel."""

    def setup_method(self):
        """Reset cache before each test."""
        ImageModel.reset()

    def teardown_method(self):
        """Clean up after each test."""
        ImageModel.reset()

    def test_get_defaults(self):
        """Test default image models."""
        defaults = ImageModel.get_defaults()
        assert isinstance(defaults, list)
        assert len(defaults) > 0
        assert "flux" in defaults
        assert "turbo" in defaults
        # Text models should not be in image defaults
        assert "openai" not in defaults

    def test_from_string_valid(self):
        """Test validating valid model name."""
        result = ImageModel.from_string("flux")
        assert result == "flux"

    def test_is_known_default_model(self):
        """Test is_known for default models."""
        assert ImageModel.is_known("flux") is True
        assert ImageModel.is_known("turbo") is True

    def test_get_all_known(self):
        """Test get_all_known returns defaults."""
        known = ImageModel.get_all_known()
        assert isinstance(known, list)
        defaults = ImageModel.get_defaults()
        for model in defaults:
            assert model in known


class TestDefaultConstants:
    """Tests for default model constants."""

    def test_default_text_models(self):
        """Test DEFAULT_TEXT_MODELS constant."""
        assert isinstance(DEFAULT_TEXT_MODELS, list)
        assert len(DEFAULT_TEXT_MODELS) > 0
        assert "openai" in DEFAULT_TEXT_MODELS

    def test_default_image_models(self):
        """Test DEFAULT_IMAGE_MODELS constant."""
        assert isinstance(DEFAULT_IMAGE_MODELS, list)
        assert len(DEFAULT_IMAGE_MODELS) > 0
        assert "flux" in DEFAULT_IMAGE_MODELS

    def test_no_overlap_between_defaults(self):
        """Test text and image defaults don't overlap."""
        text_set = set(DEFAULT_TEXT_MODELS)
        image_set = set(DEFAULT_IMAGE_MODELS)
        overlap = text_set.intersection(image_set)
        assert len(overlap) == 0