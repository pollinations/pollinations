# 💾 Caching System Guide

> Complete guide to Blossom AI's thread-safe caching system

---

## 🚀 Overview

Blossom AI provides a powerful, thread-safe caching system that helps:
- **Reduce API costs** by avoiding duplicate calls
- **Improve performance** with instant cached responses
- **Scale applications** with distributed caching support
- **Prevent rate limiting** by reducing API requests

### Cache Types

- **Memory Cache**: Fast in-memory caching (default)
- **File Cache**: Persistent disk-based caching
- **Redis Cache**: Distributed caching for production
- **Hybrid Cache**: Memory + file combination

---

## 📋 Quick Start

### Enable Caching

```python
from blossom_ai import BlossomClient, SessionConfig

config = SessionConfig(cache_enabled=True)

with BlossomClient(config=config) as client:
    # This will be cached
    response1 = client.text.generate("test prompt")
    
    # This will use cache (instant response)
    response2 = client.text.generate("test prompt")
```

### Basic Cache Configuration

```python
from blossom_ai.utils.cache import CacheManager, CacheConfig

# Create cache configuration
cache_config = CacheConfig(
    backend="memory",           # "memory", "file", "redis", "hybrid"
    max_size=1000,              # Maximum number of items
    ttl=3600,                   # Time to live in seconds
    eviction_policy="lru"       # "lru", "fifo", "lfu"
)

# Create cache manager
cache = CacheManager(cache_config)

# Use with client
with BlossomClient(cache=cache) as client:
    response = client.text.generate("test")
```

---

## 🎛️ Cache Backends

### 1. Memory Cache

Fast in-memory caching with LRU eviction.

```python
from blossom_ai.utils.cache import CacheConfig, CacheManager

config = CacheConfig(
    backend="memory",
    max_size=1000,      # Store up to 1000 items
    ttl=3600           # 1 hour TTL
)

cache = CacheManager(config)

# Use cache
cache.set("key", "value")
value = cache.get("key")
```

**Characteristics:**
- ⚡ **Fastest**: No disk I/O
- 💾 **Limited by RAM**: Can't store large amounts
- 🔄 **Non-persistent**: Lost on restart
- 🧵 **Thread-safe**: Built-in locking

### 2. File Cache

Persistent disk-based caching.

```python
config = CacheConfig(
    backend="file",
    cache_dir="/path/to/cache",  # Cache directory
    max_size_mb=100,            # 100 MB limit
    ttl=86400                   # 24 hours TTL
)

cache = CacheManager(config)
```

**Characteristics:**
- 💾 **Persistent**: Survives restarts
- 📁 **Large capacity**: Limited by disk space
- 🐌 **Slower**: Disk I/O overhead
- 🔒 **Secure**: Can be encrypted

### 3. Redis Cache

Distributed caching for production systems.

```python
config = CacheConfig(
    backend="redis",
    host="localhost",
    port=6379,
    database=0,
    password="your-password",   # Optional
    ssl=True,                   # Optional
    ttl=7200                   # 2 hours TTL
)

cache = CacheManager(config)
```

**Characteristics:**
- 🌐 **Distributed**: Multiple app instances
- 🚀 **High performance**: In-memory with persistence
- 🔧 **Advanced features**: Pub/Sub, clustering
- 📊 **Monitoring**: Built-in metrics

### 4. Hybrid Cache

Combines memory and file caching.

```python
config = CacheConfig(
    backend="hybrid",
    memory_max_size=100,        # 100 items in memory
    file_cache_dir="/cache",    # File cache directory
    file_max_size_mb=1000,      # 1 GB file cache
    ttl=3600
)

cache = CacheManager(config)
```

**How it works:**
1. Check memory cache first (fastest)
2. If not found, check file cache
3. If found in file, promote to memory
4. If not found anywhere, fetch from API

---

## 🔧 Cache Operations

### Basic Operations

```python
from blossom_ai.utils.cache import CacheManager, CacheConfig

cache = CacheManager(CacheConfig(backend="memory"))

# Set value with TTL
cache.set("user_123", {"name": "John", "age": 30}, ttl=3600)

# Get value
user = cache.get("user_123")
if user:
    print(f"Found user: {user['name']}")

# Delete value
cache.delete("user_123")

# Clear all
cache.clear()

# Check if key exists
exists = cache.exists("user_123")
```

