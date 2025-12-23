# ⚙️ Configuration System Guide

> Complete guide to configuring Blossom AI for different environments and use cases

---

## 🎯 Overview

Blossom AI provides a flexible, immutable configuration system that allows you to customize:
- API settings and authentication
- Caching behavior
- Rate limiting
- Logging levels
- Performance parameters
- Security settings

---

## 📋 Configuration Methods

### 1. Environment Variables (Recommended)

Create a `.env` file in your project root:

```env
# Required
BLOSSOM_API_KEY=your_api_key_here

# Optional
BLOSSOM_BASE_URL=https://api.blossom-ai.com
BLOSSOM_RATE_LIMIT_PER_MINUTE=60
BLOSSOM_CACHE_ENABLED=true
BLOSSOM_CACHE_BACKEND=memory
BLOSSOM_CACHE_TTL=3600
BLOSSOM_TIMEOUT=30.0
BLOSSOM_MAX_FILE_SIZE_MB=10
BLOSSOM_LOG_LEVEL=INFO
```

Load automatically:
```python
from blossom_ai import BlossomClient

# Configuration loaded from .env automatically
with BlossomClient() as client:
    response = client.text.generate("test")
```

### 2. SessionConfig Object

```python
from blossom_ai import BlossomClient, SessionConfig

config = SessionConfig(
    api_key="your-api-key",
    base_url="https://api.blossom-ai.com",
    rate_limit_per_minute=60,
    cache_enabled=True,
    cache_backend="memory",
    cache_ttl=3600,
    timeout=30.0,
    max_file_size_mb=10,
    connection_pool_size=20
)

with BlossomClient(config=config) as client:
    response = client.text.generate("test")
```

### 3. Configuration File

Create `blossom_config.py`:

```python
from blossom_ai import SessionConfig

# Development configuration
DEV_CONFIG = SessionConfig(
    api_key="dev-key",
    cache_enabled=True,
    cache_backend="memory",
    rate_limit_per_minute=30,
    log_level="DEBUG"
)

# Production configuration
PROD_CONFIG = SessionConfig(
    api_key=os.getenv("BLOSSOM_API_KEY"),
    cache_enabled=True,
    cache_backend="redis",
    rate_limit_per_minute=120,
    log_level="INFO",
    timeout=60.0
)

# Testing configuration
TEST_CONFIG = SessionConfig(
    api_key="test-key",
    cache_enabled=False,
    rate_limit_per_minute=10,
    log_level="WARNING"
)
```

Usage:
```python
from blossom_config import PROD_CONFIG

with BlossomClient(config=PROD_CONFIG) as client:
    response = client.text.generate("test")
```

---

## 🔧 Configuration Parameters

### Core Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `api_key` | `str` | `None` | API key for authentication |
| `base_url` | `str` | `https://api.blossom-ai.com` | Base API URL |
| `timeout` | `float` | `30.0` | Request timeout in seconds |
| `rate_limit_per_minute` | `int` | `60` | Rate limit per minute |

### Caching Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cache_enabled` | `bool` | `False` | Enable/disable caching |
| `cache_backend` | `str` | `