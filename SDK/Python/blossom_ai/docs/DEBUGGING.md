# 🐛 Debugging Guide

> **Comprehensive troubleshooting guide for Blossom AI SDK**

---

## Overview

This guide provides systematic approaches to debugging issues with Blossom AI, from common problems to advanced troubleshooting techniques.

---

## Quick Diagnostics

### 1. Check Installation

```python
# Verify installation
import blossom_ai
print(f"Blossom AI version: {blossom_ai.__version__}")

# Check dependencies
import sys
print(f"Python version: {sys.version}")

# Verify imports
from blossom_ai import BlossomClient, SessionConfig
print("✅ All imports successful")
```

---

### 2. Test Basic Connectivity

```python
import asyncio
from blossom_ai import BlossomClient

async def test_basic_connection():
    try:
        async with BlossomClient() as client:
            # Test with a simple request
            result = await client.text.generate("Say 'test'")
            print(f"✅ Connection successful: {result}")
            return True
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False

# Run test
asyncio.run(test_basic_connection())
```

---

### 3. Check Configuration

```python
from blossom_ai import SessionConfig

# Print current configuration
config = SessionConfig.from_env()
print(f"API Key: {'Set' if config.api_key else 'Not set'}")
print(f"Timeout: {config.timeout}s")
print(f"Rate Limit: {config.rate_limit_per_minute}/min")
print(f"Cache: {config.cache_enabled}")
```

---

## Common Issues

### Issue: "No API key provided"

**Symptoms:**
- Authentication errors
- Rate limit errors with low limits

**Solutions:**

```python
# Option 1: Set environment variable
import os
os.environ["POLLINATIONS_API_KEY"] = "your-key"

# Option 2: Pass in config
from blossom_ai import SessionConfig, BlossomClient

config = SessionConfig(api_key="your-key")
client = BlossomClient(config=config)

# Option 3: Use .env file
# Create .env file:
# POLLINATIONS_API_KEY=your-key

from dotenv import load_dotenv
load_dotenv()
```

---

### Issue: "Rate limit exceeded"

**Symptoms:**
- `RateLimitError` exceptions
- Requests being throttled

**Solutions:**

```python
# Option 1: Increase rate limit (with API key)
config = SessionConfig(
    api_key="your-key",
    rate_limit_per_minute=1000  # Higher limit
)

# Option 2: Add delays between requests
import asyncio

async def with_delays():
    for i in range(10):
        result = await client.text.generate(f"Request {i}")
        await asyncio.sleep(1)  # 1 second delay

# Option 3: Use batch processing
async def batch_requests():
    # Process in smaller batches
    results = []
    for batch in range(0, 100, 10):
        batch_results = await asyncio.gather(*[
            client.text.generate(f"Request {i}")
            for i in range(batch, batch + 10)
        ])
        results.extend(batch_results)
        await asyncio.sleep(5)  # Rest between batches
```

---

### Issue: "TimeoutError"

**Symptoms:**
- Requests timing out
- Long-running operations failing

**Solutions:**

```python
# Option 1: Increase timeout
config = SessionConfig(timeout=120.0)  # 2 minutes

# Option 2: Use streaming for long responses
async def stream_long_request():
    async for chunk in await client.text.generate(
        "Write a very long essay...",
        stream=True
    ):
        print(chunk, end="")

# Option 3: Break into smaller requests
async def chunked_generation():
    sections = []
    
    # Generate section by section
    for topic in ["introduction", "body", "conclusion"]:
        section = await client.text.generate(
            f"Write the {topic} of an essay",
            max_tokens=500  # Smaller chunks
        )
        sections.append(section)
    
    return "\n\n".join(sections)
```

---

### Issue: "Connection failed"

**Symptoms:**
- Network errors
- Cannot connect to API

**Solutions:**

```python
# Option 1: Check internet connection
import requests
try:
    requests.get("https://httpbin.org/get", timeout=5)
    print("✅ Internet connection working")
except:
    print("❌ No internet connection")

# Option 2: Disable SSL verification (development only)
config = SessionConfig(verify_ssl=False)

# Option 3: Use custom HTTP client
import httpx
from blossom_ai.utils.http_client import HttpxClient

http_client = HttpxClient(
    config=config,
    limits=httpx.Limits(
        max_keepalive_connections=20,
        max_connections=100
    )
)
client = BlossomClient(config=config, http_client=http_client)
```

