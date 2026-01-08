# 📚 Blossom AI Documentation v0.7.0

> **Enterprise-Grade Python SDK with Clean Architecture**

Welcome to Blossom AI - a production-ready SDK built on modern software engineering principles: Dependency Injection, Protocol-based interfaces, thread-safe operations, and comprehensive security.

---

## 🏗️ Architecture Overview

### Design Principles

**Clean Architecture**
- Dependency Injection for all components
- Protocol-based interfaces (not concrete classes)
- Immutable configurations (frozen dataclasses)
- Separation of concerns (core, generators, utils)

**Security First**
- JSON-only storage (no pickle)
- API key sanitization in logs/cache
- DoS protection (size limits)
- Path traversal prevention
- SSL enforcement

**Production Performance**
- Thread-safe with RLock
- LRU eviction everywhere (cache, rate limiter, models)
- Connection pooling (httpx)
- Smart TTL cleanup
- No memory leaks (context managers)

---

## 🚀 Getting Started

Perfect for newcomers and quick reference.

| Guide                              | Description                        | Time   |
|------------------------------------|------------------------------------|--------|
| [⚡ Quick Start](QUICKSTART.md)     | Your first generation in 2 minutes | 2 min  |
| [📦 Installation](INSTALLATION.md) | Install and configure              | 5 min  |
| [🎓 Tutorial](TUTORIAL.md)         | Step-by-step guide                 | 15 min |

### Instant Start

```python
from blossom_ai import ai

#need api key!!!
image = ai.image.generate("sunset")
text = ai.text.generate("Hello world")
```

---

## 🎨 Core Features

### Image Generation

| Topic                                      | Description                                | Level        |
|--------------------------------------------|--------------------------------------------|--------------|
| [🎨 Image Generation](IMAGE_GENERATION.md) | HD images, quality control, guidance scale | Basic        |
| [🌈 Advanced Controls](IMAGE_ADVANCED.md)  | Negative prompts, transparency, img2img    | Advanced     |
| [🔗 URL Generation](IMAGE_URLS.md)         | Get URLs without downloading               | Basic        |
| [💾 Batch Processing](IMAGE_BATCH.md)      | Generate multiple images efficiently       | Intermediate |

**Quick Example:**
```python
from blossom_ai import BlossomClient

with BlossomClient(api_token="your-token") as client:
    image = client.image.generate(
        "epic fantasy landscape",
        quality="hd",
        width=1920,
        height=1080,
        guidance_scale=7.5,
        negative_prompt="blurry"
    )
```

### Text Generation

| Topic                                       | Description                        | Level        |
|---------------------------------------------|------------------------------------|--------------|
| [💬 Text Generation](TEXT_GENERATION.md)    | Basic text, streaming, chat        | Basic        |
| [⚙️ Advanced Parameters](TEXT_ADVANCED.md)  | Max tokens, penalties, temperature | Intermediate |
| [🛠️ Function Calling](FUNCTION_CALLING.md) | Tool use, structured outputs       | Advanced     |
| [📋 JSON Mode](JSON_MODE.md)                | Reliable structured data           | Intermediate |

**Quick Example:**
```python
with BlossomClient(api_token="your-token") as client:
    response = client.text.generate(
        "Explain quantum computing",
        max_tokens=2000,
        frequency_penalty=0.5
    )
```

### Vision & Multimodal

| Topic                                    | Description                         | Level        |
|------------------------------------------|-------------------------------------|--------------|
| [👁️ Vision Analysis](VISION.md)         | Analyze images with AI              | Basic        |
| [🖼️ Local Images](VISION_LOCAL.md)      | Work with local files               | Basic        |
| [📊 Multiple Images](VISION_MULTI.md)    | Compare and analyze multiple images | Intermediate |
| [🎭 Multimodal Apps](MULTIMODAL_APPS.md) | Build vision-powered apps           | Advanced     |

