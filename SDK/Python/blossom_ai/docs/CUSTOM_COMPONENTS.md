# 🔧 Custom Components Guide

> **How to create and integrate custom components with Blossom AI**

---

## Overview

Blossom AI is built with extensibility in mind. You can create custom components for:
- Custom generators (text, image, audio)
- Specialized HTTP clients
- Custom caching backends
- Specialized logging
- Custom rate limiters

---

## Architecture Overview

### Protocol-Based Design

Blossom AI uses Python protocols (interfaces) for all components:

```python
# Core protocols
from blossom_ai.core.interfaces import (
    ConfigProtocol,
    HttpClientProtocol,
    LoggerProtocol,
    RateLimiterInterface,
    CacheBackendProtocol,
    GeneratorProtocol
)
```

**Benefits:**
- Easy to create custom implementations
- No inheritance required
- Type-safe interactions
- Easy testing with mocks

---

## Custom Generators

### Creating a Custom Text Generator

```python
from typing import Any, Dict, Optional
from blossom_ai.core.interfaces import GeneratorProtocol
from blossom_ai.core.config import SessionConfig
from blossom_ai.core.errors import ValidationError

class CustomTextGenerator:
    """Custom text generator implementation."""
    
    def __init__(self, config: SessionConfig, custom_param: str = None):
        self.config = config
        self.custom_param = custom_param
    
    async def generate(
        self,
        prompt: str,
        model: str = "custom",
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> str:
        """Generate text with custom logic."""
        
        # Validate input
        if not prompt or prompt.isspace():
            raise ValidationError("Prompt cannot be empty")
        
        # Custom generation logic
        if self.custom_param:
            prompt = f"[{self.custom_param}] {prompt}"
        
        # Simulate generation
        return f"Custom response to: {prompt}"
    
    async def close(self) -> None:
        """Clean up resources."""
        pass

# Usage
config = SessionConfig()
generator = CustomTextGenerator(config, custom_param="PREFIX")
result = await generator.generate("Hello world")
```

---

### Integrating Custom Generator

```python
from blossom_ai import BlossomClient
from blossom_ai.generators.base_generator import BaseGenerator

class IntegratedCustomGenerator(BaseGenerator):
    """Custom generator integrated with Blossom AI infrastructure."""
    
    def __init__(self, config, http_client=None, logger=None, cache=None):
        super().__init__(config, http_client, logger, cache)
        self.custom_param = "custom_value"
    
    def _prepare_request_data(self, **kwargs) -> Dict[str, Any]:
        """Prepare request data for custom API."""
        return {
            "prompt": kwargs.get("prompt"),
            "custom_param": self.custom_param,
            **kwargs
        }
    
    def _parse_response(self, response) -> str:
        """Parse custom API response."""
        # Assume response has custom format
        data = response.json()
        return data.get("custom_response", "")
    
    async def generate(self, prompt: str, **kwargs) -> str:
        """Generate with custom logic."""
        # Use base generator's infrastructure
        return await self._generate(prompt, **kwargs)

# Usage with dependency injection
async with BlossomClient() as client:
    # Replace the text generator
    client._text = IntegratedCustomGenerator(
        config=client.config,
        http_client=client.http_client,
        logger=client.logger,
        cache=client.cache
    )
    
    result = await client.text.generate("Hello")
```

---

## Custom HTTP Client

### Implementing Custom HTTP Client

