# 🌸 Blossom AI

### Production-Ready Python SDK for Pollinations.AI

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.7.0-blue.svg)](https://pypi.org/project/eclips-blossom-ai/)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](https://github.com/PrimeevolutionZ/blossom-ai)

**Professional-grade SDK with enterprise architecture:**
- 🏗️ **Clean Architecture**: Dependency Injection, Protocol-based interfaces
- 🔒 **Production Security**: JSON-only storage, API key sanitization, DoS protection
- ⚡ **High Performance**: Thread-safe caching, connection pooling, LRU eviction
- 🎯 **Type-Safe**: Full type hints, Pydantic validation, immutable configs
- 🧪 **Battle-Tested**: 80%+ coverage, integration tests, VCR.py fixtures

---

## 🚀 Quick Start

### Installation

```bash
pip install eclips-blossom-ai
```

### Simplest Usage (No API Key Required*)

```python
from blossom_ai import ai

# Generate image
image = ai.image.generate("sunset over mountains")

# Save to file
ai.image.save("cyberpunk city", "city.png")

# Generate text
text = ai.text.generate("Explain quantum computing")

# Stream response
for chunk in ai.text.stream("Tell me a story"):
    print(chunk, end='', flush=True)
```

*Some features require API key. Get yours at [pollinations.ai](https://pollinations.ai)

### With API Key (Full Features)

```python
import os
from blossom_ai import BlossomClient

# ✅ Best practice: Use environment variables
api_token = os.getenv('POLLINATIONS_API_KEY')

with BlossomClient(api_token=api_token) as client:
    # HD image with advanced controls
    image = client.image.generate(
        "majestic dragon",
        quality="hd",
        width=1920,
        height=1080,
        guidance_scale=7.5,
        negative_prompt="blurry, low quality"
    )
    
    # Advanced text generation
    response = client.text.generate(
        "Design a microservices architecture",
        max_tokens=2000,
        frequency_penalty=0.5
    )
    
    # Vision analysis
    from blossom_ai import MessageBuilder
    
    messages = [
        MessageBuilder.image(
            role="user",
            text="What's in this image?",
            image_url="https://example.com/photo.jpg",
            detail="high"
        )
    ]
    
    analysis = client.text.chat(messages, model="openai")
```

---

## 🏗️ Architecture Highlights

### Clean Dependency Injection

```python
from blossom_ai import BlossomClient
from blossom_ai.core.config import SessionConfig
from blossom_ai.utils.cache import CacheManager, CacheConfig
from blossom_ai.utils.rate_limiter import TokenBucketRateLimiter

# Custom configuration
config = SessionConfig(
    api_key="your-key",
    rate_limit_per_minute=120,  # Auto-detected for sk_/pk_ keys
    cache_enabled=True,
    timeout=45.0
)

# Custom cache
cache_config = CacheConfig(
    backend="hybrid",  # memory + disk
    ttl=7200,
    max_memory_size=100
)
cache = CacheManager(cache_config)

# Custom rate limiter
rate_limiter = TokenBucketRateLimiter(
    requests_per_minute=120,
    burst_capacity=10
)

# Inject dependencies
client = BlossomClient(
    config=config,
    cache=cache,
    rate_limiter=rate_limiter
)
```

### Protocol-Based Interfaces

```python
from blossom_ai.core.interfaces import (
    ConfigProtocol,
    HttpClientProtocol,
    LoggerProtocol,
    RateLimiterInterface,
    CacheBackendProtocol
)

# Easy mocking for tests
class MockHttpClient(HttpClientProtocol):
    async def get(self, url: str, **kwargs): ...
    async def post(self, url: str, **kwargs): ...
    async def close(self): ...

# Inject mock
client = BlossomClient(http_client=MockHttpClient())
```

---

## 🎨 Core Features

### 1. Image Generation

**HD Quality with Advanced Controls**

```python
with BlossomClient(api_token=token) as client:
    image = client.image.generate(
        prompt="epic fantasy landscape",
        model="flux",
        quality="hd",              # low/medium/high/hd
        width=1920,
        height=1080,
        guidance_scale=7.5,        # 1.0-20.0
        negative_prompt="blurry, watermark",
        seed=42,                   # reproducible results
        enhance=True,
        transparent=False,
        style="photorealistic"
    )
```

**Quick URL Generation (No Download)**

```python
url = client.image.generate_url(
    "minimalist logo",
    model="flux",
    width=512,
    height=512
)
print(url)  # Instant URL, no API call to fetch image
```

### 2. Text Generation

**Advanced Parameters**

```python
with BlossomClient(api_token=token) as client:
    response = client.text.generate(
        "Write a technical article about microservices",
        model="openai",
        max_tokens=2000,
        frequency_penalty=0.5,   # reduce repetition
        presence_penalty=0.3,    # encourage diversity
        stream=False
    )
```

**Real-Time Streaming**

```python
with BlossomClient(api_token=token) as client:
    full_response = client.text.generate(
        "Explain quantum computing",
        stream=True  # Returns aggregated string after streaming
    )
    print(full_response)
```

**Multi-Turn Chat**

```python
messages = [
    {"role": "system", "content": "You are a helpful coding assistant"},
    {"role": "user", "content": "How do I optimize SQL queries?"},
    {"role": "assistant", "content": "Here are key techniques..."},
    {"role": "user", "content": "Show me an example with indexes"}
]

response = client.text.chat(messages, model="claude")
```

### 3. Vision Analysis 

**Analyze Images**

```python
from blossom_ai import MessageBuilder

with BlossomClient(api_token=token) as client:
    # From URL
    messages = [
        MessageBuilder.image(
            role="user",
            text="Describe this image in detail",
            image_url="https://example.com/photo.jpg",
            detail="high"  # low/auto/high
        )
    ]
    
    analysis = client.text.chat(messages, model="openai")
    
    # From local file
    messages = [
        MessageBuilder.image(
            role="user",
            text="What objects are in this image?",
            image_path="/path/to/image.jpg"
        )
    ]
    
    result = client.text.chat(messages, model="openai")
```

---

## 🔧 Production Features

### Thread-Safe Caching

```python
from blossom_ai.utils.cache import CacheManager, CacheConfig, CacheBackend

config = CacheConfig(
    backend=CacheBackend.HYBRID,  # memory + disk
    ttl=3600,
    max_memory_size=100,
    max_disk_size=1000,
    cache_text=True,
    cache_images=False  # images are large
)

cache = CacheManager(config)

# Thread-safe operations
cache.set("key", "value")
value = cache.get("key")

# Async support
await cache.aset("key", "value")
value = await cache.aget("key")

# Statistics
stats = cache.get_stats()
print(f"Hit rate: {stats.hit_rate}%")
```

### Smart Rate Limiting

```python
from blossom_ai.utils.rate_limiter import TokenBucketRateLimiter

limiter = TokenBucketRateLimiter(
    requests_per_minute=120,
    burst_capacity=10,
    max_buckets=1000  # LRU eviction
)

# Async acquisition
await limiter.acquire(key="user_123")

# With timeout
success = await limiter.acquire_with_wait(
    key="user_123",
    timeout=5.0
)

# Statistics
stats = limiter.get_stats()
print(stats)
```

### Enhanced Logging

```python
from blossom_ai.utils.logging import StructuredLogger, set_correlation_id

logger = StructuredLogger("my_app")

set_correlation_id("req-12345")

logger.info("Processing request", user_id=123, action="generate")
logger.error("Failed", error=str(e), exc_info=True)
```

### Reasoning Module

```python
from blossom_ai.utils.reasoning import ReasoningEnhancer, ReasoningLevel

enhancer = ReasoningEnhancer()

# Enhance prompt with structured thinking
enhanced = enhancer.enhance(
    "Design a distributed system",
    level=ReasoningLevel.HIGH  # LOW/MEDIUM/HIGH/ADAPTIVE
)

response = client.text.generate(enhanced)

# Extract reasoning
result = enhancer.extract_reasoning(response)
print("Reasoning:", result['reasoning'])
print("Answer:", result['answer'])
print("Confidence:", result['confidence'])
```

---

## 🧪 Testing Support

### Easy Mocking

```python
from unittest.mock import Mock, AsyncMock
from blossom_ai import BlossomClient

# Mock HTTP client
mock_http = Mock()
mock_http.get = AsyncMock(return_value=mock_response)
mock_http.post = AsyncMock(return_value=mock_response)
mock_http.close = AsyncMock()

# Mock rate limiter
mock_limiter = Mock()
mock_limiter.acquire_with_wait = AsyncMock(return_value=True)

# Inject mocks
client = BlossomClient(
    http_client=mock_http,
    rate_limiter=mock_limiter
)
```

### VCR.py Integration

```python
import pytest
from blossom_ai import BlossomClient

@pytest.mark.vcr()
async def test_image_generation(vcr):
    """Test with recorded cassettes"""
    async with BlossomClient() as client:
        image = await client.image.generate("test", width=512, height=512)
        assert len(image) > 0
```

---

## 📊 Why Choose Blossom AI?

### Enterprise Architecture

```
✓ Dependency Injection for testability
✓ Protocol-based interfaces for flexibility
✓ Immutable configurations (frozen dataclasses)
✓ Thread-safe operations with RLock
✓ Async-first design with sync wrappers
✓ Clean separation of concerns
```

### Security Hardened

```
✓ JSON-only storage (no pickle vulnerabilities)
✓ API key sanitization in logs and cache
✓ DoS protection (response size limits)
✓ Path traversal prevention
✓ Input validation with Pydantic
✓ SSL enforcement
```

### Production Performance

```
✓ Connection pooling (httpx limits)
✓ LRU eviction (cache, rate limiter, models)
✓ Smart TTL cleanup (background threads)
✓ Efficient memory management
✓ No memory leaks (context managers)
✓ Optimized caching strategies
```

### Developer Experience

```
✓ Full type hints (mypy strict)
✓ Comprehensive error messages
✓ Structured logging with context
✓ 85%+ test coverage
✓ Clear documentation
✓ Sugar layer for simplicity
```

---

## 🎯 Design Patterns

### Factory Pattern (Cache)

```python
from blossom_ai.utils.cache import get_default_cache
from blossom_ai.core.config import SessionConfig

config = SessionConfig.from_env()
cache = get_default_cache(config, logger)
```

### Builder Pattern (Parameters)

```python
from blossom_ai.generators.parameter_builder import ImageParamsV2, ChatParamsV2

image_params = ImageParamsV2(
    model="flux",
    width=1920,
    height=1080,
    quality="hd"
)

query = image_params.to_query()  # URL-encoded params
```

### Strategy Pattern (Consensus)

```python
from blossom_ai.utils.reasoning.advanced import ConsensusReasoning, ConsensusStrategy

consensus = ConsensusReasoning(client.text)

result = await consensus.solve_with_consensus(
    "Design a caching strategy",
    models=["gemini", "claude", "mistral"],
    strategy=ConsensusStrategy.SYNTHESIZE  # MAJORITY_VOTE/WEIGHTED/DEBATE
)
```

### Singleton Pattern (Session Manager)

```python
from blossom_ai.core.session_manager import SyncSessionManager

# Same config returns same instance (per-thread)
manager = SyncSessionManager(config)
session = manager.get_session()  # Thread-local
```

---

## 📚 Documentation

| Document                                                                                                             | Description         |
|----------------------------------------------------------------------------------------------------------------------|---------------------|
| [📖 Full Documentation](https://github.com/PrimeevolutionZ/blossom-ai/blob/master/blossom_ai/docs/INDEX.md)          | Complete guide      |
| [👁️ Vision Guide](https://github.com/PrimeevolutionZ/blossom-ai/blob/master/blossom_ai/docs/VISION.md)              | Image analysis      |
| [🎨 Image Generation](https://github.com/PrimeevolutionZ/blossom-ai/blob/master/blossom_ai/docs/IMAGE_GENERATION.md) | HD images           |
| [💬 Text Generation](https://github.com/PrimeevolutionZ/blossom-ai/blob/master/blossom_ai/docs/TEXT_GENERATION.md)   | Advanced text       |
| [🧠 Reasoning Guide](https://github.com/PrimeevolutionZ/blossom-ai/blob/master/blossom_ai/docs/REASONING.md)         | Structured thinking |
| [💾 Caching Guide](https://github.com/PrimeevolutionZ/blossom-ai/blob/master/blossom_ai/docs/CACHING.md)             | Performance         |
| [📋 API Reference](https://github.com/PrimeevolutionZ/blossom-ai/blob/master/blossom_ai/docs/API_REFERENCE.md)       | Technical docs      |
| [🔧 Configuration](https://github.com/PrimeevolutionZ/blossom-ai/blob/master/blossom_ai/docs/CONFIGURATION.md)       | Setup guide         |

---

## 🛠️ Advanced Usage

### Custom HTTP Client

```python
from blossom_ai.utils.http_client import HttpxClient
from blossom_ai.core.config import SessionConfig

config = SessionConfig(
    async_limit_total=100,
    async_limit_per_host=30,
    async_timeout_connect=30,
    timeout=60.0
)

http_client = HttpxClient(config)
client = BlossomClient(http_client=http_client)
```

### Custom Logger

```python
from blossom_ai.utils.logging import StructuredLogger

logger = StructuredLogger("my_app", level="DEBUG")
client = BlossomClient(logger=logger)
```

### Concurrent Operations

```python
import asyncio

async def concurrent_generation():
    async with BlossomClient(api_token=token) as client:
        # Run multiple operations concurrently
        tasks = [
            client.text.generate("Question 1"),
            client.text.generate("Question 2"),
            client.image.generate("Prompt 1", width=512, height=512),
            client.image.generate("Prompt 2", width=512, height=512)
        ]
        
        results = await asyncio.gather(*tasks)
        return results

results = asyncio.run(concurrent_generation())
```

### Resource Management

```python
# Context manager ensures cleanup
with BlossomClient(api_token=token) as client:
    result = client.text.generate("Test")
    # Automatic cleanup on exit

# Manual control
client = BlossomClient(api_token=token)
try:
    result = await client.text.generate("Test")
finally:
    await client.close()  # Explicit cleanup
```

---

## 🔒 Security Best Practices

```python
import os
from pathlib import Path

# ✅ Environment variables
api_token = os.getenv('POLLINATIONS_API_KEY')

# ✅ .env files (not committed)
from dotenv import load_dotenv
load_dotenv()
api_token = os.getenv('POLLINATIONS_API_KEY')

# ❌ Hardcoded (NEVER do this)
api_token = "sk_live_abc123..."  # NO!

# ✅ File validation
from blossom_ai.utils.security import validate_image_file

try:
    safe_path = validate_image_file("/path/to/image.jpg")
except ValueError as e:
    print(f"Security error: {e}")
```

---

## 📦 Installation Options

```bash
# Basic installation
pip install eclips-blossom-ai

# With all optional dependencies
pip install eclips-blossom-ai[all]

# Development installation
pip install eclips-blossom-ai[dev]

# Documentation tools
pip install eclips-blossom-ai[docs]

# Testing tools
pip install eclips-blossom-ai[test]
```

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](https://github.com/PrimeevolutionZ/blossom-ai/blob/master/CONTRIBUTING.md) for:
- Code style guidelines
- Testing requirements
- Pull request process
- Development setup

---

## 📄 License

MIT License - see [LICENSE](https://github.com/PrimeevolutionZ/blossom-ai/blob/master/LICENSE) file.

---

## 🆘 Support

- 🐛 **Bug reports**: [GitHub Issues](https://github.com/PrimeevolutionZ/blossom-ai/issues)
- 🔒 **Security issues**: See [SECURITY.md](https://github.com/PrimeevolutionZ/blossom-ai/blob/master/SECURITY.md)
- 💡 **Feature requests**: [GitHub Discussions](https://github.com/PrimeevolutionZ/blossom-ai/discussions)
- 📚 **Documentation**: [Full docs](https://github.com/PrimeevolutionZ/blossom-ai/blob/master/blossom_ai/docs/INDEX.md)

---

<div align="center">

**Made with 🌸 and ❤️ by [Eclips Team](https://github.com/PrimeevolutionZ)**

[![PyPI](https://img.shields.io/badge/PyPI-Package-blue)](https://pypi.org/project/eclips-blossom-ai/)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-green)](https://github.com/PrimeevolutionZ/blossom-ai)
[![Version](https://img.shields.io/badge/version-0.7.0-success.svg)](https://pypi.org/project/eclips-blossom-ai/)

</div>