---

### Issue: "Invalid image file"

**Symptoms:**
- Image generation fails
- File validation errors

**Solutions:**

```python
from pathlib import Path
from blossom_ai.utils.security import validate_image_file

# Option 1: Validate image before processing
image_path = Path("my_image.jpg")
try:
    validated_path = validate_image_file(image_path)
    print(f"✅ Image valid: {validated_path}")
except ValueError as e:
    print(f"❌ Image invalid: {e}")

# Option 2: Check file format
valid_formats = ['.jpg', '.jpeg', '.png', '.webp']
if image_path.suffix.lower() in valid_formats:
    print("✅ Valid format")
else:
    print("❌ Invalid format")

# Option 3: Check file size
size_mb = image_path.stat().st_size / (1024 * 1024)
if size_mb > 10:
    print(f"❌ File too large: {size_mb:.1f}MB")
else:
    print(f"✅ File size OK: {size_mb:.1f}MB")
```

---

### Issue: "Empty response"

**Symptoms:**
- Model returns empty string
- No content generated

**Solutions:**

```python
# Option 1: Adjust parameters
response = await client.text.generate(
    "Write something",
    max_tokens=100,  # Ensure we allow tokens
    temperature=0.7  # Not too low
)

# Option 2: Check for empty responses
result = await client.text.generate("Hello")
if not result or result.isspace():
    print("Empty response detected")
    # Retry or handle appropriately

# Option 3: Use different model
response = await client.text.generate(
    "Hello world",
    model="gemini"  # Try different model
)
```

---

## Advanced Debugging

### Enable Debug Logging

```python
import logging

# Set up detailed logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Configure Blossom AI logging
config = SessionConfig(
    log_level="DEBUG",
    log_requests=True
)

async with BlossomClient(config=config) as client:
    # All requests will be logged
    result = await client.text.generate("Test")
```

---

### Request/Response Logging

```python
import json

class DebugClient:
    """Wrapper that logs all requests and responses."""
    
    def __init__(self, client):
        self.client = client
    
    async def debug_generate(self, prompt, **kwargs):
        print(f"📝 Request: {prompt[:50]}...")
        print(f"⚙️  Parameters: {kwargs}")
        
        try:
            result = await self.client.text.generate(prompt, **kwargs)
            print(f"✅ Response: {result[:100]}...")
            return result
        except Exception as e:
            print(f"❌ Error: {e}")
            raise

# Usage
async with BlossomClient() as client:
    debug_client = DebugClient(client)
    result = await debug_client.debug_generate("Hello world")
```

---

### Performance Profiling

```python
import time
import asyncio

async def profile_request(client):
    """Profile a single request."""
    
    start_time = time.time()
    
    # Time the request
    result = await client.text.generate("Test performance")
    
    end_time = time.time()
    duration = end_time - start_time
    
    print(f"⏱️  Request took: {duration:.2f}s")
    print(f"📏 Response length: {len(result)} chars")
    
    return result

# Profile multiple requests
async def profile_batch(client, count=10):
    """Profile multiple concurrent requests."""
    
    start_time = time.time()
    
    tasks = [
        client.text.generate(f"Request {i}")
        for i in range(count)
    ]
    
    results = await asyncio.gather(*tasks)
    
    end_time = time.time()
    total_duration = end_time - start_time
    avg_duration = total_duration / count
    
    print(f"📊 Batch stats:")
    print(f"   Total time: {total_duration:.2f}s")
    print(f"   Average per request: {avg_duration:.2f}s")
    print(f"   Requests/second: {count/total_duration:.2f}")
```

---

### Cache Debugging

```python
from blossom_ai import CacheManager, CacheConfig

async def debug_cache():
    """Debug cache operations."""
    
    cache_config = CacheConfig(backend="memory")
    cache = CacheManager(cache_config)
    
    # Add some data
    await cache.aset("test_key", "test_value")
    
    # Get cache stats
    stats = cache.get_stats()
    print(f"📈 Cache stats:")
    print(f"   Hits: {stats.hits}")
    print(f"   Misses: {stats.misses}")
    print(f"   Hit rate: {stats.hit_rate:.1f}%")
    print(f"   Evictions: {stats.evictions}")
    
    # Test cache hit/miss
    result1 = await cache.aget("test_key")  # Should hit
    result2 = await cache.aget("missing_key")  # Should miss
    
    print(f"🔍 Cache hit result: {result1}")
    print(f"🔍 Cache miss result: {result2}")
```

