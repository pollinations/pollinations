# 🔨 Builder Pattern Guide

> **Implementing and using the Builder pattern in Blossom AI**

---

## Overview

The Builder pattern constructs complex objects step by step. It's ideal when you need to create objects with many optional parameters or complex configuration.

---

## When to Use Builder Pattern

| Use Case | Example |
|----------|---------|
| **Complex objects** | SessionConfig with 20+ parameters |
| **Multiple representations** | Different cache configurations |
| **Step-by-step construction** | Building API requests |
| **Immutable objects** | Configuration objects |
| **Validation** | Validate before creating object |

---

## Built-in Builders

### SessionConfig Builder

```python
from blossom_ai import SessionConfig

# Simple builder pattern using keyword arguments
config = SessionConfig(
    api_key="your-key",
    timeout=30.0,
    max_retries=3,
    rate_limit_per_minute=60,
    cache_enabled=True,
    cache_backend="hybrid",
    cache_ttl=3600
)
```

**Benefits:**
- Named parameters
- Type safety
- Validation on creation
- Immutable after creation

---

### CacheConfig Builder

```python
from blossom_ai.utils.cache import CacheConfig, CacheBackend

# Build cache configuration
cache_config = CacheConfig(
    enabled=True,
    backend=CacheBackend.HYBRID,
    ttl=3600,
    max_memory_size=100,
    max_disk_size=1000,
    compress=True,
    cache_text=True,
    cache_images=False
)
```

---

## Creating Custom Builders

### Simple Builder

```python
class ClientBuilder:
    """Builder for creating configured BlossomClient instances."""
    
    def __init__(self):
        self._api_key = None
        self._timeout = 30.0
        self._max_retries = 3
        self._rate_limit = 60
        self._cache_enabled = True
        self._log_level = "INFO"
    
    def with_api_key(self, api_key: str) -> "ClientBuilder":
        """Set API key."""
        self._api_key = api_key
        return self
    
    def with_timeout(self, timeout: float) -> "ClientBuilder":
        """Set request timeout."""
        self._timeout = timeout
        return self
    
    def with_max_retries(self, max_retries: int) -> "ClientBuilder":
        """Set maximum retries."""
        self._max_retries = max_retries
        return self
    
    def with_rate_limit(self, rate_limit: int) -> "ClientBuilder":
        """Set rate limit per minute."""
        self._rate_limit = rate_limit
        return self
    
    def with_cache(self, enabled: bool = True) -> "ClientBuilder":
        """Enable or disable caching."""
        self._cache_enabled = enabled
        return self
    
    def with_log_level(self, level: str) -> "ClientBuilder":
        """Set logging level."""
        self._log_level = level
        return self
    
    def build(self) -> "BlossomClient":
        """Build the configured client."""
        
        config = SessionConfig(
            api_key=self._api_key,
            timeout=self._timeout,
            max_retries=self._max_retries,
            rate_limit_per_minute=self._rate_limit,
            cache_enabled=self._cache_enabled,
            log_level=self._log_level
        )
        
        return BlossomClient(config=config)

# Usage
builder = ClientBuilder()

client = (builder
    .with_api_key("your-key")
    .with_timeout(60.0)
    .with_max_retries(5)
    .with_rate_limit(1000)
    .with_cache(True)
    .with_log_level("WARNING")
    .build()
)
```

---

### Step-by-Step Builder

```python
class ProductionClientBuilder:
    """Builder for production-ready clients."""
    
    def __init__(self):
        self.config = {}
    
    def configure_auth(self, api_key: str) -> "ProductionClientBuilder":
        """Configure authentication."""
        self.config["api_key"] = api_key
        return self
    
    def configure_performance(
        self,
        timeout: float = 60.0,
        max_retries: int = 3,
        rate_limit: int = 10000
    ) -> "ProductionClientBuilder":
        """Configure performance settings."""
        self.config.update({
            "timeout": timeout,
            "max_retries": max_retries,
            "rate_limit_per_minute": rate_limit
        })
        return self
    
    def configure_caching(
        self,
        enabled: bool = True,
        backend: str = "hybrid",
        ttl: int = 7200
    ) -> "ProductionClientBuilder":
        """Configure caching."""
        self.config.update({
            "cache_enabled": enabled,
            "cache_backend": backend,
            "cache_ttl": ttl
        })
        return self
    
    def configure_monitoring(
        self,
        log_level: str = "WARNING",
        log_requests: bool = False
    ) -> "ProductionClientBuilder":
        """Configure monitoring."""
        self.config.update({
            "log_level": log_level,
            "log_requests": log_requests
        })
        return self
    
    def build(self) -> "BlossomClient":
        """Build production client."""
        
        # Validate required fields
        if not self.config.get("api_key"):
            raise ValueError("API key is required for production")
        
        # Create configuration
        session_config = SessionConfig(**self.config)
        
        # Create client
        return BlossomClient(config=session_config)

# Usage
builder = ProductionClientBuilder()

client = (builder
    .configure_auth("sk_live_...")
    .configure_performance(timeout=120.0, rate_limit=50000)
    .configure_caching(enabled=True, backend="hybrid", ttl=86400)
    .configure_monitoring(log_level="ERROR", log_requests=False)
    .build()
)
```

