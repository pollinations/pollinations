# ⚙️ Configuration API Reference

> **Complete reference for Blossom AI configuration options and settings**

---

## Overview

The Configuration API provides comprehensive control over all aspects of Blossom AI behavior through the `SessionConfig` class. It manages everything from API credentials to performance tuning parameters.

## Quick Start

```python
from blossom_ai import SessionConfig, BlossomClient

# Basic configuration
config = SessionConfig(
    api_key="your-api-key",
    timeout=30.0,
    cache_enabled=True
)

async with BlossomClient(config=config) as client:
    result = await client.text.generate("Hello world")
```

---

## SessionConfig Class

### Constructor

```python
SessionConfig(
    # Authentication
    api_key: Optional[str] = None,
    
    # Timeouts
    timeout: float = 30.0,
    
    # Retry behavior
    max_retries: int = 3,
    
    # Rate limiting
    rate_limit_per_minute: int = 60,
    
    # Caching
    cache_enabled: bool = True,
    cache_backend: str = "hybrid",
    cache_ttl: int = 3600,
    cache_max_memory: int = 100,
    cache_max_disk: int = 1000,
    
    # HTTP settings
    base_url: Optional[str] = None,
    
    # SSL/Security
    verify_ssl: bool = True,
    
    # Advanced HTTP
    sync_pool_connections: int = 10,
    sync_pool_maxsize: int = 20,
    async_limit_total: int = 100,
    async_limit_per_host: int = 30,
    async_timeout_connect: float = 5.0,
    async_timeout_sock_read: float = 5.0,
    
    # Logging
    log_level: str = "INFO",
    log_requests: bool = False,
    
    # Development
    test_mode: bool = False
)
```

---

## Configuration Parameters

### Authentication

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `api_key` | `str` | `None` | API key for authentication |

**API Key Detection:**
- **No key**: Uses default rate limits (60 req/min)
- **Publishable key** (`pk_*`): Strict limits (4 req/min)
- **Secret key** (`sk_*`): High limits (100,000 req/min)

```python
# From environment variable
import os
os.environ["POLLINATIONS_API_KEY"] = "your-key"

config = SessionConfig.from_env()

# Or pass directly
config = SessionConfig(api_key="your-key")
```

---

### Timeouts

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `timeout` | `float` | `30.0` | Total request timeout in seconds |

```python
# Short timeout for quick responses
config = SessionConfig(timeout=5.0)

# Long timeout for complex generations
config = SessionConfig(timeout=120.0)
```

**Timeout Behavior:**
- Applies to complete request/response cycle
- Includes connection, upload, processing, download
- Raises `TimeoutError` if exceeded

---

### Retry Behavior

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `max_retries` | `int` | `3` | Maximum retries for failed requests |

```python
# No retries (fail fast)
config = SessionConfig(max_retries=0)

# Aggressive retry (for unstable networks)
config = SessionConfig(max_retries=5)
```

**Retry Logic:**
- Retries on: 500, 502, 503, 504 status codes
- No retries on: 400, 401, 403, 404 (client errors)
- Exponential backoff between retries

---

### Rate Limiting

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `rate_limit_per_minute` | `int` | `60` | Requests per minute limit |

```python
# Conservative (development)
config = SessionConfig(rate_limit_per_minute=30)

# Aggressive (production)
config = SessionConfig(rate_limit_per_minute=1000)

# Unlimited (with secret key)
config = SessionConfig(rate_limit_per_minute=100000)
```

**Rate Limiting Features:**
- Token bucket algorithm (smooth limiting)
- Per-key isolation (different limits per API key)
- Burst capacity (handle short spikes)
- Automatic retry after rate limit

---

### Caching

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cache_enabled` | `bool` | `True` | Enable/disable caching |
| `cache_backend` | `str` | `"hybrid"` | Cache backend type |
| `cache_ttl` | `int` | `3600` | Time to live in seconds |
| `cache_max_memory` | `int` | `100` | Max memory entries (MB) |
| `cache_max_disk` | `int` | `1000` | Max disk entries (MB) |

**Cache Backends:**

```python
# Memory-only (fastest, limited by RAM)
config = SessionConfig(
    cache_enabled=True,
    cache_backend="memory",
    cache_max_memory=500
)