```python
from typing import Any, Dict, Optional
from blossom_ai.core.interfaces import HttpClientProtocol
from blossom_ai.core.errors import NetworkError

class CustomHttpClient:
    """Custom HTTP client with special features."""
    
    def __init__(self, config, logger):
        self.config = config
        self.logger = logger
        self.session = None
    
    async def get(
        self,
        url: str,
        params: Optional[Dict] = None,
        headers: Optional[Dict] = None,
        **kwargs
    ) -> Any:
        """Custom GET implementation."""
        
        # Custom logging
        self.logger.info(f"Custom GET: {url}")
        
        # Custom headers
        custom_headers = {
            "X-Custom-Client": "MyApp/1.0",
            **(headers or {})
        }
        
        # Simulate request (replace with real implementation)
        class MockResponse:
            def __init__(self):
                self.status_code = 200
                self.content = b"Mock response"
                self.headers = {}
            
            def json(self):
                return {"result": "success"}
            
            def raise_for_status(self):
                if self.status_code >= 400:
                    raise NetworkError(f"HTTP {self.status_code}")
        
        return MockResponse()
    
    async def post(
        self,
        url: str,
        data: Optional[Dict] = None,
        json: Optional[Dict] = None,
        headers: Optional[Dict] = None,
        **kwargs
    ) -> Any:
        """Custom POST implementation."""
        # Similar to GET implementation
        pass
    
    async def close(self) -> None:
        """Clean up HTTP resources."""
        if self.session:
            await self.session.close()

# Usage
from blossom_ai import BlossomClient

config = SessionConfig()
custom_http = CustomHttpClient(config, None)

async with BlossomClient(config=config, http_client=custom_http) as client:
    result = await client.text.generate("Hello")
```

---

## Custom Caching Backend

### Implementing Custom Cache

```python
import time
import json
from typing import Optional, Any
from blossom_ai.core.interfaces import CacheBackendProtocol

class RedisCacheBackend:
    """Redis-based cache backend."""
    
    def __init__(self, redis_client, ttl: int = 3600):
        self.redis = redis_client
        self.ttl = ttl
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from Redis."""
        try:
            value = await self.redis.get(key)
            if value:
                data = json.loads(value)
                # Check TTL
                if data.get('expires', 0) > time.time():
                    return data.get('value')
                else:
                    await self.redis.delete(key)
            return None
        except Exception:
            return None
    
    async def set(self, key: str, value: Any) -> None:
        """Set value in Redis."""
        try:
            data = {
                'value': value,
                'expires': time.time() + self.ttl
            }
            await self.redis.setex(
                key, 
                self.ttl, 
                json.dumps(data)
            )
        except Exception:
            pass  # Cache failures shouldn't break the app
    
    async def clear(self) -> None:
        """Clear all cached data."""
        try:
            await self.redis.flushdb()
        except Exception:
            pass

# Usage (requires redis-py)
try:
    import redis
    import asyncio
    
    async def use_redis_cache():
        redis_client = redis.Redis(host='localhost', port=6379, db=0)
        cache = RedisCacheBackend(redis_client)
        
        # Test the cache
        await cache.set("test_key", "test_value")
        value = await cache.get("test_key")
        print(f"Cached value: {value}")
        
except ImportError:
    print("Redis not available - install with: pip install redis")
```

---

## Custom Rate Limiter

### Implementing Rate Limiter

```python
import time
import asyncio
from typing import Dict, Optional
from blossom_ai.core.interfaces import RateLimiterInterface

class SlidingWindowRateLimiter:
    """Sliding window rate limiter."""
    
    def __init__(self, requests_per_minute: int, window_size: int = 60):
        self.requests_per_minute = requests_per_minute
        self.window_size = window_size
        self.requests: Dict[str, list] = {}
    
    async def acquire(self, key: str = "default") -> bool:
        """Acquire permission to make request."""
        now = time.time()
        
        # Initialize key if not exists
        if key not in self.requests:
            self.requests[key] = []
        
        # Remove old requests outside window
        cutoff = now - self.window_size
        self.requests[key] = [
            req_time for req_time in self.requests[key]
            if req_time > cutoff
        ]
        
        # Check if under limit
        if len(self.requests[key]) < self.requests_per_minute:
            self.requests[key].append(now)
            return True
        else:
            return False
    
    async def acquire_with_wait(self, key: str = "default") -> bool:
        """Acquire permission, wait if necessary."""
        while not await self.acquire(key):
            # Wait until oldest request is outside window
            if self.requests[key]:
                wait_time = (self.requests[key][0] + 
                           self.window_size - time.time())
                if wait_time > 0:
                    await asyncio.sleep(wait_time)
        return True
    
    def get_stats(self) -> Dict:
        """Get rate limiter statistics."""
        return {
            "requests_per_minute": self.requests_per_minute,
            "total_keys": len(self.requests),
            "window_size": self.window_size
        }

# Usage
limiter = SlidingWindowRateLimiter(requests_per_minute=60)

async def make_limited_request():
    await limiter.acquire_with_wait()
    return await client.text.generate("Test")
```