---

### Memory Usage Debugging

```python
import psutil
import gc

async def debug_memory_usage(client):
    """Debug memory usage during operations."""
    
    process = psutil.Process()
    
    def get_memory_mb():
        return process.memory_info().rss / (1024 * 1024)
    
    print(f"🧠 Initial memory: {get_memory_mb():.1f}MB")
    
    # Generate some images
    for i in range(5):
        image = await client.image.generate(f"Test image {i}", width=512, height=512)
        print(f"🧠 After image {i}: {get_memory_mb():.1f}MB")
        
        # Force garbage collection
        del image
        gc.collect()
```

---

### Network Debugging

```python
import asyncio
import aiohttp

async def debug_network():
    """Debug network connectivity."""
    
    # Test DNS resolution
    try:
        reader, writer = await asyncio.open_connection("gen.pollinations.ai", 443)
        writer.close()
        await writer.wait_closed()
        print("✅ DNS and connectivity OK")
    except Exception as e:
        print(f"❌ Network issue: {e}")
    
    # Test HTTP connectivity
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get("https://gen.pollinations.ai") as response:
                print(f"✅ HTTP connectivity OK: {response.status}")
        except Exception as e:
            print(f"❌ HTTP issue: {e}")
```

---

## Error Analysis

### Decode Error Messages

```python
from blossom_ai import (
    BlossomError, AuthenticationError, RateLimitError,
    ValidationError, TimeoutError, NetworkError
)

def analyze_error(error):
    """Analyze and provide solutions for errors."""
    
    if isinstance(error, AuthenticationError):
        return {
            "issue": "Authentication failed",
            "solution": "Check your API key",
            "action": "Set POLLINATIONS_API_KEY environment variable"
        }
    
    elif isinstance(error, RateLimitError):
        return {
            "issue": "Rate limit exceeded",
            "solution": f"Wait {error.retry_after} seconds",
            "action": "Reduce request frequency or upgrade API key"
        }
    
    elif isinstance(error, TimeoutError):
        return {
            "issue": "Request timed out",
            "solution": "Increase timeout or use streaming",
            "action": f"Set timeout > {error.context.timeout}s"
        }
    
    elif isinstance(error, NetworkError):
        return {
            "issue": "Network connectivity",
            "solution": "Check internet connection",
            "action": "Test with: curl https://gen.pollinations.ai"
        }
    
    else:
        return {
            "issue": f"Unknown error: {error}",
            "solution": "Check logs for details",
            "action": "Enable debug logging"
        }
```

---

### Error Context Analysis

```python
def log_error_with_context(error):
    """Log error with full context."""
    
    if hasattr(error, 'context'):
        ctx = error.context
        print(f"🐛 Error Context:")
        print(f"   Operation: {ctx.operation}")
        print(f"   URL: {ctx.url}")
        print(f"   Method: {ctx.method}")
        print(f"   Status: {ctx.status_code}")
        print(f"   Request ID: {ctx.request_id}")
        
        if ctx.metadata:
            print(f"   Metadata: {ctx.metadata}")
    
    if hasattr(error, 'to_dict'):
        print(f"   Details: {error.to_dict()}")
```

---

## Testing and Reproduction

### Create Minimal Reproducible Example

```python
async def minimal_reproduction():
    """Create the smallest example that reproduces the issue."""
    
    print("Testing minimal reproduction...")
    
    # Step 1: Simplest possible client
    try:
        async with BlossomClient() as client:
            result = await client.text.generate("Hello")
            print(f"✅ Basic test passed: {result[:20]}...")
    except Exception as e:
        print(f"❌ Basic test failed: {e}")
        return
    
    # Step 2: Add your specific parameters
    try:
        async with BlossomClient() as client:
            result = await client.text.generate(
                "Your specific prompt",
                model="gemini",
                max_tokens=100
            )
            print(f"✅ Specific test passed")
    except Exception as e:
        print(f"❌ Specific test failed: {e}")
```

---

### Test with Different Models