---

### Fluent Builder with Validation

```python
class ValidatingConfigBuilder:
    """Builder with built-in validation."""
    
    def __init__(self):
        self._config = {}
    
    def with_api_key(self, api_key: str) -> "ValidatingConfigBuilder":
        """Set and validate API key."""
        if not api_key or not api_key.strip():
            raise ValueError("API key cannot be empty")
        
        if not api_key.startswith(("pk_", "sk_")):
            raise ValueError("API key must start with 'pk_' or 'sk_'")
        
        self._config["api_key"] = api_key
        return self
    
    def with_timeout(self, timeout: float) -> "ValidatingConfigBuilder":
        """Set and validate timeout."""
        if timeout <= 0:
            raise ValueError("Timeout must be positive")
        
        if timeout > 300:
            raise ValueError("Timeout cannot exceed 300 seconds")
        
        self._config["timeout"] = timeout
        return self
    
    def with_rate_limit(self, rate_limit: int) -> "ValidatingConfigBuilder":
        """Set and validate rate limit."""
        if rate_limit <= 0:
            raise ValueError("Rate limit must be positive")
        
        if rate_limit > 100000:
            raise ValueError("Rate limit cannot exceed 100,000 per minute")
        
        self._config["rate_limit_per_minute"] = rate_limit
        return self
    
    def build(self) -> SessionConfig:
        """Build validated configuration."""
        
        # Set defaults
        defaults = {
            "timeout": 30.0,
            "max_retries": 3,
            "rate_limit_per_minute": 60,
            "cache_enabled": True
        }
        
        # Merge with user config
        final_config = {**defaults, **self._config}
        
        # Final validation
        if "api_key" not in final_config:
            raise ValueError("API key is required")
        
        return SessionConfig(**final_config)

# Usage
try:
    config = (ValidatingConfigBuilder()
        .with_api_key("sk_live_abc123")
        .with_timeout(60.0)
        .with_rate_limit(1000)
        .build()
    )
except ValueError as e:
    print(f"Validation failed: {e}")
```

---

## Advanced Builder Patterns

### Builder with Defaults

```python
class EnvironmentAwareBuilder:
    """Builder that sets defaults based on environment."""
    
    def __init__(self, environment: str = "development"):
        self.environment = environment
        self._config = {}
    
    def with_defaults(self) -> "EnvironmentAwareBuilder":
        """Set environment-specific defaults."""
        
        if self.environment == "production":
            self._config.update({
                "timeout": 60.0,
                "max_retries": 3,
                "rate_limit_per_minute": 10000,
                "log_level": "WARNING",
                "verify_ssl": True
            })
        
        elif self.environment == "testing":
            self._config.update({
                "timeout": 5.0,
                "max_retries": 0,
                "rate_limit_per_minute": 100,
                "log_level": "DEBUG",
                "test_mode": True
            })
        
        else:  # development
            self._config.update({
                "timeout": 30.0,
                "max_retries": 2,
                "rate_limit_per_minute": 60,
                "log_level": "INFO",
                "log_requests": True
            })
        
        return self
    
    def with_overrides(self, **kwargs) -> "EnvironmentAwareBuilder":
        """Override specific values."""
        self._config.update(kwargs)
        return self
    
    def build(self) -> SessionConfig:
        """Build configuration."""
        return SessionConfig(**self._config)

# Usage
# Production
prod_config = (EnvironmentAwareBuilder("production")
    .with_defaults()
    .with_overrides(api_key="sk_live_...")
    .build()
)

# Testing
test_config = (EnvironmentAwareBuilder("testing")
    .with_defaults()
    .build()
)
```

---

### Builder with Inheritance

