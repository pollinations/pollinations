# 🌸 BlossomClient Guide

> Complete guide to using the main Blossom AI client

---

## 🚀 Overview

`BlossomClient` is the main entry point for all Blossom AI operations. It provides a unified interface for image generation, text generation, vision analysis, and more.

### Key Features

- 🎨 **Unified API**: Single client for all AI operations
- 🔒 **Thread-safe**: Safe for concurrent usage
- 💾 **Integrated caching**: Built-in LRU cache
- ⏱️ **Rate limiting**: Automatic rate limit management
- 🧹 **Resource management**: Automatic cleanup
- 🔧 **Dependency injection**: Fully customizable

---

## 📋 Basic Usage

### Simple Client

```python
from blossom_ai import BlossomClient

# Using context manager (recommended)
with BlossomClient() as client:
    # Generate image
    image = client.image.generate("a beautiful sunset")
    
    # Generate text
    response = client.text.generate("write a poem")
    
    # Analyze image
    analysis = client.vision.analyze(
        image_url="https://example.com/photo.jpg"
    )
```

### Async Client

```python
import asyncio
from blossom_ai import BlossomClient

async def main():
    async with BlossomClient() as client:
        # Async image generation
        image = await client.image.generate("a futuristic city")
        
        # Async text generation
        response = await client.text.generate("explain AI")
        
        # Async vision analysis
        analysis = await client.vision.analyze(
            image_url="https://example.com/photo.jpg"
        )

# Run async function
asyncio.run(main())
```

---

## 🔧 Configuration

### Using SessionConfig

```python
from blossom_ai import BlossomClient, SessionConfig

config = SessionConfig(
    api_key="your-api-key",
    base_url="https://api.blossom-ai.com",
    timeout=30.0,
    rate_limit_per_minute=60,
    cache_enabled=True,
    cache_backend="memory",
    cache_ttl=3600,
    max_file_size_mb=10
)

with BlossomClient(config=config) as client:
    response = client.text.generate("test")
```

### Environment Variables

```bash
# Create .env file
BLOSSOM_API_KEY=your-api-key
BLOSSOM_BASE_URL=https://api.blossom-ai.com
BLOSSOM_RATE_LIMIT=60
BLOSSOM_CACHE_ENABLED=true
BLOSSOM_TIMEOUT=30.0
```

```python
# Client will auto-load from environment
with BlossomClient() as client:
    response = client.text.generate("test")
```

---

## 💉 Dependency Injection

### Custom HTTP Client

```python
from blossom_ai import BlossomClient
from blossom_ai.core.interfaces import HttpClientProtocol

class CustomHttpClient(HttpClientProtocol):
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=60.0)
    
    async def get(self, url: str, **kwargs):
        return await self.client.get(url, **kwargs)
    
    async def post(self, url: str, json: dict, **kwargs):
        return await self.client.post(url, json=json, **kwargs)
    
    async def close(self):
        await self.client.aclose()

# Use custom HTTP client
custom_http = CustomHttpClient()

with BlossomClient(http_client=custom_http) as client:
    response = client.text.generate("test")
```

### Custom Cache

```python
from blossom_ai import BlossomClient, SessionConfig
from blossom_ai.utils.cache import CacheManager, CacheConfig

# Custom cache configuration
cache_config = CacheConfig(
    backend="redis",
    host="localhost",
    port=6379,
    ttl=7200
)

cache = CacheManager(cache_config)

with BlossomClient(cache=cache) as client:
    response = client.text.generate("test")
```

### Custom Logger

```python
import logging
from blossom_ai import BlossomClient
from blossom_ai.core.interfaces import LoggerProtocol

class CustomLogger(LoggerProtocol):
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
    
    def info(self, msg: str, **kwargs):
        self.logger.info(msg, extra=kwargs)
    
    def warning(self, msg: str, **kwargs):
        self.logger.warning(msg, extra=kwargs)
    
    def error(self, msg: str, **kwargs):
        self.logger.error(msg, extra=kwargs)

# Use custom logger
custom_logger = CustomLogger("my_app")

with BlossomClient(logger=custom_logger) as client:
    response = client.text.generate("test")
```

### Custom Rate Limiter

```python
from blossom_ai import BlossomClient
from blossom_ai.core.interfaces import RateLimiterInterface

class CustomRateLimiter(RateLimiterInterface):
    def __init__(self, requests_per_minute: int):
        self.requests_per_minute = requests_per_minute
        # Custom implementation
    
    async def acquire(self):
        # Custom rate limiting logic
        pass
    
    def release(self):
        # Custom release logic
        pass

# Use custom rate limiter
rate_limiter = CustomRateLimiter(requests_per_minute=120)

with BlossomClient(rate_limiter=rate_limiter) as client:
    response = client.text.generate("test")
```

---

## 🎨 Generators

### Image Generator

```python
from blossom_ai import BlossomClient

with BlossomClient() as client:
    # Basic generation
    image = client.image.generate("a beautiful landscape")
    
    # Advanced generation
    image = client.image.generate(
        "a detailed fantasy world",
        width=1920,
        height=1080,
        quality="hd",
        guidance_scale=7.5,
        model="dall-e-3",
        style="vivid"
    )
    
    # Save image
    image.save("fantasy_world.png")
    
    # Get as bytes
    image_bytes = image.bytes
```

