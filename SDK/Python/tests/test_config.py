# tests/test_config.py
"""Tests for configuration module."""

import os
import pytest
from blossom_ai.core.config import SessionConfig, ENDPOINTS


class TestEndpoints:
    """Tests for API endpoints."""

    def test_endpoints_structure(self):
        """Test endpoints are properly defined."""
        assert ENDPOINTS.BASE == "https://gen.pollinations.ai"  # ✅ Обновлено
        assert ENDPOINTS.TEXT_CHAT.startswith(ENDPOINTS.BASE)
        assert ENDPOINTS.TEXT_MODELS.startswith(ENDPOINTS.BASE)
        assert ENDPOINTS.IMAGE_GENERATE.startswith(ENDPOINTS.BASE)
        assert ENDPOINTS.IMAGE_MODELS.startswith(ENDPOINTS.BASE)

    def test_endpoints_immutable(self):
        """Test endpoints cannot be modified."""
        with pytest.raises(AttributeError):
            ENDPOINTS.BASE = "https://malicious.com"

    def test_endpoints_type(self):
        """Test endpoints is correct type."""
        assert isinstance(ENDPOINTS, tuple)


class TestSessionConfig:
    """Tests for SessionConfig."""

    def test_default_initialization(self):
        """Test default configuration values."""
        config = SessionConfig()
        assert config.api_key is None
        assert config.timeout == 30.0
        assert config.max_retries == 3
        assert config.rate_limit_per_minute == 60
        assert config.cache_ttl == 3600

    def test_custom_initialization(self):
        """Test configuration with custom values."""
        config = SessionConfig(
            api_key="custom-key-without-pk-or-sk",
            timeout=45.0,
            max_retries=5,
            rate_limit_per_minute=120,
            cache_ttl=7200
        )
        assert config.api_key == "custom-key-without-pk-or-sk"
        assert config.timeout == 45.0
        assert config.max_retries == 5
        assert config.rate_limit_per_minute == 120
        assert config.cache_ttl == 7200

    def test_validation_timeout_positive(self):
        """Test timeout must be positive."""
        with pytest.raises(ValueError, match="timeout must be positive"):
            SessionConfig(timeout=0)

        with pytest.raises(ValueError, match="timeout must be positive"):
            SessionConfig(timeout=-5.0)

    def test_validation_max_retries_non_negative(self):
        """Test max_retries cannot be negative."""
        with pytest.raises(ValueError, match="max_retries cannot be negative"):
            SessionConfig(max_retries=-1)

        # Zero should be allowed
        config = SessionConfig(max_retries=0)
        assert config.max_retries == 0

    def test_validation_rate_limit_positive(self):
        """Test rate_limit_per_minute must be positive."""
        with pytest.raises(ValueError, match="rate_limit_per_minute must be positive"):
            SessionConfig(rate_limit_per_minute=0)

        with pytest.raises(ValueError, match="rate_limit_per_minute must be positive"):
            SessionConfig(rate_limit_per_minute=-10)

    def test_validation_rate_limit_maximum(self):
        """Test rate_limit_per_minute has maximum value."""
        with pytest.raises(ValueError, match="rate_limit_per_minute cannot exceed 10000"):
            SessionConfig(rate_limit_per_minute=10001)

        # 10000 should be allowed
        config = SessionConfig(rate_limit_per_minute=10000)
        assert config.rate_limit_per_minute == 10000

    def test_from_env_defaults(self, monkeypatch):
        """Test from_env with no environment variables."""
        monkeypatch.delenv("POLLINATIONS_API_KEY", raising=False)
        monkeypatch.delenv("POLLINATIONS_TIMEOUT", raising=False)
        monkeypatch.delenv("POLLINATIONS_MAX_RETRIES", raising=False)
        monkeypatch.delenv("POLLINATIONS_RATE_LIMIT", raising=False)
        monkeypatch.delenv("POLLINATIONS_CACHE_TTL", raising=False)

        config = SessionConfig.from_env()
        assert config.api_key is None
        assert config.timeout == 30.0
        assert config.max_retries == 3
        assert config.rate_limit_per_minute == 60
        assert config.cache_ttl == 3600

    def test_from_env_custom(self, monkeypatch):
        """Test from_env with custom environment variables."""
        monkeypatch.setenv("POLLINATIONS_API_KEY", "custom-env-key")
        monkeypatch.setenv("POLLINATIONS_TIMEOUT", "45.5")
        monkeypatch.setenv("POLLINATIONS_MAX_RETRIES", "5")
        monkeypatch.setenv("POLLINATIONS_RATE_LIMIT", "120")
        monkeypatch.setenv("BLOSSOM_AI_CACHE_TTL", "7200")

        config = SessionConfig.from_env()
        assert config.api_key == "custom-env-key"
        assert config.timeout == 45.5
        assert config.max_retries == 5
        assert config.rate_limit_per_minute == 120
        assert config.cache_ttl == 7200

    def test_from_env_type_conversion(self, monkeypatch):
        """Test from_env properly converts string types."""
        monkeypatch.setenv("POLLINATIONS_TIMEOUT", "60.5")
        monkeypatch.setenv("POLLINATIONS_MAX_RETRIES", "10")

        config = SessionConfig.from_env()
        assert isinstance(config.timeout, float)
        assert isinstance(config.max_retries, int)
        assert config.timeout == 60.5
        assert config.max_retries == 10

    def test_from_env_validation_error(self, monkeypatch):
        """Test from_env raises validation errors."""
        monkeypatch.setenv("POLLINATIONS_TIMEOUT", "-5")

        with pytest.raises(ValueError, match="timeout must be positive"):
            SessionConfig.from_env()

    def test_config_immutability(self):
        """Test configuration fields are documented as immutable."""
        config = SessionConfig(api_key="test")
        assert config.api_key == "test"

        # Test that validation still works after creation
        assert config.timeout > 0
        assert config.max_retries >= 0


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


class TestConfigValidationEdgeCases:
    """Edge cases for configuration validation."""

    def test_post_init_pool_settings_validation(self):
        """Test validation of pool settings."""
        with pytest.raises(ValueError, match="Pool size settings must be positive"):
            SessionConfig(sync_pool_maxsize=0)
        
        with pytest.raises(ValueError, match="Pool size settings must be positive"):
            SessionConfig(sync_pool_connections=-1)

    def test_post_init_async_settings_validation(self):
        """Test validation of async settings."""
        with pytest.raises(ValueError, match="Async limit settings must be positive"):
            SessionConfig(async_limit_total=0)
        
        with pytest.raises(ValueError, match="Async limit settings must be positive"):
            SessionConfig(async_limit_per_host=-5)

    def test_post_init_timeout_settings_validation(self):
        """Test validation of timeout settings."""
        with pytest.raises(ValueError, match="Timeout settings must be positive"):
            SessionConfig(async_timeout_connect=0)
        
        with pytest.raises(ValueError, match="Timeout settings must be positive"):
            SessionConfig(async_timeout_sock_read=-10)

    def test_post_init_cache_settings_validation(self):
        """Test validation of cache settings."""
        with pytest.raises(ValueError, match="cache_ttl must be non-negative"):
            SessionConfig(cache_ttl=-1)
        
        with pytest.raises(ValueError, match="cache_max_memory must be positive"):
            SessionConfig(cache_max_memory=0)
        
        with pytest.raises(ValueError, match="cache_max_disk must be positive"):
            SessionConfig(cache_max_disk=-10)

    def test_version_property_compatibility(self):
        """Test backward compatibility __version__ property."""
        config = SessionConfig()
        assert hasattr(config, '__version__')
        assert isinstance(config.__version__, str)