```python
class BaseClientBuilder:
    """Base builder with common functionality."""
    
    def __init__(self):
        self._config = {}
    
    def with_api_key(self, api_key: str) -> "BaseClientBuilder":
        self._config["api_key"] = api_key
        return self
    
    def with_timeout(self, timeout: float) -> "BaseClientBuilder":
        self._config["timeout"] = timeout
        return self
    
    def build_config(self) -> Dict:
        """Build base configuration."""
        return self._config.copy()

class TextClientBuilder(BaseClientBuilder):
    """Builder for text-specific configuration."""
    
    def with_text_model(self, model: str) -> "TextClientBuilder":
        """Set text generation model."""
        self._config["text_model"] = model
        return self
    
    def with_max_tokens(self, max_tokens: int) -> "TextClientBuilder":
        """Set maximum tokens for text generation."""
        self._config["max_tokens"] = max_tokens
        return self
    
    def build(self) -> BlossomClient:
        """Build text-focused client."""
        config = SessionConfig(**self.build_config())
        return BlossomClient(config=config)

class ImageClientBuilder(BaseClientBuilder):
    """Builder for image-specific configuration."""
    
    def with_image_model(self, model: str) -> "ImageClientBuilder":
        """Set image generation model."""
        self._config["image_model"] = model
        return self
    
    def with_default_size(self, width: int, height: int) -> "ImageClientBuilder":
        """Set default image size."""
        self._config.update({
            "default_width": width,
            "default_height": height
        })
        return self
    
    def build(self) -> BlossomClient:
        """Build image-focused client."""
        config = SessionConfig(**self.build_config())
        return BlossomClient(config=config)

# Usage
text_client = (TextClientBuilder()
    .with_api_key("your-key")
    .with_timeout(60.0)
    .with_text_model("openai")
    .with_max_tokens(1000)
    .build()
)

image_client = (ImageClientBuilder()
    .with_api_key("your-key")
    .with_timeout(120.0)
    .with_image_model("flux")
    .with_default_size(1024, 1024)
    .build()
)
```

---

### Builder with Callbacks

```python
class CallbackBuilder:
    """Builder that supports callbacks for customization."""
    
    def __init__(self):
        self._config = {}
        self._callbacks = []
    
    def with_config(self, key: str, value: Any) -> "CallbackBuilder":
        """Set configuration value."""
        self._config[key] = value
        return self
    
    def with_callback(self, callback: Callable) -> "CallbackBuilder":
        """Add customization callback."""
        self._callbacks.append(callback)
        return self
    
    def build(self) -> SessionConfig:
        """Build configuration with callbacks."""
        config = SessionConfig(**self._config)
        
        # Apply callbacks
        for callback in self._callbacks:
            config = callback(config)
        
        return config

# Usage
def add_custom_headers(config: SessionConfig) -> SessionConfig:
    """Callback to add custom headers."""
    # Custom logic here
    return config

def setup_monitoring(config: SessionConfig) -> SessionConfig:
    """Callback to setup monitoring."""
    # Custom logic here
    return config

config = (CallbackBuilder()
    .with_config("api_key", "your-key")
    .with_callback(add_custom_headers)
    .with_callback(setup_monitoring)
    .build()
)
```

---

## Request Builders

### API Request Builder

```python
class TextGenerationRequestBuilder:
    """Builder for text generation requests."""
    
    def __init__(self, prompt: str):
        self._request = {
            "prompt": prompt,
            "model": "openai",
            "temperature": 0.7,
            "max_tokens": None
        }
    
    def with_model(self, model: str) -> "TextGenerationRequestBuilder":
        """Set model."""
        self._request["model"] = model
        return self
    
    def with_temperature(self, temperature: float) -> "TextGenerationRequestBuilder":
        """Set temperature."""
        if not 0 <= temperature <= 2:
            raise ValueError("Temperature must be 0-2")
        self._request["temperature"] = temperature
        return self
    
    def with_max_tokens(self, max_tokens: int) -> "TextGenerationRequestBuilder":
        """Set max tokens."""
        if max_tokens <= 0:
            raise ValueError("Max tokens must be positive")
        self._request["max_tokens"] = max_tokens
        return self
    
    def with_system_prompt(self, system_prompt: str) -> "TextGenerationRequestBuilder":
        """Set system prompt for chat."""
        self._request["system_prompt"] = system_prompt
        return self
    
    def build(self) -> Dict[str, Any]:
        """Build request dictionary."""
        return self._request.copy()

# Usage
request = (TextGenerationRequestBuilder("Write a story")
    .with_model("gemini")
    .with_temperature(0.8)
    .with_max_tokens(500)
    .with_system_prompt("You are a creative writer.")
    .build()
)

result = await client.text.generate(**request)
```

---

### Image Generation Request Builder