# Disk-only (persistent, slower)
config = SessionConfig(
    cache_enabled=True,
    cache_backend="disk",
    cache_max_disk=5000
)

# Hybrid (memory + disk, recommended)
config = SessionConfig(
    cache_enabled=True,
    cache_backend="hybrid",
    cache_max_memory=100,
    cache_max_disk=1000
)
```

**Caching Rules:**
- Text responses: Cached by default
- Image data: Not cached (too large)
- Cache keys include sanitized parameters
- LRU eviction when limits exceeded

---

### HTTP Settings

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `base_url` | `str` | `None` | Custom API base URL |

```python
# Use custom endpoint
config = SessionConfig(
    base_url="https://custom-api.example.com"
)

# Use default (recommended)
config = SessionConfig()  # Uses https://gen.pollinations.ai
```

---

### SSL/Security

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `verify_ssl` | `bool` | `True` | Verify SSL certificates |

```python
# Production (secure)
config = SessionConfig(verify_ssl=True)

# Development (with self-signed certs)
config = SessionConfig(verify_ssl=False)  # Not recommended for production
```

---

### Advanced HTTP - Sync

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sync_pool_connections` | `int` | `10` | Connection pool size |
| `sync_pool_maxsize` | `int` | `20` | Maximum concurrent connections |

```python
# High concurrency sync client
config = SessionConfig(
    sync_pool_connections=50,
    sync_pool_maxsize=100
)
```

---

### Advanced HTTP - Async

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `async_limit_total` | `int` | `100` | Total concurrent limit |
| `async_limit_per_host` | `int` | `30` | Per-host concurrent limit |
| `async_timeout_connect` | `float` | `5.0` | Connection timeout |
| `async_timeout_sock_read` | `float` | `5.0` | Socket read timeout |

```python
# High-performance async config
config = SessionConfig(
    async_limit_total=1000,
    async_limit_per_host=100,
    async_timeout_connect=2.0,
    async_timeout_sock_read=10.0
)
```

---

### Logging

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `log_level` | `str` | `"INFO"` | Logging level |
| `log_requests` | `bool` | `False` | Log HTTP requests |

**Log Levels:**
- `"DEBUG"`: Very verbose (includes request/response bodies)
- `"INFO"`: General information (recommended)
- `"WARNING"`: Only warnings and errors
- `"ERROR"`: Only errors
- `"CRITICAL"`: Only critical errors

```python
# Development (verbose)
config = SessionConfig(
    log_level="DEBUG",
    log_requests=True
)

# Production (minimal)
config = SessionConfig(
    log_level="WARNING",
    log_requests=False
)
```

---

### Development

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `test_mode` | `bool` | `False` | Enable test mode |

**Test Mode Effects:**
- Relaxes file validation
- Enables mock responses
- Disables rate limiting
- Allows unsafe operations

```python
# Test environment
config = SessionConfig(test_mode=True)
```

---

## Environment Variables

Configuration can be set via environment variables:

```bash
# Authentication
export POLLINATIONS_API_KEY="your-key"

# Timeouts
export POLLINATIONS_TIMEOUT="45.0"

# Retries
export POLLINATIONS_MAX_RETRIES="5"

# Rate limits
export POLLINATIONS_RATE_LIMIT="120"

# Cache
export BLOSSOM_AI_CACHE_TTL="7200"
```

**Variable Mapping:**

| Environment Variable | Config Parameter |
|---------------------|------------------|
| `POLLINATIONS_API_KEY` | `api_key` |
| `POLLINATIONS_TIMEOUT` | `timeout` |
| `POLLINATIONS_MAX_RETRIES` | `max_retries` |
| `POLLINATIONS_RATE_LIMIT` | `rate_limit_per_minute` |
| `BLOSSOM_AI_CACHE_TTL` | `cache_ttl` |

---

## Configuration Methods