---

## Custom Logger

### Implementing Custom Logger

```python
import json
import logging
from typing import Any, Dict, Optional
from blossom_ai.core.interfaces import LoggerProtocol

class StructuredJsonLogger:
    """JSON-structured logger."""
    
    def __init__(self, name: str, level: str = "INFO"):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(getattr(logging, level.upper()))
        
        # JSON formatter
        handler = logging.StreamHandler()
        formatter = logging.Formatter('%(message)s')
        handler.setFormatter(formatter)
        self.logger.addHandler(handler)
    
    def _log(self, level: str, message: str, **kwargs):
        """Log structured message."""
        log_data = {
            "timestamp": time.time(),
            "level": level.upper(),
            "message": message,
            **kwargs
        }
        
        getattr(self.logger, level)(
            json.dumps(log_data)
        )
    
    def debug(self, message: str, **kwargs):
        self._log("debug", message, **kwargs)
    
    def info(self, message: str, **kwargs):
        self._log("info", message, **kwargs)
    
    def warning(self, message: str, **kwargs):
        self._log("warning", message, **kwargs)
    
    def error(self, message: str, **kwargs):
        self._log("error", message, **kwargs)
    
    def exception(self, message: str, **kwargs):
        self._log("error", message, exc_info=True, **kwargs)

# Usage
json_logger = StructuredJsonLogger("blossom_ai")

async with BlossomClient(logger=json_logger) as client:
    result = await client.text.generate("Hello")
    # Logs: {"timestamp": 1234567890.123, "level": "INFO", "message": "Request completed", ...}
```

---

## Integrating Custom Components

### Using Dependency Injection

```python
from blossom_ai import (
    BlossomClient, SessionConfig,
    CustomTextGenerator, RedisCacheBackend,
    SlidingWindowRateLimiter, StructuredJsonLogger
)

async def main():
    # Create configuration
    config = SessionConfig(
        api_key="your-key",
        cache_enabled=True
    )
    
    # Create custom components
    logger = StructuredJsonLogger("my_app")
    cache = RedisCacheBackend(redis_client)
    rate_limiter = SlidingWindowRateLimiter(100)
    
    # Create client with custom components
    async with BlossomClient(
        config=config,
        logger=logger,
        cache=cache,
        rate_limiter=rate_limiter
    ) as client:
        
        # Replace generator with custom one
        client._text = CustomTextGenerator(config, "custom_param")
        
        # Use normally
        result = await client.text.generate("Hello")
        print(result)
```

---

### Creating Component Factory

```python
class ComponentFactory:
    """Factory for creating custom components."""
    
    @staticmethod
    def create_cache(backend: str, **kwargs):
        """Create cache backend."""
        if backend == "redis":
            return RedisCacheBackend(**kwargs)
        elif backend == "memory":
            from blossom_ai.utils.cache import CacheManager, CacheConfig
            return CacheManager(CacheConfig(backend="memory"))
        else:
            raise ValueError(f"Unknown cache backend: {backend}")
    
    @staticmethod
    def create_rate_limiter(type: str, **kwargs):
        """Create rate limiter."""
        if type == "sliding_window":
            return SlidingWindowRateLimiter(**kwargs)
        elif type == "token_bucket":
            from blossom_ai.utils.rate_limiter import TokenBucketRateLimiter
            return TokenBucketRateLimiter(**kwargs)
        else:
            raise ValueError(f"Unknown rate limiter type: {type}")
    
    @staticmethod
    def create_logger(type: str, **kwargs):
        """Create logger."""
        if type == "json":
            return StructuredJsonLogger(**kwargs)
        elif type == "standard":
            from blossom_ai.utils.logging import StructuredLogger
            return StructuredLogger(**kwargs)
        else:
            raise ValueError(f"Unknown logger type: {type}")

# Usage
factory = ComponentFactory()

cache = factory.create_cache("redis", redis_client=redis_client)
limiter = factory.create_rate_limiter("sliding_window", requests_per_minute=100)
logger = factory.create_logger("json", name="my_app")
```