```python
class ImageGenerationRequestBuilder:
    """Builder for image generation requests."""
    
    def __init__(self, prompt: str):
        self._request = {
            "prompt": prompt,
            "model": "flux",
            "width": 1024,
            "height": 1024,
            "quality": "normal"
        }
    
    def with_model(self, model: str) -> "ImageGenerationRequestBuilder":
        """Set image model."""
        self._request["model"] = model
        return self
    
    def with_size(self, width: int, height: int) -> "ImageGenerationRequestBuilder":
        """Set image dimensions."""
        if not (64 <= width <= 2048):
            raise ValueError("Width must be 64-2048")
        if not (64 <= height <= 2048):
            raise ValueError("Height must be 64-2048")
        
        self._request.update({"width": width, "height": height})
        return self
    
    def with_quality(self, quality: str) -> "ImageGenerationRequestBuilder"::
        """Set image quality."""
        if quality not in ["normal", "hd"]:
            raise ValueError("Quality must be 'normal' or 'hd'")
        self._request["quality"] = quality
        return self
    
    def with_style(self, style: str) -> "ImageGenerationRequestBuilder":
        """Add style modifier."""
        self._request["style"] = style
        return self
    
    def with_negative_prompt(self, negative: str) -> "ImageGenerationRequestBuilder":
        """Set negative prompt."""
        self._request["negative_prompt"] = negative
        return self
    
    def build(self) -> Dict[str, Any]:
        """Build request dictionary."""
        return self._request.copy()

# Usage
request = (ImageGenerationRequestBuilder("A futuristic city")
    .with_model("flux-realism")
    .with_size(1536, 1024)
    .with_quality("hd")
    .with_style("photorealistic")
    .with_negative_prompt("blurry, low quality")
    .build()
)

image_data = await client.image.generate(**request)
```

---

## Testing Builders

### Unit Testing

```python
import pytest

class TestClientBuilder:
    """Test client builder."""
    
    def test_build_with_all_parameters(self):
        builder = ClientBuilder()
        
        client = (builder
            .with_api_key("test-key")
            .with_timeout(60.0)
            .with_max_retries(5)
            .with_rate_limit(1000)
            .with_cache(True)
            .with_log_level("WARNING")
            .build()
        )
        
        assert client.config.api_key == "test-key"
        assert client.config.timeout == 60.0
        assert client.config.max_retries == 5
        assert client.config.rate_limit_per_minute == 1000
        assert client.config.cache_enabled is True
    
    def test_build_with_partial_parameters(self):
        builder = ClientBuilder()
        
        client = builder.with_api_key("test-key").build()
        
        # Should use defaults for unspecified parameters
        assert client.config.api_key == "test-key"
        assert client.config.timeout == 30.0  # default
        assert client.config.max_retries == 3  # default
    
    def test_fluent_interface(self):
        builder = ClientBuilder()
        
        # Test that methods return self for chaining
        result = builder.with_api_key("key")
        assert result is builder
        
        result = builder.with_timeout(30.0)
        assert result is builder

class TestValidatingConfigBuilder:
    """Test validating configuration builder."""
    
    def test_valid_api_key(self):
        builder = ValidatingConfigBuilder()
        
        config = builder.with_api_key("sk_live_abc123").build()
        assert config.api_key == "sk_live_abc123"
    
    def test_invalid_api_key_empty(self):
        builder = ValidatingConfigBuilder()
        
        with pytest.raises(ValueError, match="API key cannot be empty"):
            builder.with_api_key("")
    
    def test_invalid_api_key_format(self):
        builder = ValidatingConfigBuilder()
        
        with pytest.raises(ValueError, match="must start with"):
            builder.with_api_key("invalid_key")
    
    def test_valid_timeout(self):
        builder = ValidatingConfigBuilder()
        
        config = builder.with_timeout(45.0).build()
        assert config.timeout == 45.0
    
    def test_invalid_timeout_negative(self):
        builder = ValidatingConfigBuilder()
        
        with pytest.raises(ValueError, match="must be positive"):
            builder.with_timeout(-5.0)
    
    def test_invalid_timeout_too_large(self):
        builder = ValidatingConfigBuilder()
        
        with pytest.raises(ValueError, match="cannot exceed 300"):
            builder.with_timeout(500.0)

class TestRequestBuilder:
    """Test request builders."""
    
    def test_text_request_builder(self):
        builder = TextGenerationRequestBuilder("Hello world")
        
        request = (builder
            .with_model("gemini")
            .with_temperature(0.5)
            .with_max_tokens(200)
            .build()
        )
        
        assert request["prompt"] == "Hello world"
        assert request["model"] == "gemini"
        assert request["temperature"] == 0.5
        assert request["max_tokens"] == 200
    
    def test_image_request_builder(self):
        builder = ImageGenerationRequestBuilder("A cat")
        
        request = (builder
            .with_model("flux")
            .with_size(512, 512)
            .with_quality("hd")
            .build()
        )
        
        assert request["prompt"] == "A cat"
        assert request["model"] == "flux"
        assert request["width"] == 512
        assert request["height"] == 512
        assert request["quality"] == "hd"
    
    def test_image_request_invalid_size(self):
        builder = ImageGenerationRequestBuilder("Test")
        
        with pytest.raises(ValueError, match="Width must be 64-2048"):
            builder.with_size(50, 100)
```