### `from_env()`

Create configuration from environment variables.

```python
config = SessionConfig.from_env()
```

**Behavior:**
- Reads all `POLLINATIONS_*` and `BLOSSOM_AI_*` variables
- Falls back to defaults for missing variables
- Validates all settings

---

### Validation

All configurations are validated on creation:

```python
# Valid configurations work
config = SessionConfig(timeout=30.0)  # ✅ Valid

# Invalid configurations raise errors
config = SessionConfig(timeout=-5.0)  # ❌ Raises ValueError
config = SessionConfig(max_retries=-1)  # ❌ Raises ValueError
```

**Validation Rules:**
- `timeout > 0`
- `max_retries >= 0`
- `rate_limit_per_minute > 0`
- `rate_limit_per_minute <= 10000`
- All cache sizes > 0
- All HTTP limits > 0

---

## Configuration Examples

### 1. Development Configuration

```python
# Developer-friendly settings
config = SessionConfig(
    # Use environment key
    api_key=None,  # Will read from env
    
    # Quick feedback
    timeout=10.0,
    max_retries=2,
    
    # Conservative rate limits
    rate_limit_per_minute=60,
    
    # Aggressive caching
    cache_enabled=True,
    cache_backend="memory",
    cache_ttl=3600,
    cache_max_memory=500,
    
    # Verbose logging
    log_level="DEBUG",
    log_requests=True,
    
    # Enable test mode
    test_mode=True
)
```

---

### 2. Production Configuration

```python
# High-performance production settings
config = SessionConfig(
    # Explicit API key
    api_key="sk_live_...",
    
    # Generous timeouts
    timeout=60.0,
    max_retries=3,
    
    # High rate limits (with secret key)
    rate_limit_per_minute=10000,
    
    # Optimized caching
    cache_enabled=True,
    cache_backend="hybrid",
    cache_ttl=7200,
    cache_max_memory=200,
    cache_max_disk=2000,
    
    # High concurrency
    async_limit_total=1000,
    async_limit_per_host=100,
    
    # Minimal logging
    log_level="WARNING",
    log_requests=False,
    
    # Strict security
    verify_ssl=True,
    test_mode=False
)
```

---

### 3. Minimal Resource Usage

```python
# Low resource footprint
config = SessionConfig(
    # No API key (limited features)
    api_key=None,
    
    # Quick timeouts
    timeout=5.0,
    max_retries=0,
    
    # Conservative limits
    rate_limit_per_minute=30,
    
    # Minimal caching
    cache_enabled=False,
    
    # Single connection
    sync_pool_connections=1,
    async_limit_total=10,
    
    # No logging
    log_level="ERROR"
)
```

---

### 4. High-Throughput Configuration

```python
# Maximum throughput for batch processing
config = SessionConfig(
    # Secret key for high limits
    api_key="sk_live_...",
    
    # Long timeouts for large batches
    timeout=300.0,
    max_retries=5,
    
    # Maximum rate limits
    rate_limit_per_minute=100000,
    
    # Large connection pools
    sync_pool_connections=100,
    sync_pool_maxsize=200,
    async_limit_total=2000,
    async_limit_per_host=200,
    
    # Aggressive caching
    cache_enabled=True,
    cache_backend="memory",
    cache_ttl=86400,
    cache_max_memory=1000,
    
    # Minimal logging overhead
    log_level="ERROR",
    log_requests=False
)
```

---

### 5. Custom Environment Configuration

```bash
# .env file
POLLINATIONS_API_KEY=sk_live_abc123
POLLINATIONS_TIMEOUT=45.0
POLLINATIONS_MAX_RETRIES=3
POLLINATIONS_RATE_LIMIT=1000
BLOSSOM_AI_CACHE_TTL=7200
```

```python
# Load from .env
from dotenv import load_dotenv
from blossom_ai import SessionConfig

load_dotenv()
config = SessionConfig.from_env()
```

---

## Configuration Validation

### Runtime Validation

