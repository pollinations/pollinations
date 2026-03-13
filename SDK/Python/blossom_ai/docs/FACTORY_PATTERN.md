# 🏭 Factory Pattern Guide

> **Implementing and using the Factory pattern in Blossom AI**

---

## Overview

The Factory pattern provides a way to create objects without specifying their exact class. Blossom AI uses factory patterns extensively for creating generators, clients, and other components.

---

## When to Use Factory Pattern

| Use Case | Example |
|----------|---------|
| **Object creation** | Creating generators based on model type |
| **Runtime configuration** | Selecting cache backend at runtime |
| **Simplifying complex objects** | Creating pre-configured clients |
| **Testing** | Creating mock objects |

---

## Built-in Factories

### Generator Factory

```python
from blossom_ai import BlossomClient

async with BlossomClient() as client:
    # Factory creates appropriate generator based on model
    text_result = await client.text.generate("Hello", model="openai")
    image_result = await client.image.generate("A cat", model="flux")
```

**How it works:**
- Client automatically selects correct generator
- Handles model validation
- Manages dependencies

---

### Cache Factory

```python
from blossom_ai.utils.cache import get_default_cache
from blossom_ai import SessionConfig

config = SessionConfig(
    cache_enabled=True,
    cache_backend="hybrid"  # Factory selects backend
)

cache = get_default_cache(config)
```

**Available backends:**
- `"memory"` - In-memory cache
- `"disk"` - File-based cache  
- `"hybrid"` - Memory + disk

---

## Creating Custom Factories

### Simple Factory

```python
from blossom_ai import SessionConfig
from typing import Union

class GeneratorFactory:
    """Factory for creating generators."""
    
    @staticmethod
    def create_text_generator(
        config: SessionConfig,
        provider: str = "openai"
    ) -> "TextGenerator":
        """Create text generator for specific provider."""
        
        from blossom_ai.generators.text_generator import TextGenerator
        
        # Provider-specific configuration
        if provider == "openai":
            return TextGenerator(
                config=config,
                base_url="https://api.openai.com"
            )
        elif provider == "anthropic":
            return TextGenerator(
                config=config,
                base_url="https://api.anthropic.com"
            )
        else:
            raise ValueError(f"Unknown provider: {provider}")
    
    @staticmethod
    def create_image_generator(
        config: SessionConfig,
        provider: str = "pollinations"
    ) -> "ImageGenerator":
        """Create image generator for specific provider."""
        
        from blossom_ai.generators.image_generator import ImageGenerator
        
        if provider == "pollinations":
            return ImageGenerator(config=config)
        elif provider == "stability":
            return ImageGenerator(
                config=config,
                base_url="https://api.stability.ai"
            )
        else:
            raise ValueError(f"Unknown provider: {provider}")

# Usage
factory = GeneratorFactory()

text_gen = factory.create_text_generator(config, "openai")
image_gen = factory.create_image_generator(config, "pollinations")
```

---

### Factory with Registry

```python
from typing import Dict, Type, Callable, Any

class ModelFactory:
    """Factory with registry pattern."""
    
    def __init__(self):
        self._registry: Dict[str, Callable] = {}
    
    def register(self, name: str, creator: Callable):
        """Register a model creator."""
        self._registry[name] = creator
    
    def create(self, name: str, config: SessionConfig, **kwargs) -> Any:
        """Create model instance."""
        if name not in self._registry:
            raise ValueError(f"Unknown model: {name}")
        
        creator = self._registry[name]
        return creator(config, **kwargs)
    
    def list_models(self) -> list:
        """List registered models."""
        return list(self._registry.keys())

# Create factory
model_factory = ModelFactory()

# Register creators
model_factory.register("gpt-4", lambda config: TextGenerator(config, model="gpt-4"))
model_factory.register("claude-3", lambda config: TextGenerator(config, model="claude-3"))
model_factory.register("gemini-pro", lambda config: TextGenerator(config, model="gemini-pro"))
model_factory.register("flux", lambda config: ImageGenerator(config, model="flux"))
model_factory.register("dall-e-3", lambda config: ImageGenerator(config, model="dall-e-3"))

# Usage
config = SessionConfig()
text_gen = model_factory.create("gpt-4", config)
image_gen = model_factory.create("flux", config)

print(f"Available models: {model_factory.list_models()}")
```

---

### Abstract Factory