### Batch Operations

```python
# Set multiple values
cache.set_many({
    "user_123": {"name": "John"},
    "user_456": {"name": "Jane"},
    "user_789": {"name": "Bob"}
}, ttl=3600)

# Get multiple values
users = cache.get_many(["user_123", "user_456", "user_789"])

# Delete multiple values
cache.delete_many(["user_123", "user_456"])
```

### Atomic Operations

```python
# Atomic get and set
old_value = cache.get_set("counter", 42)

# Atomic increment
cache.increment("views", 1)  # Returns new value

# Atomic decrement
cache.decrement("credits", 5)  # Returns new value
```

---

## 🎯 Cache Keys

### Automatic Key Generation

```python
from blossom_ai import BlossomClient

with BlossomClient(cache_enabled=True) as client:
    # Cache key automatically generated from:
    # - Function name (text.generate)
    # - Arguments (prompt, model, parameters)
    # - Hash of content
    response = client.text.generate(
        "explain machine learning",
        model="gpt-4",
        temperature=0.7
    )
    # Key: "text.generate:sha256_hash_of_params"
```

### Custom Cache Keys

```python
# Override automatic key generation
with BlossomClient(cache_enabled=True) as client:
    response = client.text.generate(
        "test prompt",
        cache_key="my_custom_key_123"
    )
```

### Key Best Practices

```python
# ✅ Good: Include version in key
key = f"v1:user_profile:{user_id}"

# ✅ Good: Hash long parameters
import hashlib
params_hash = hashlib.md5(json.dumps(params).encode()).hexdigest()
key = f"api_response:{params_hash}"

# ❌ Bad: User-provided keys
key = user_input  # Security risk!

# ❌ Bad: Non-unique keys
key = "data"  # Will collide!
```

---

## 📊 Cache Statistics

### Get Statistics

```python
cache = CacheManager(CacheConfig(backend="memory"))

# Get cache stats
stats = cache.get_stats()

print(f"Hit rate: {stats.hit_rate:.2%}")
print(f"Hits: {stats.hits}")
print(f"Misses: {stats.misses}")
print(f"Evictions: {stats.evictions}")
print(f"Current size: {stats.size}")
```

### Monitor Performance

```python
import time
from blossom_ai import BlossomClient

with BlossomClient(cache_enabled=True) as client:
    # First call - cache miss
    start = time.time()
    response1 = client.text.generate("test prompt")
    miss_time = time.time() - start
    
    # Second call - cache hit
    start = time.time()
    response2 = client.text.generate("test prompt")
    hit_time = time.time() - start
    
    print(f"Cache miss: {miss_time:.3f}s")
    print(f"Cache hit: {hit_time:.3f}s")
    print(f"Speedup: {miss_time/hit_time:.1f}x")
```

---

## 🧠 Caching Strategies

### 1. Cache Aside Pattern

```python
async def get_user_data(user_id: str):
    # Try cache first
    cached_data = cache.get(f"user:{user_id}")
    if cached_data:
        return cached_data
    
    # Fetch from database/API
    user_data = await api.get_user(user_id)
    
    # Store in cache
    cache.set(f"user:{user_id}", user_data, ttl=3600)
    
    return user_data
```

### 2. Write Through Pattern

```python
async def update_user_data(user_id: str, data: dict):
    # Update database first
    await api.update_user(user_id, data)
    
    # Then update cache
    cache.set(f"user:{user_id}", data, ttl=3600)
    
    return data
```

### 3. Write Behind Pattern

```python
async def update_user_data(user_id: str, data: dict):
    # Update cache immediately
    cache.set(f"user:{user_id}", data, ttl=3600)
    
    # Queue database update
    await queue.put({"type": "update_user", "user_id": user_id, "data": data})
    
    return data
```

---

## 🛠️ Advanced Features

### Cache Namespaces

```python
# Separate namespaces for different data types
user_cache = cache.namespace("users")
product_cache = cache.namespace("products")
session_cache = cache.namespace("sessions")

# Use namespaced cache
user_cache.set("123", {"name": "John"})
product_cache.set("123", {"name": "Laptop"})

# Both can coexist
user = user_cache.get("123")
product = product_cache.get("123")
```

### Tag-based Invalidation