### Text Generator

```python
from blossom_ai import BlossomClient, MessageBuilder

with BlossomClient() as client:
    # Basic generation
    response = client.text.generate("write a story")
    
    # Chat conversation
    messages = [
        MessageBuilder.system("You are a helpful assistant."),
        MessageBuilder.user("what is Python?"),
        MessageBuilder.assistant("Python is a programming language."),
        MessageBuilder.user("why should I use it?")
    ]
    
    response = client.text.chat(messages)
    
    # Streaming
    stream = client.text.generate(
        "write a long essay",
        stream=True
    )
    
    for chunk in stream:
        print(chunk.text, end="", flush=True)
```

### Vision Generator

```python
from blossom_ai import BlossomClient

with BlossomClient() as client:
    # Analyze image
    analysis = client.vision.analyze(
        image_url="https://example.com/photo.jpg",
        prompt="describe this image"
    )
    
    # Compare images
    comparison = client.vision.compare(
        image1_url="https://example.com/img1.jpg",
        image2_url="https://example.com/img2.jpg",
        prompt="find differences"
    )
```

---

## 📊 Client Statistics

### Get Usage Stats

```python
from blossom_ai import BlossomClient

with BlossomClient() as client:
    # Generate some content
    client.text.generate("test")
    client.image.generate("test")
    
    # Get statistics
    stats = client.get_stats()
    
    print("Rate Limiter Stats:", stats["rate_limiter"])
    print("Cache Stats:", stats["cache"])
```

### Stats Output

```python
{
    "rate_limiter": {
        "requests_per_minute": 60,
        "current_usage": 15,
        "remaining": 45,
        "reset_time": "2024-01-15T10:30:00Z"
    },
    "cache": {
        "hit_rate": 0.75,
        "hits": 150,
        "misses": 50,
        "evictions": 5
    }
}
```

---

## 🧪 Testing with Client

### Mock Dependencies

```python
from unittest.mock import Mock, AsyncMock
from blossom_ai import BlossomClient

# Create mocks
mock_http = Mock()
mock_http.post = AsyncMock(return_value=mock_response)

mock_cache = Mock()
mock_cache.get = AsyncMock(return_value=None)

# Test with mocked dependencies
with BlossomClient(
    http_client=mock_http,
    cache=mock_cache
) as client:
    response = client.text.generate("test")
    
    # Verify behavior
    mock_http.post.assert_called_once()
```

### Test Context Managers

```python
import pytest
from blossom_ai import BlossomClient

@pytest.mark.asyncio
async def test_async_client():
    async with BlossomClient() as client:
        response = await client.text.generate("test")
        assert response.text is not None
```

---

## 🔄 Resource Management

### Automatic Cleanup

```python
# Context manager ensures cleanup
with BlossomClient() as client:
    response = client.text.generate("test")
    # Resources automatically cleaned up on exit
```

### Manual Cleanup

```python
client = BlossomClient()
try:
    response = client.text.generate("test")
finally:
    # Manual cleanup
    await client.close()
```

### Check if Closed

```python
client = BlossomClient()

# Check status
if not client._closed:
    response = client.text.generate("test")

# Close when done
await client.close()
```

---

## 🎓 Best Practices

### 1. Always Use Context Managers

```python
# Good ✅
with BlossomClient() as client:
    response = client.text.generate("test")

# Bad ❌
client = BlossomClient()
response = client.text.generate("test")
# Resources not cleaned up!
```

### 2. Reuse Client When Possible

```python
# Good ✅ - Reuse client
with BlossomClient() as client:
    for prompt in prompts:
        response = client.text.generate(prompt)

# Bad ❌ - Create multiple clients
for prompt in prompts:
    with BlossomClient() as client:
        response = client.text.generate(prompt)
```

### 3. Handle Errors Gracefully

```python
from blossom_ai import BlossomError

with BlossomClient() as client:
    try:
        response = client.text.generate("test")
    except BlossomError as e:
        print(f"Error: {e}")
```

### 4. Use Appropriate Configuration

```python
# Production config
config = SessionConfig(
    cache_enabled=True,
    rate_limit_per_minute=60,
    timeout=30.0
)

with BlossomClient(config=config) as client:
    response = client.text.generate("test")
```

---

## 🆘 Troubleshooting

### Client Not Responding

```python
# Increase timeout
config = SessionConfig(timeout=60.0)

with BlossomClient(config=config) as client:
    response = client.text.generate("test")
```

### Rate Limit Exceeded

```python
# Reduce rate limit or add delays
config = SessionConfig(rate_limit_per_minute=30)

with BlossomClient(config=config) as client:
    response = client.text.generate("test")
```

### Memory Issues

```python
# Disable caching or reduce cache size
config = SessionConfig(
    cache_enabled=True,
    cache_max_size=100  # Limit cache size
)

with BlossomClient(config=config) as client:
    response = client.text.generate("test")
```

---

## 🔗 Related Documentation

- [⚙️ Configuration System](CONFIGURATION.md)
- [💉 Dependency Injection](DEPENDENCY_INJECTION.md)
- [💾 Caching System](CACHING.md)
- [⏱️ Rate Limiting](RATE_LIMITING.md)