```python
async def test_different_models():
    """Test the same prompt with different models."""
    
    prompt = "Say 'test'"
    models = ["openai", "gemini", "claude"]
    
    for model in models:
        try:
            async with BlossomClient() as client:
                result = await client.text.generate(prompt, model=model)
                print(f"✅ {model}: {result[:20]}...")
        except Exception as e:
            print(f"❌ {model}: {e}")
```

---

## Performance Troubleshooting

### Slow Requests

```python
import time

async def diagnose_slow_requests():
    """Diagnose slow request issues."""
    
    print("Diagnosing slow requests...")
    
    # Test 1: Simple request
    start = time.time()
    async with BlossomClient() as client:
        await client.text.generate("Hi")
    simple_time = time.time() - start
    print(f"Simple request: {simple_time:.2f}s")
    
    # Test 2: Complex request
    start = time.time()
    async with BlossomClient() as client:
        await client.text.generate(
            "Write a long essay about artificial intelligence",
            max_tokens=1000
        )
    complex_time = time.time() - start
    print(f"Complex request: {complex_time:.2f}s")
    
    # Test 3: Image generation
    start = time.time()
    async with BlossomClient() as client:
        await client.image.generate("A cat", width=512, height=512)
    image_time = time.time() - start
    print(f"Image request: {image_time:.2f}s")
    
    # Analysis
    if simple_time > 5:
        print("⚠️  Simple requests are slow - check network")
    if complex_time > 30:
        print("⚠️  Complex requests are slow - normal for long content")
    if image_time > 30:
        print("⚠️  Image requests are slow - normal for generation")
```

---

### High Memory Usage

```python
import psutil
import gc

async def diagnose_memory_usage():
    """Diagnose memory issues."""\n    
    process = psutil.Process()
    
    def get_memory():
        return process.memory_info().rss / (1024 * 1024)
    
    print(f"Initial memory: {get_memory():.1f}MB")
    
    # Test memory growth
    async with BlossomClient() as client:
        for i in range(10):
            # Generate text
            text = await client.text.generate(f"Test {i}")
            print(f"After text {i}: {get_memory():.1f}MB")
            
            # Generate image
            image = await client.image.generate(f"Test {i}", width=256, height=256)
            print(f"After image {i}: {get_memory():.1f}MB")
            
            # Force cleanup
            del text, image
            gc.collect()
```

---

## Getting Help

### Collect Debug Information

```python
def collect_debug_info():
    """Collect information for bug reports."""
    
    import sys
    import platform
    import blossom_ai
    
    info = {
        "blossom_ai_version": blossom_ai.__version__,
        "python_version": sys.version,
        "platform": platform.platform(),
        "python_implementation": platform.python_implementation(),
    }
    
    # Test basic functionality
    try:
        from blossom_ai import SessionConfig
        config = SessionConfig()
        info["config_creation"] = "✅ Success"
    except Exception as e:
        info["config_creation"] = f"❌ Failed: {e}"
    
    # Test client creation
    try:
        from blossom_ai import BlossomClient
        client = BlossomClient()
        info["client_creation"] = "✅ Success"
        
        # Test simple request
        import asyncio
        async def test():
            async with client:
                result = await client.text.generate("Test")
                return "✅ Success" if result else "❌ Empty result"
        
        info["basic_request"] = asyncio.run(test())
    except Exception as e:
        info["client_creation"] = f"❌ Failed: {e}"
    
    return info

# Print debug info
debug_info = collect_debug_info()
for key, value in debug_info.items():
    print(f"{key}: {value}")
```

---

### Bug Report Template

```markdown
## Bug Report

### Environment
- Blossom AI version: [e.g., 0.7.0]
- Python version: [e.g., 3.11.0]
- Platform: [e.g., Ubuntu 22.04]

### Issue Description
[Describe the issue]

### Steps to Reproduce
1. [First step]
2. [Second step]
3. [Third step]

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happens]

### Error Messages
```
[Include full error messages]
```

### Code Example
```python
[Minimal code that reproduces the issue]
```

### Debug Information
[Run the debug info collector and paste results]
```

---

## See Also

- [Error Types](ERROR_TYPES.md) - Complete error reference
- [Status Codes](STATUS_CODES.md) - HTTP status meanings
- [Error Handling](ERROR_HANDLING.md) - Handle errors gracefully
- [Performance Tuning](PERFORMANCE.md) - Optimization strategies