---

## Testing Custom Components

### Unit Testing

```python
import pytest
from unittest.mock import Mock, AsyncMock

class TestCustomTextGenerator:
    """Test custom text generator."""
    
    @pytest.fixture
    def generator(self):
        config = SessionConfig()
        return CustomTextGenerator(config, custom_param="test")
    
    @pytest.mark.asyncio
    async def test_generate_success(self, generator):
        result = await generator.generate("Hello")
        assert result == "Custom response to: [test] Hello"
    
    @pytest.mark.asyncio
    async def test_generate_empty_prompt(self, generator):
        with pytest.raises(ValidationError):
            await generator.generate("")
    
    @pytest.mark.asyncio
    async def test_generate_whitespace_prompt(self, generator):
        with pytest.raises(ValidationError):
            await generator.generate("   ")

class TestRedisCacheBackend:
    """Test Redis cache backend."""
    
    @pytest.fixture
    def cache(self):
        mock_redis = Mock()
        mock_redis.get = AsyncMock(return_value=None)
        mock_redis.setex = AsyncMock()
        return RedisCacheBackend(mock_redis, ttl=3600)
    
    @pytest.mark.asyncio
    async def test_get_missing_key(self, cache):
        result = await cache.get("missing")
        assert result is None
    
    @pytest.mark.asyncio
    async def test_set_and_get(self, cache):
        await cache.set("key", "value")
        cache.redis.setex.assert_called_once()
```

---

## Best Practices

### 1. Follow Protocol Contracts

```python
# Good: Implements protocol correctly
class GoodCustomCache(CacheBackendProtocol):
    async def get(self, key: str) -> Optional[Any]:
        # Must return None for missing keys
        return self.data.get(key)

# Bad: Doesn't follow protocol
class BadCustomCache:
    def get(self, key):  # Missing async and type hints
        if key not in self.data:
            raise KeyError("Not found")  # Should return None
        return self.data[key]
```

---

### 2. Handle Errors Gracefully

```python
class RobustCustomComponent:
    """Component that handles errors gracefully."""
    
    async def operation(self):
        try:
            # Main operation
            return await self._do_operation()
        except Exception as e:
            # Log error but don't crash
            self.logger.error(f"Operation failed: {e}")
            
            # Return safe fallback
            return self._get_fallback_result()
```

---

### 3. Provide Clear Documentation

```python
class CustomRateLimiter:
    """
    Custom rate limiter with sliding window algorithm.
    
    Args:
        requests_per_minute: Maximum requests per minute
        window_size: Window size in seconds (default: 60)
    
    Example:
        >>> limiter = CustomRateLimiter(60)
        >>> await limiter.acquire_with_wait()
        >>> # Safe to make request
    """
    
    def __init__(self, requests_per_minute: int, window_size: int = 60):
        # Implementation...
        pass
```

---

### 4. Test Thoroughly

```python
# Test success cases
# Test error cases
# Test edge cases
# Test performance
# Test thread safety
# Test cleanup
```

---

### 5. Provide Configuration Options

```python
class ConfigurableComponent:
    """Component with configuration options."""
    
    def __init__(self, **kwargs):
        self.timeout = kwargs.get("timeout", 30.0)
        self.retries = kwargs.get("retries", 3)
        self.backoff = kwargs.get("backoff", 2.0)
        # ...
```

---

## See Also

- [Architecture Overview](ARCHITECTURE.md) - Design principles
- [Protocol Interfaces](PROTOCOL_INTERFACES.md) - Abstract interfaces
- [Dependency Injection](DEPENDENCY_INJECTION.md) - DI patterns
- [Testing Standards](TESTING_STANDARDS.md) - Testing guide