```python
# Validate before creating client
config = SessionConfig(
    timeout=30.0,
    rate_limit_per_minute=100
)

# Check if valid
if config.timeout <= 0:
    raise ValueError("Invalid timeout")
```

### Custom Validation

```python
def validate_production_config(config):
    """Validate production-specific requirements."""
    
    errors = []
    
    if not config.api_key:
        errors.append("API key required for production")
    
    if config.test_mode:
        errors.append("Test mode should be disabled")
    
    if config.log_level == "DEBUG":
        errors.append("Debug logging not recommended")
    
    if errors:
        raise ValueError("; ".join(errors))
    
    return True

# Usage
config = SessionConfig.from_env()
validate_production_config(config)
```

---

## Configuration Inheritance

### Base Configuration Pattern

```python
class ConfigProfiles:
    """Predefined configuration profiles."""
    
    @staticmethod
    def development():
        return SessionConfig(
            timeout=10.0,
            log_level="DEBUG",
            test_mode=True
        )
    
    @staticmethod
    def production():
        return SessionConfig(
            timeout=60.0,
            log_level="WARNING",
            test_mode=False
        )
    
    @staticmethod
    def testing():
        return SessionConfig(
            timeout=5.0,
            max_retries=0,
            cache_enabled=False
        )

# Usage
development_config = ConfigProfiles.development()
```

---

## Environment-Specific Configs

```python
import os
from blossom_ai import SessionConfig

def get_config_for_environment():
    """Get appropriate config based on environment."""
    
    env = os.getenv("ENVIRONMENT", "development")
    
    if env == "production":
        return SessionConfig.from_env()
    
    elif env == "testing":
        return SessionConfig(
            test_mode=True,
            cache_enabled=False,
            log_level="DEBUG"
        )
    
    else:  # development
        return SessionConfig(
            test_mode=True,
            log_level="INFO",
            log_requests=True
        )

config = get_config_for_environment()
```

---

## Configuration Debugging

### Inspect Current Config

```python
config = SessionConfig()

print("Configuration:")
print(f"  API Key: {'***' if config.api_key else 'None'}")
print(f"  Timeout: {config.timeout}s")
print(f"  Rate Limit: {config.rate_limit_per_minute}/min")
print(f"  Cache: {config.cache_enabled}")
print(f"  Backend: {config.cache_backend}")
```

### Configuration Dump

```python
def dump_config(config, hide_secrets=True):
    """Dump configuration for debugging."""
    
    data = {}
    for key, value in config.__dict__.items():
        if hide_secrets and 'key' in key.lower() and value:
            data[key] = '***'
        else:
            data[key] = value
    
    import json
    print(json.dumps(data, indent=2))

dump_config(config)
```

---

## Best Practices

### 1. Use Environment Variables

```python
# Good: Environment-based
config = SessionConfig.from_env()

# Bad: Hardcoded
config = SessionConfig(api_key="secret123")  # Don't commit this!
```

### 2. Validate Early

```python
# Validate at startup
try:
    config = SessionConfig.from_env()
    config.validate()  # Will be called automatically
except ValueError as e:
    print(f"Invalid configuration: {e}")
    exit(1)
```

### 3. Use Appropriate Defaults

```python
# Start with defaults, override as needed
config = SessionConfig()  # Good defaults
config.cache_ttl = 7200   # Override specific values
```

### 4. Document Custom Configs

```python
class ProductionConfig:
    """
    Production configuration optimized for:
    - High throughput
    - Minimal logging
    - Strict security
    """
    
    @staticmethod
    def create():
        return SessionConfig(
            timeout=60.0,
            rate_limit_per_minute=10000,
            log_level="WARNING",
            verify_ssl=True,
            test_mode=False
        )
```

---

## See Also

- [HTTP Client Guide](HTTP_CLIENT.md) - HTTP-specific configuration
- [Caching System](CACHING.md) - Cache configuration details
- [Rate Limiting](RATE_LIMITING.md) - Rate limit configuration
- [Error Handling](ERROR_HANDLING.md) - Error handling configuration
- [Architecture Overview](ARCHITECTURE.md) - Design principles