```python
from abc import ABC, abstractmethod
from typing import Any

class GeneratorFactory(ABC):
    """Abstract factory for generators."""
    
    @abstractmethod
    def create_text_generator(self, config: SessionConfig) -> Any:
        """Create text generator."""
        pass
    
    @abstractmethod
    def create_image_generator(self, config: SessionConfig) -> Any:
        """Create image generator."""
        pass

class OpenAIFactory(GeneratorFactory):
    """Factory for OpenAI-compatible generators."""
    
    def create_text_generator(self, config: SessionConfig):
        return TextGenerator(config, base_url="https://api.openai.com")
    
    def create_image_generator(self, config: SessionConfig):
        return ImageGenerator(config, base_url="https://api.openai.com")

class AnthropicFactory(GeneratorFactory):
    """Factory for Anthropic generators."""
    
    def create_text_generator(self, config: SessionConfig):
        return TextGenerator(config, base_url="https://api.anthropic.com")
    
    def create_image_generator(self, config: SessionConfig):
        raise NotImplementedError("Anthropic doesn't support images")

class PollinationsFactory(GeneratorFactory):
    """Factory for Pollinations generators."""
    
    def create_text_generator(self, config: SessionConfig):
        return TextGenerator(config)
    
    def create_image_generator(self, config: SessionConfig):
        return ImageGenerator(config)

# Usage
factories = {
    "openai": OpenAIFactory(),
    "anthropic": AnthropicFactory(),
    "pollinations": PollinationsFactory()
}

provider = "pollinations"
factory = factories[provider]

text_gen = factory.create_text_generator(config)
image_gen = factory.create_image_generator(config)
```

---

## Parameterized Factory

### Configuration-Based Factory

```python
class ConfigurableFactory:
    """Factory that creates objects based on configuration."""
    
    def __init__(self, config: SessionConfig):
        self.config = config
    
    def create_cache(self) -> "CacheBackend":
        """Create cache based on config."""
        from blossom_ai.utils.cache import CacheManager, CacheConfig
        
        cache_config = CacheConfig(
            backend=self.config.cache_backend,
            ttl=self.config.cache_ttl,
            max_memory_size=self.config.cache_max_memory,
            max_disk_size=self.config.cache_max_disk
        )
        
        return CacheManager(cache_config)
    
    def create_rate_limiter(self) -> "RateLimiterInterface":
        """Create rate limiter based on config."""
        from blossom_ai.utils.rate_limiter import TokenBucketRateLimiter
        
        return TokenBucketRateLimiter(
            requests_per_minute=self.config.rate_limit_per_minute
        )
    
    def create_logger(self, name: str) -> "LoggerProtocol":
        """Create logger based on config."""
        from blossom_ai.utils.logging import StructuredLogger
        
        return StructuredLogger(name, level=self.config.log_level)

# Usage
config = SessionConfig(
    cache_backend="hybrid",
    rate_limit_per_minute=100,
    log_level="INFO"
)

factory = ConfigurableFactory(config)

cache = factory.create_cache()
limiter = factory.create_rate_limiter()
logger = factory.create_logger("my_app")
```

---

### Environment-Based Factory

```python
import os

class EnvironmentFactory:
    """Factory that selects implementation based on environment."""
    
    @staticmethod
    def create_client() -> "BlossomClient":
        """Create appropriate client based on environment."""
        
        env = os.getenv("ENVIRONMENT", "development")
        
        if env == "production":
            config = SessionConfig(
                api_key=os.getenv("POLLINATIONS_API_KEY"),
                timeout=60.0,
                log_level="WARNING"
            )
            return BlossomClient(config=config)
        
        elif env == "testing":
            config = SessionConfig(
                test_mode=True,
                cache_enabled=False,
                log_level="DEBUG"
            )
            # Return mock client for testing
            from unittest.mock import Mock
            return Mock()
        
        else:  # development
            config = SessionConfig(
                test_mode=True,
                log_level="INFO",
                log_requests=True
            )
            return BlossomClient(config=config)

# Usage
client = EnvironmentFactory.create_client()
```

---

## Advanced Factory Patterns

### Factory with Validation