**Quick Example:**
```python
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

## 🏛️ Architecture Deep Dive

### Core Systems

| Topic                                              | Description                   | Audience   |
|----------------------------------------------------|-------------------------------|------------|
| [🏗️ Architecture Overview](ARCHITECTURE.md)       | Design principles, patterns   | Developers |
| [💉 Dependency Injection](DEPENDENCY_INJECTION.md) | DI patterns, testing          | Advanced   |
| [🔌 Protocol Interfaces](PROTOCOL_INTERFACES.md)   | Abstract interfaces           | Developers |
| [⚙️ Configuration System](CONFIGURATION.md)        | Immutable configs, validation | Developers |

### Key Components

| Component        | Guide                               | Description                           |
|------------------|-------------------------------------|---------------------------------------|
| **Client**       | [BlossomClient Guide](CLIENT.md)    | Main entry point, resource management |
| **Generators**   | [Generators Guide](GENERATORS.md)   | Image/text generation, base classes   |
| **HTTP Client**  | [HTTP Client Guide](HTTP_CLIENT.md) | httpx-based, async-first              |
| **Cache**        | [Caching System](CACHING.md)        | Thread-safe, LRU, JSON storage        |
| **Rate Limiter** | [Rate Limiting](RATE_LIMITING.md)   | Token bucket, LRU eviction            |
| **Models**       | [Model System](MODELS.md)           | Dynamic discovery, caching            |
| **Security**     | [Security Guide](../../SECURITY.md) | Validation, sanitization              |

---

## 🛠️ Utilities & Extensions

### Production Utilities

| Utility                              | Description                       | Use Case                    |
|--------------------------------------|-----------------------------------|-----------------------------|
| [💾 Caching](CACHING.md)             | Thread-safe cache, hybrid storage | Reduce costs, improve speed |
| [⏱️ Rate Limiting](RATE_LIMITING.md) | Token bucket, per-key limits      | API quota management        |
| [📝 Logging](LOGGING.md)             | Structured logs, correlation IDs  | Debugging, monitoring       |
| [🔒 Security](../../SECURITY.md)     | Validation, sanitization          | Input safety                |

### AI Enhancements

| Feature                                  | Description              | Use Case            |
|------------------------------------------|--------------------------|---------------------|
| [🧠 Reasoning](REASONING.md)             | Structured thinking, CoT | Complex problems    |
| [🔄 Self-Correction](SELF_CORRECTION.md) | Iterative improvement    | Quality enhancement |
| [🤝 Consensus](CONSENSUS.md)             | Multi-model agreement    | Reliability         |
| [📖 File Reader](FILE_READER.md)         | Safe file processing     | Document analysis   |

---

### Quality Assurance

```python
# Easy mocking with protocols
from unittest.mock import Mock, AsyncMock

mock_http = Mock()
mock_http.get = AsyncMock(return_value=mock_response)

client = BlossomClient(http_client=mock_http)
```

---

## 📱 Real-World Applications

### Example Projects

| Project                              | Description          | Complexity   |
|--------------------------------------|----------------------|--------------|
| [🤖 Discord Bot](DISCORD_BOT.md)     | Image generation bot | Intermediate |
| [📱 Telegram Bot](TELEGRAM_BOT.md)   | AI chat bot          | Intermediate |
| [🌐 Web Application](WEB_APP.md)     | FastAPI/Flask app    | Advanced     |
| [📊 Data Pipeline](DATA_PIPELINE.md) | Batch processing     | Advanced     |
| [🔍 Vision App](VISION_APP.md)       | Image analysis tool  | Intermediate |

### Integration Patterns

| Pattern     | Guide                             | Description          |
|-------------|-----------------------------------|----------------------|
| **FastAPI** | [FastAPI Integration](FASTAPI.md) | Async web framework  |
| **Flask**   | [Flask Integration](FLASK.md)     | Traditional web apps |
| **Celery**  | [Celery Integration](CELERY.md)   | Background tasks     |
| **Docker**  | [Docker Deployment](DOCKER.md)    | Containerization     |

---

## 🎓 Advanced Topics

### Performance Optimization

| Topic                                          | Description                | Impact |
|------------------------------------------------|----------------------------|--------|
| [⚡ Performance Tuning](PERFORMANCE.md)         | Optimization strategies    | High   |
| [🔄 Async Patterns](ASYNC_PATTERNS.md)         | Async/await best practices | High   |
| [💾 Memory Management](MEMORY.md)              | Prevent leaks, optimize    | Medium |
| [🔧 Connection Pooling](CONNECTION_POOLING.md) | HTTP optimization          | Medium |

### Architectural Patterns

| Pattern       | Guide                                     | Use Case         |
|---------------|-------------------------------------------|------------------|
| **Factory**   | [Factory Pattern](FACTORY_PATTERN.md)     | Object creation  |
| **Builder**   | [Builder Pattern](BUILDER_PATTERN.md)     | Complex configs  |
| **Strategy**  | [Strategy Pattern](STRATEGY_PATTERN.md)   | Algorithms       |
| **Singleton** | [Singleton Pattern](SINGLETON_PATTERN.md) | Shared instances |

---

## 🔍 Reference Documentation

### API Reference

| Document                                      | Description                      |
|-----------------------------------------------|----------------------------------|
| [📖 Complete API Reference](API_REFERENCE.md) | All classes, methods, parameters |
| [🎨 Image API](API_IMAGE.md)                  | Image generation endpoints       |
| [💬 Text API](API_TEXT.md)                    | Text generation endpoints        |
| [👁️ Vision API](API_VISION.md)               | Vision analysis endpoints        |
| [⚙️ Config API](API_CONFIG.md)                | Configuration options            |

### Error Handling

| Topic                                  | Description              |
|----------------------------------------|--------------------------|
| [❌ Error Types](ERROR_TYPES.md)        | All error classes        |
| [🔧 Error Handling](ERROR_HANDLING.md) | Handle errors gracefully |
| [🐛 Debugging Guide](DEBUGGING.md)     | Troubleshooting tips     |
| [📊 Status Codes](STATUS_CODES.md)     | HTTP status meanings     |


---

## 🎯 Quick Navigation

### By Task

**Getting Started**
- [Install Library](INSTALLATION.md) → [Quick Start](QUICKSTART.md) → [First Image](IMAGE_GENERATION.md#quick-start)

**Image Generation**
- [Basic Images](IMAGE_GENERATION.md) → [HD Quality](IMAGE_ADVANCED.md#hd-quality) → [Advanced Controls](IMAGE_ADVANCED.md)

**Text Generation**
- [Basic Text](TEXT_GENERATION.md) → [Streaming](TEXT_ADVANCED.md) → [Function Calling](FUNCTION_CALLING.md)

**Vision Analysis**
- [Vision Basics](VISION.md) → [Local Images](VISION_LOCAL.md) → [Multi-Image](VISION_MULTI.md)

**Production**
- [Configuration](CONFIGURATION.md) → [Caching](CACHING.md) → [Rate Limiting](RATE_LIMITING.md) → [Error Handling](ERROR_HANDLING.md)

**Testing**
- [Testing Basics](TESTING.md)

### By Experience Level

**Beginners**
- [Quick Start](QUICKSTART.md)
- [Basic Image Generation](IMAGE_GENERATION.md)
- [Basic Text Generation](TEXT_GENERATION.md)

**Intermediate**
- [Advanced Parameters](TEXT_ADVANCED.md)
- [Vision Analysis](VISION.md)
- [Caching](CACHING.md)
- [Discord Bot](DISCORD_BOT.md)

**Advanced**
- [Architecture](ARCHITECTURE.md)
- [Dependency Injection](DEPENDENCY_INJECTION.md)
- [Custom Components](CUSTOM_COMPONENTS.md)
- [Performance Tuning](PERFORMANCE.md)

---

## 💡 Code Examples

### Basic Usage

```python
from blossom_ai import ai