```python
# Cache with tags
cache.set("user:123", user_data, tags=["user", "premium"], ttl=3600)
cache.set("user:456", user_data, tags=["user", "basic"], ttl=3600)

# Invalidate by tag
cache.invalidate_tags(["premium"])  # Removes all premium users
```

### Conditional Caching

```python
from blossom_ai import BlossomClient

with BlossomClient(cache_enabled=True) as client:
    # Don't cache if response is small
    response = client.text.generate(
        "short prompt",
        cache_condition=lambda r: len(r.text) > 100
    )
    
    # Don't cache errors
    response = client.text.generate(
        "might fail",
        cache_condition=lambda r: not hasattr(r, 'error')
    )
```

---

## 🔒 Cache Security

### Sanitize Cache Keys

```python
from blossom_ai.utils.security import sanitize_filename

def make_cache_key(prompt: str) -> str:
    # Sanitize user input
    safe_prompt = sanitize_filename(prompt[:50])
    return f"text_gen:{safe_prompt}"

# Use safe key
key = make_cache_key(user_prompt)
cache.set(key, response)
```

### Encrypt Sensitive Data

```python
from cryptography.fernet import Fernet

class EncryptedCache:
    def __init__(self, cache, encryption_key):
        self.cache = cache
        self.cipher = Fernet(encryption_key)
    
    def set(self, key: str, value: Any, ttl: int):
        # Encrypt before storing
        encrypted = self.cipher.encrypt(json.dumps(value).encode())
        self.cache.set(key, encrypted, ttl)
    
    def get(self, key: str) -> Optional[Any]:
        encrypted = self.cache.get(key)
        if encrypted:
            # Decrypt after retrieving
            decrypted = self.cipher.decrypt(encrypted)
            return json.loads(decrypted.decode())
        return None
```

---

## 🧪 Testing with Cache

### Mock Cache for Testing

```python
from unittest.mock import Mock
from blossom_ai import BlossomClient

# Create mock cache
mock_cache = Mock()
mock_cache.get = Mock(return_value=None)  # Always miss
mock_cache.set = Mock()

# Test with mock cache
with BlossomClient(cache=mock_cache) as client:
    response = client.text.generate("test")
    
    # Verify cache interactions
    mock_cache.get.assert_called_once()
    mock_cache.set.assert_called_once()
```

### Cache Warming

```python
async def warm_cache():
    """Pre-populate cache with common queries."""
    common_prompts = [
        "what is AI?",
        "explain machine learning",
        "write a summary"
    ]
    
    with BlossomClient(cache_enabled=True) as client:
        for prompt in common_prompts:
            # This will populate the cache
            client.text.generate(prompt)
    
    print("Cache warmed with common queries")
```

---

## 📈 Performance Optimization

### 1. Choose Right Backend

```python
# Development: Memory cache
config = CacheConfig(backend="memory", max_size=100)

# Production single instance: File cache
config = CacheConfig(
    backend="file",
    cache_dir="/var/cache/blossom",
    max_size_mb=1000
)

# Production multi-instance: Redis
config = CacheConfig(
    backend="redis",
    host="redis.example.com",
    port=6379,
    ssl=True
)
```

### 2. Optimize TTL

```python
# Different TTL for different data types
CACHE_TTLS = {
    "user_profile": 86400,    # 1 day
    "api_response": 3600,     # 1 hour
    "temporary": 300,         # 5 minutes
    "session": 1800           # 30 minutes
}

def get_ttl(cache_type: str) -> int:
    return CACHE_TTLS.get(cache_type, 3600)
```

### 3. Monitor and Tune

```python
async def monitor_cache_performance():
    cache = CacheManager(CacheConfig(backend="memory"))
    
    while True:
        stats = cache.get_stats()
        
        # Log performance metrics
        logger.info(
            "Cache performance",
            hit_rate=stats.hit_rate,
            size=stats.size,
            evictions=stats.evictions
        )
        
        # Alert if hit rate is too low
        if stats.hit_rate < 0.5:
            logger.warning("Low cache hit rate", hit_rate=stats.hit_rate)
        
        await asyncio.sleep(300)  # Check every 5 minutes
```

---

## 🔗 Related Documentation

- [⚙️ Configuration System](CONFIGURATION.md)
- [⏱️ Rate Limiting](RATE_LIMITING.md)
- [🎓 Performance Tuning](PERFORMANCE.md)
- [🧪 Testing Guide](TESTING.md)