```python
class ValidatingFactory:
    """Factory that validates parameters before creation."""
    
    @staticmethod
    def create_image_generator(
        config: SessionConfig,
        model: str,
        width: int = 1024,
        height: int = 1024
    ) -> "ImageGenerator":
        """Create image generator with validation."""
        
        # Validate model
        available_models = ["flux", "turbo", "dall-e-3"]
        if model not in available_models:
            raise ValueError(f"Invalid model: {model}. Available: {available_models}")
        
        # Validate dimensions
        if not (64 <= width <= 2048):
            raise ValueError(f"Width must be 64-2048, got: {width}")
        
        if not (64 <= height <= 2048):
            raise ValueError(f"Height must be 64-2048, got: {height}")
        
        # Create generator
        from blossom_ai.generators.image_generator import ImageGenerator
        return ImageGenerator(config=config)

# Usage
try:
    generator = ValidatingFactory.create_image_generator(
        config=config,
        model="flux",
        width=1024,
        height=1024
    )
except ValueError as e:
    print(f"Validation failed: {e}")
```

---

### Factory with Caching

```python
class CachedFactory:
    """Factory that caches created instances."""
    
    def __init__(self):
        self._cache: Dict[str, Any] = {}
    
    def create_generator(
        self,
        generator_type: str,
        config: SessionConfig,
        **kwargs
    ) -> Any:
        """Create generator with caching."""
        
        # Create cache key
        cache_key = f"{generator_type}:{hash(str(sorted(kwargs.items())))}"
        
        # Return cached if available
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        # Create new instance
        if generator_type == "text":
            from blossom_ai.generators.text_generator import TextGenerator
            instance = TextGenerator(config=config, **kwargs)
        elif generator_type == "image":
            from blossom_ai.generators.image_generator import ImageGenerator
            instance = ImageGenerator(config=config, **kwargs)
        else:
            raise ValueError(f"Unknown generator type: {generator_type}")
        
        # Cache and return
        self._cache[cache_key] = instance
        return instance

# Usage
factory = CachedFactory()

# First creation
generator1 = factory.create_generator("text", config, model="openai")

# Second creation (from cache)
generator2 = factory.create_generator("text", config, model="openai")

assert generator1 is generator2  # Same instance
```

---

### Factory with Dependency Injection

```python
from blossom_ai.core.interfaces import (
    HttpClientProtocol,
    LoggerProtocol,
    CacheBackendProtocol
)

class DIFactory:
    """Factory with dependency injection support."""
    
    def __init__(
        self,
        http_client: HttpClientProtocol = None,
        logger: LoggerProtocol = None,
        cache: CacheBackendProtocol = None
    ):
        self.http_client = http_client
        self.logger = logger
        self.cache = cache
    
    def create_text_generator(self, config: SessionConfig) -> "TextGenerator":
        """Create text generator with injected dependencies."""
        
        from blossom_ai.generators.text_generator import TextGenerator
        
        return TextGenerator(
            config=config,
            http_client=self.http_client,
            logger=self.logger,
            cache=self.cache
        )
    
    def create_image_generator(self, config: SessionConfig) -> "ImageGenerator":
        """Create image generator with injected dependencies."""
        
        from blossom_ai.generators.image_generator import ImageGenerator
        
        return ImageGenerator(
            config=config,
            http_client=self.http_client,
            logger=self.logger,
            cache=self.cache
        )

# Usage
from blossom_ai.utils.http_client import HttpxClient
from blossom_ai.utils.logging import StructuredLogger
from blossom_ai.utils.cache import CacheManager, CacheConfig

config = SessionConfig()

# Create dependencies
http_client = HttpxClient(config)
logger = StructuredLogger("my_app")
cache = CacheManager(CacheConfig())

# Create factory with dependencies
factory = DIFactory(http_client, logger, cache)

# Create generators with injected dependencies
text_gen = factory.create_text_generator(config)
image_gen = factory.create_image_generator(config)
```

---

## Testing Factories

### Unit Testing

```python
import pytest
from unittest.mock import Mock

class TestGeneratorFactory:
    """Test generator factory."""
    
    def test_create_text_generator_openai(self):
        config = SessionConfig()
        generator = GeneratorFactory.create_text_generator(config, "openai")
        
        assert generator is not None
        assert hasattr(generator, "generate")
    
    def test_create_text_generator_invalid_provider(self):
        config = SessionConfig()
        
        with pytest.raises(ValueError, match="Unknown provider: invalid"):
            GeneratorFactory.create_text_generator(config, "invalid")
    
    def test_create_image_generator_pollinations(self):
        config = SessionConfig()
        generator = GeneratorFactory.create_image_generator(config, "pollinations")
        
        assert generator is not None
        assert hasattr(generator, "generate")

class TestModelFactory:
    """Test model factory with registry."""
    
    def test_register_and_create(self):
        factory = ModelFactory()
        
        # Register mock creator
        mock_creator = Mock(return_value="mock_generator")
        factory.register("test_model", mock_creator)
        
        # Create instance
        config = SessionConfig()
        result = factory.create("test_model", config, param="value")
        
        # Verify
        assert result == "mock_generator"
        mock_creator.assert_called_once_with(config, param="value")
    
    def test_create_unknown_model(self):
        factory = ModelFactory()
        
        with pytest.raises(ValueError, match="Unknown model: unknown"):
            factory.create("unknown", SessionConfig())
    
    def test_list_models(self):
        factory = ModelFactory()
        
        # Register models
        factory.register("model1", Mock())
        factory.register("model2", Mock())
        
        # List models
        models = factory.list_models()
        
        assert "model1" in models
        assert "model2" in models
        assert len(models) == 2
```