# Simplest possible usage
image = ai.image.generate("sunset")
text = ai.text.generate("Hello")
```

### Production Usage

```python
from blossom_ai import BlossomClient
from blossom_ai.core.config import SessionConfig
from blossom_ai.utils.cache import CacheManager, CacheConfig

# Custom configuration
config = SessionConfig(
    api_key="your-key",
    rate_limit_per_minute=120,
    cache_enabled=True
)

# Custom cache
cache = CacheManager(CacheConfig(
    backend="hybrid",
    ttl=3600
))

# Inject dependencies
with BlossomClient(config=config, cache=cache) as client:
    response = client.text.generate("Test")
```

### Testing

```python
from unittest.mock import Mock, AsyncMock

# Mock HTTP client
mock_http = Mock()
mock_http.get = AsyncMock(return_value=mock_response)

# Inject mock
client = BlossomClient(http_client=mock_http)

# Test without API calls
result = await client.text.generate("Test")
```
---

## 🆘 Support & Community

### Get Help

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/PrimeevolutionZ/blossom-ai/issues)
- 🔒 **Security**: [Security Policy](../../SECURITY.md)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/PrimeevolutionZ/blossom-ai/discussions)
- 📧 **Email**: develop@eclips-team.ru

### Contributing

- 📝 [Contributing Guide](../../CONTRIBUTING.md)
- 🎨 [Code Style Guide](CODE_STYLE.md)


---

## 📦 Package Information

- **Version**: 0.7.0
- **Python**: 3.11+
- **License**: MIT
- **Repository**: [GitHub](https://github.com/PrimeevolutionZ/blossom-ai)
- **PyPI**: [eclips-blossom-ai](https://pypi.org/project/eclips-blossom-ai/)

---

<div align="center">

**Built with 🌸 by [Eclips Team](https://github.com/PrimeevolutionZ)**

[Documentation](INDEX.md) • [Quick Start](QUICKSTART.md) • [GitHub](https://github.com/PrimeevolutionZ/blossom-ai) • [PyPI](https://pypi.org/project/eclips-blossom-ai/)

[Contributing](../../CONTRIBUTING.md) • [Security](../../SECURITY.md) • [License](../../LICENSE) • [Changelog](CHANGELOG.md)

</div>