---

### Integration Testing

```python
@pytest.mark.asyncio
async def test_builder_integration():
    """Test builder in real scenario."""
    
    # Build client
    client = (ClientBuilder()
        .with_api_key("test-key")
        .with_timeout(10.0)
        .with_log_level("DEBUG")
        .build()
    )
    
    # Test that it works
    async with client:
        # Mock the actual generation
        with patch.object(client.text, 'generate', return_value="Mock response"):
            result = await client.text.generate("Test")
            assert result == "Mock response"

@pytest.mark.asyncio
async def test_request_builder_integration():
    """Test request builder with real client."""
    
    async with BlossomClient() as client:
        # Build request
        request = (TextGenerationRequestBuilder("Hello")
            .with_model("openai")
            .with_temperature(0.7)
            .build()
        )
        
        # Use request
        result = await client.text.generate(**request)
        assert result is not None
```

---

## Best Practices

### 1. Keep Builders Focused

```python
# Good: Single purpose
class TextRequestBuilder:
    def __init__(self, prompt: str):
        self.prompt = prompt
    # ... text-specific methods

class ImageRequestBuilder:
    def __init__(self, prompt: str):
        self.prompt = prompt
    # ... image-specific methods

# Bad: One builder for everything
class UniversalBuilder:
    def __init__(self):
        self.text_config = {}
        self.image_config = {}
        self.cache_config = {}
    # Too complex
```

---

### 2. Validate Early and Often

```python
class GoodBuilder:
    def with_positive_int(self, value: int) -> "GoodBuilder":
        if value <= 0:
            raise ValueError("Must be positive")
        self.value = value
        return self

class BadBuilder:
    def with_any_value(self, value: int) -> "BadBuilder":
        self.value = value  # Validation delayed until build()
        return self
```

---

### 3. Return Immutable Results

```python
class SafeBuilder:
    def build(self) -> Dict[str, Any]:
        # Return copy to prevent external modification
        return self._config.copy()

class UnsafeBuilder:
    def build(self) -> Dict[str, Any]:
        return self._config  # External code can modify internal state
```

---

### 4. Document Builder Usage

```python
class DocumentedBuilder:
    """
    Builder for API requests.
    
    Example:
        >>> builder = DocumentedBuilder("Hello")
        >>> request = (builder
        ...     .with_model("openai")
        ...     .with_temperature(0.7)
        ...     .build())
        >>> print(request)
    """
    
    def with_model(self, model: str) -> "DocumentedBuilder":
        """Set the AI model to use.
        
        Args:
            model: Model name (e.g., 'openai', 'gemini')
        
        Returns:
            Builder instance for chaining
        """
        self.model = model
        return self
```

---

### 5. Support Method Chaining

```python
class ChainableBuilder:
    def method1(self) -> "ChainableBuilder":
        # Do something
        return self  # Return self for chaining
    
    def method2(self) -> "ChainableBuilder":
        # Do something else
        return self  # Return self for chaining

# Usage
result = (ChainableBuilder()
    .method1()
    .method2()
    .build()
)
```

---

### 6. Provide Sensible Defaults

```python
class SmartBuilder:
    def __init__(self):
        self._config = {
            "timeout": 30.0,  # Reasonable default
            "max_retries": 3,  # Reasonable default
            "rate_limit_per_minute": 60  # Reasonable default
        }
    
    def with_performance_tuning(self, high_performance: bool = False):
        """Apply performance-tuned settings."""
        if high_performance:
            self._config.update({
                "timeout": 120.0,
                "rate_limit_per_minute": 10000,
                "cache_enabled": True
            })
        return self
```

---

## See Also

- [Factory Pattern](FACTORY_PATTERN.md) - Object creation
- [Strategy Pattern](STRATEGY_PATTERN.md) - Algorithm selection
- [Singleton Pattern](SINGLETON_PATTERN.md) - Shared instances
- [Custom Components](CUSTOM_COMPONENTS.md) - Creating custom implementations
- [Architecture Overview](ARCHITECTURE.md) - Design principles