---

### Integration Testing

```python
@pytest.mark.asyncio
async def test_factory_integration():
    """Test factory in real scenario."""
    
    config = SessionConfig(test_mode=True)
    
    # Create factory
    factory = ConfigurableFactory(config)
    
    # Create components
    cache = factory.create_cache()
    limiter = factory.create_rate_limiter()
    logger = factory.create_logger("test")
    
    # Verify components work together
    assert cache is not None
    assert limiter is not None
    assert logger is not None
    
    # Test with client
    async with BlossomClient(
        config=config,
        cache=cache,
        rate_limiter=limiter,
        logger=logger
    ) as client:
        
        result = await client.text.generate("Test")
        assert result is not None
```

---

## Best Practices

### 1. Keep Factories Simple

```python
# Good: Single responsibility
class TextGeneratorFactory:
    def create(self, config, provider):
        # Only creates text generators
        pass

# Bad: Too complex
class EverythingFactory:
    def create_text_generator(self, config, provider, model, custom_params...):
        # Too many responsibilities
        pass
    
    def create_image_generator(self, config, provider, model, style...):
        # Too many responsibilities
        pass
    
    def create_cache(self, backend, size, ttl...):
        # Too many responsibilities
        pass
```

---

### 2. Use Type Hints

```python
from typing import Union, Optional

# Good: Clear types
class GoodFactory:
    def create_generator(self, config: SessionConfig) -> TextGenerator:
        return TextGenerator(config)

# Bad: No type hints
class BadFactory:
    def create_generator(self, config):
        return TextGenerator(config)
```

---

### 3. Handle Errors Gracefully

```python
class SafeFactory:
    """Factory that handles errors gracefully."""
    
    @staticmethod
    def create_generator(generator_type: str, config: SessionConfig):
        try:
            if generator_type == "text":
                return TextGenerator(config)
            elif generator_type == "image":
                return ImageGenerator(config)
            else:
                raise ValueError(f"Unknown type: {generator_type}")
        except Exception as e:
            # Return fallback instead of crashing
            print(f"Factory error: {e}")
            return FallbackGenerator(config)
```

---

### 4. Document Factory Usage

```python
class DocumentedFactory:
    """
    Factory for creating AI generators.
    
    Example:
        >>> factory = DocumentedFactory()
        >>> generator = factory.create("text", config, model="openai")
        >>> result = await generator.generate("Hello")
    
    Available types:
        - text: Text generators
        - image: Image generators
    """
    
    def create(self, generator_type: str, config: SessionConfig, **kwargs):
        """Create generator instance."""
        # Implementation...
        pass
```

---

### 5. Make Factories Extensible

```python
class ExtensibleFactory:
    """Factory that can be extended with new creators."""
    
    def __init__(self):
        self._creators = {}
    
    def register(self, name: str, creator: Callable):
        """Register new creator."""
        self._creators[name] = creator
    
    def create(self, name: str, *args, **kwargs):
        """Create using registered creator."""
        if name in self._creators:
            return self._creators[name](*args, **kwargs)
        else:
            raise ValueError(f"Unknown: {name}")

# Usage
factory = ExtensibleFactory()

# Register custom creators
factory.register("custom_text", lambda config: CustomTextGenerator(config))
factory.register("custom_image", lambda config: CustomImageGenerator(config))

custom_text = factory.create("custom_text", config)
```

---

## See Also

- [Builder Pattern](BUILDER_PATTERN.md) - Complex configurations
- [Strategy Pattern](STRATEGY_PATTERN.md) - Algorithm selection
- [Singleton Pattern](SINGLETON_PATTERN.md) - Shared instances
- [Custom Components](CUSTOM_COMPONENTS.md) - Creating custom implementations
- [Architecture Overview](ARCHITECTURE.md) - Design principles