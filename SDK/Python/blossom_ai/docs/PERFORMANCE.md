# ⚡ Performance Tuning Guide

> **Comprehensive guide to optimizing Blossom AI performance**

---

## Overview

This guide covers performance optimization techniques for Blossom AI, from basic configuration to advanced tuning strategies.

---

## Quick Performance Wins

### 1. Use Appropriate Models

| Model | Speed | Quality | Best For |
|-------|-------|---------|----------|
| `turbo` | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | Quick responses |
| `flux` | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Balanced performance |
| `flux-realism` | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | High quality images |

```python
# Fastest option
await client.image.generate("Quick sketch", model="turbo")

# Balanced option
await client.image.generate("Detailed artwork", model="flux")
```

---

### 2. Optimize Image Sizes

```python
# Smaller = Faster
await client.image.generate("Icon", width=256, height=256)  # Fast
await client.image.generate("Wallpaper", width=2048, height=2048)  # Slow
```

**Size Impact:**
- 256x256: Very fast (~1-2s)
- 512x512: Fast (~2-4s)
- 1024x1024: Normal (~4-8s)
- 2048x2048: Slow (~8-16s)

---

### 3. Enable Caching

```python
from blossom_ai import SessionConfig

config = SessionConfig(
    cache_enabled=True,        # Enable caching
    cache_backend="hybrid",    # Memory + disk
    cache_ttl=3600            # 1 hour TTL
)

async with BlossomClient(config=config) as client:
    # First call hits API
    result1 = await client.text.generate("Hello")
    
    # Second call hits cache (instant)
    result2 = await client.text.generate("Hello")
```

---

### 4. Use Streaming for Long Responses

```python
# Instead of waiting for complete response
result = await client.text.generate("Long essay...", max_tokens=2000)

# Stream chunks as they arrive
full_text = ""
async for chunk in await client.text.generate(
    "Long essay...",
    max_tokens=2000,
    stream=True
):
    full_text += chunk
    print(chunk, end="")  # Real-time output
```

---

## Configuration Optimization

### SessionConfig Performance Settings

```python
from blossom_ai import SessionConfig

# High-performance configuration
config = SessionConfig(
    # Timeouts
    timeout=120.0,                    # Long timeout for large requests
    
    # HTTP settings
    sync_pool_connections=50,         # More connections for sync
    sync_pool_maxsize=100,           # Larger pool
    async_limit_total=1000,          # High concurrency
    async_limit_per_host=100,        # Per-host limits
    
    # Rate limiting
    rate_limit_per_minute=10000,     # High rate limit
    
    # Caching
    cache_enabled=True,
    cache_backend="memory",          # Fastest cache
    cache_ttl=7200,                  # 2 hour TTL
    cache_max_memory=500,            # More memory cache
    
    # Logging
    log_level="WARNING",             # Less logging overhead
    log_requests=False               # No request logging
)
```

---

### Connection Pool Tuning

```python
# For high-throughput applications
config = SessionConfig(
    # Increase connection limits
    sync_pool_connections=100,       # Default: 10
    sync_pool_maxsize=200,          # Default: 20
    async_limit_total=2000,         # Default: 100
    async_limit_per_host=200,       # Default: 30
    
    # Tune timeouts
    async_timeout_connect=2.0,      # Fast connection
    async_timeout_sock_read=10.0    # Slower read for large responses
)
```

---

## Batch Processing

### Concurrent Requests

```python
import asyncio

async def process_batch(prompts: List[str]):
    """Process multiple prompts concurrently."""
    
    async with BlossomClient() as client:
        # Create tasks for all prompts
        tasks = [
            client.text.generate(prompt, max_tokens=100)
            for prompt in prompts
        ]
        
        # Execute concurrently
        results = await asyncio.gather(*tasks)
        
        return results

# Usage
prompts = [
    "Summarize document 1",
    "Summarize document 2",
    "Summarize document 3",
    # ... 100 more prompts
]

# Process all at once
results = await process_batch(prompts)
```

---

### Batch with Rate Limiting

```python
async def process_batch_with_rate_limit(
    prompts: List[str],
    batch_size: int = 10,
    delay: float = 1.0
):
    """Process batches with rate limiting."""
    
    results = []
    
    async with BlossomClient() as client:
        for i in range(0, len(prompts), batch_size):
            batch = prompts[i:i + batch_size]
            
            # Process batch
            batch_tasks = [
                client.text.generate(prompt)
                for prompt in batch
            ]
            batch_results = await asyncio.gather(*batch_tasks)
            results.extend(batch_results)
            
            # Wait between batches
            if i + batch_size < len(prompts):
                await asyncio.sleep(delay)
    
    return results
```

---

### Optimized Batch Processing

```python
from typing import List, Tuple
import time

class BatchProcessor:
    """Optimized batch processor with progress tracking."""
    
    def __init__(self, client, batch_size: int = 20):
        self.client = client
        self.batch_size = batch_size
        self.processed = 0
        self.errors = 0
        self.start_time = None
    
    async def process_with_progress(
        self,
        items: List[Tuple[str, dict]]
    ) -> List[Any]:
        """
        Process items with progress tracking.
        
        Args:
            items: List of (prompt, kwargs) tuples
        """
        self.start_time = time.time()
        results = []
        
        total = len(items)
        print(f"Processing {total} items in batches of {self.batch_size}")
        
        for i in range(0, total, self.batch_size):
            batch = items[i:i + self.batch_size]
            batch_start = time.time()
            
            # Process batch
            batch_results = await self._process_batch(batch)
            results.extend(batch_results)
            
            # Update progress
            self.processed += len(batch)
            elapsed = time.time() - self.start_time
            batch_time = time.time() - batch_start
            
            # Progress report
            progress = (self.processed / total) * 100
            rate = self.processed / elapsed if elapsed > 0 else 0
            
            print(f"Progress: {progress:.1f}% "
                  f"({self.processed}/{total}) "
                  f"Rate: {rate:.1f} items/sec "
                  f"Batch time: {batch_time:.1f}s")
        
        return results
    
    async def _process_batch(self, batch: List[Tuple[str, dict]]) -> List[Any]:
        """Process a single batch."""
        tasks = []
        
        for prompt, kwargs in batch:
            task = self._safe_generate(prompt, **kwargs)
            tasks.append(task)
        
        return await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _safe_generate(self, prompt: str, **kwargs):
        """Generate with error handling."""
        try:
            return await self.client.text.generate(prompt, **kwargs)
        except Exception as e:
            self.errors += 1
            print(f"Error processing '{prompt[:50]}...': {e}")
            return None

# Usage
async def main():
    items = [
        (f"Process item {i}", {"max_tokens": 50})
        for i in range(100)
    ]
    
    async with BlossomClient() as client:
        processor = BatchProcessor(client, batch_size=15)
        results = await processor.process_with_progress(items)
        
        print(f"\nCompleted: {processor.processed} items")
        print(f"Errors: {processor.errors}")
        print(f"Success rate: {(len([r for r in results if r is not None]) / len(results)) * 100:.1f}%")
```

---

## Memory Management

### Optimize Large Responses

```python
async def process_large_responses():
    """Handle large responses efficiently."""
    
    async with BlossomClient() as client:
        # Process in chunks
        large_text = ""
        
        async for chunk in await client.text.generate(
            "Write a very long document...",
            max_tokens=5000,
            stream=True
        ):
            large_text += chunk
            
            # Process chunk immediately instead of accumulating
            if len(large_text) > 10000:
                # Save to file or process
                await save_chunk(large_text)
                large_text = ""
        
        # Handle remaining text
        if large_text:
            await save_chunk(large_text)
```

---

### Memory-Efficient Image Processing

```python
from PIL import Image
import io

async def process_images_efficiently(prompts: List[str]):
    """Process images without keeping all in memory."""
    
    async with BlossomClient() as client:
        for i, prompt in enumerate(prompts):
            # Generate image
            image_data = await client.image.generate(
                prompt,
                width=1024,
                height=1024
            )
            
            # Process immediately
            image = Image.open(io.BytesIO(image_data))
            
            # Save to disk (don't keep in memory)
            image.save(f"output_{i}.jpg", quality=85, optimize=True)
            
            # Explicit cleanup
            del image_data, image
```

---

## Network Optimization

### Connection Reuse

```python
# Good: Reuse client connection
async def efficient_requests():
    async with BlossomClient() as client:
        for i in range(100):
            result = await client.text.generate(f"Request {i}")
            # Connection reused automatically

# Bad: Creating new connections
async def inefficient_requests():
    for i in range(100):
        async with BlossomClient() as client:  # New connection each time
            result = await client.text.generate(f"Request {i}")
```

---

### HTTP/2 Optimization

```python
from blossom_ai.utils.http_client import HttpxClient
import httpx

# Configure HTTP/2 for better performance
http_client = HttpxClient(
    config=SessionConfig(),
    limits=httpx.Limits(
        max_keepalive_connections=20,
        max_connections=100
    ),
    http2=True  # Enable HTTP/2
)

async with BlossomClient(http_client=http_client) as client:
    # Benefits from HTTP/2 multiplexing
    results = await asyncio.gather(*[
        client.text.generate(f"Request {i}")
        for i in range(50)
    ])
```

---

## Caching Strategies

### Intelligent Caching

```python
from blossom_ai.utils.cache import CacheManager, CacheConfig
import hashlib

class IntelligentCache:
    """Intelligent caching with request similarity detection."""
    
    def __init__(self):
        self.cache = CacheManager(CacheConfig(
            backend="hybrid",
            ttl=3600
        ))
    
    def _generate_cache_key(self, prompt: str, **kwargs) -> str:
        """Generate cache key from request."""
        # Normalize prompt
        normalized = prompt.lower().strip()
        
        # Create hash
        content = f"{normalized}:{sorted(kwargs.items())}"
        return hashlib.sha256(content.encode()).hexdigest()
    
    def _is_similar(self, prompt1: str, prompt2: str, threshold: float = 0.8) -> bool:
        """Check if prompts are similar."""
        # Simple similarity check
        words1 = set(prompt1.lower().split())
        words2 = set(prompt2.lower().split())
        
        if not words1 or not words2:
            return False
        
        intersection = words1.intersection(words2)
        similarity = len(intersection) / max(len(words1), len(words2))
        
        return similarity >= threshold
    
    async def get_or_generate(
        self,
        client,
        prompt: str,
        **kwargs
    ):
        """Get from cache or generate with similarity matching."""
        
        # Try exact match first
        cache_key = self._generate_cache_key(prompt, **kwargs)
        cached = await self.cache.aget(cache_key)
        
        if cached:
            print("Cache hit: exact match")
            return cached
        
        # Try similar prompts (simplified)
        # In real implementation, you'd search cache for similar prompts
        
        # Generate new response
        response = await client.text.generate(prompt, **kwargs)
        
        # Cache for future use
        await self.cache.aset(cache_key, response)
        
        return response

# Usage
async def test_intelligent_cache():
    cache = IntelligentCache()
    
    async with BlossomClient() as client:
        # First request - cache miss
        result1 = await cache.get_or_generate(
            client,
            "What is Python?",
            max_tokens=100
        )
        
        # Similar request - might hit cache
        result2 = await cache.get_or_generate(
            client,
            "Tell me about Python",
            max_tokens=100
        )
```

---

### Cache Warming

```python
async def warm_cache(common_prompts: List[str]):
    """Pre-populate cache with common requests."""
    
    cache = CacheManager(CacheConfig(backend="memory"))
    
    async with BlossomClient() as client:
        # Pre-generate responses
        for prompt in common_prompts:
            result = await client.text.generate(prompt, max_tokens=50)
            await cache.aset(prompt, result)
            print(f"Cached: {prompt[:30]}...")

# Common prompts to pre-cache
common_prompts = [
    "Hello",
    "What is your name?",
    "How are you?",
    "Thank you",
    "Goodbye",
    "Help",
    "What can you do?",
    "Tell me a joke",
    "What time is it?",
    "What is the weather?"
]

# Warm cache on startup
await warm_cache(common_prompts)
```

---

## Performance Monitoring

### Built-in Metrics

```python
import time
import psutil
from typing import Dict, Any

class PerformanceMonitor:
    """Monitor Blossom AI performance."""
    
    def __init__(self):
        self.metrics = {
            "requests_total": 0,
            "requests_success": 0,
            "requests_failed": 0,
            "total_time": 0.0,
            "bytes_sent": 0,
            "bytes_received": 0
        }
        self.lock = threading.Lock()
    
    def record_request(
        self,
        duration: float,
        success: bool,
        bytes_sent: int = 0,
        bytes_received: int = 0
    ):
        """Record request metrics."""
        with self.lock:
            self.metrics["requests_total"] += 1
            
            if success:
                self.metrics["requests_success"] += 1
            else:
                self.metrics["requests_failed"] += 1
            
            self.metrics["total_time"] += duration
            self.metrics["bytes_sent"] += bytes_sent
            self.metrics["bytes_received"] += bytes_received
    
    def get_stats(self) -> Dict[str, Any]:
        """Get performance statistics."""
        with self.lock:
            stats = self.metrics.copy()
            
            if stats["requests_total"] > 0:
                stats["success_rate"] = (
                    stats["requests_success"] / stats["requests_total"]
                ) * 100
                stats["average_time"] = (
                    stats["total_time"] / stats["requests_total"]
                )
            else:
                stats["success_rate"] = 0.0
                stats["average_time"] = 0.0
            
            # Add system metrics
            process = psutil.Process()
            stats["memory_usage_mb"] = (
                process.memory_info().rss / (1024 * 1024)
            )
            
            return stats
    
    def reset(self):
        """Reset metrics."""
        with self.lock:
            self.metrics = {
                "requests_total": 0,
                "requests_success": 0,
                "requests_failed": 0,
                "total_time": 0.0,
                "bytes_sent": 0,
                "bytes_received": 0
            }

# Global monitor
performance_monitor = PerformanceMonitor()

# Usage with BlossomClient
async def monitored_generation(prompt: str):
    """Generate with performance monitoring."""
    
    start_time = time.time()
    
    try:
        async with BlossomClient() as client:
            result = await client.text.generate(prompt)
        
        duration = time.time() - start_time
        performance_monitor.record_request(
            duration=duration,
            success=True,
            bytes_sent=len(prompt.encode()),
            bytes_received=len(result.encode())
        )
        
        return result
    
    except Exception as e:
        duration = time.time() - start_time
        performance_monitor.record_request(
            duration=duration,
            success=False
        )
        raise

# Performance report
async def performance_report():
    """Generate performance report."""
    
    stats = performance_monitor.get_stats()
    
    print("=" * 50)
    print("PERFORMANCE REPORT")
    print("=" * 50)
    print(f"Total requests: {stats['requests_total']}")
    print(f"Success rate: {stats['success_rate']:.1f}%")
    print(f"Average time: {stats['average_time']:.2f}s")
    print(f"Memory usage: {stats['memory_usage_mb']:.1f}MB")
    print(f"Data sent: {stats['bytes_sent'] / 1024:.1f}KB")
    print(f"Data received: {stats['bytes_received'] / 1024:.1f}KB")
    
    if stats['requests_total'] > 0:
        throughput = stats['requests_total'] / stats['total_time']
        print(f"Throughput: {throughput:.2f} requests/sec")
    
    print("=" * 50)
```

---

### Custom Metrics

```python
import time
from functools import wraps

def measure_performance(func):
    """Decorator to measure function performance."""
    
    @wraps(func)
    async def async_wrapper(*args, **kwargs):
        start_time = time.time()
        
        try:
            result = await func(*args, **kwargs)
            duration = time.time() - start_time
            
            print(f"{func.__name__} took {duration:.2f}s")
            return result
        
        except Exception as e:
            duration = time.time() - start_time
            print(f"{func.__name__} failed after {duration:.2f}s: {e}")
            raise
    
    @wraps(func)
    def sync_wrapper(*args, **kwargs):
        start_time = time.time()
        
        try:
            result = func(*args, **kwargs)
            duration = time.time() - start_time
            
            print(f"{func.__name__} took {duration:.2f}s")
            return result
        
        except Exception as e:
            duration = time.time() - start_time
            print(f"{func.__name__} failed after {duration:.2f}s: {e}")
            raise
    
    return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper

# Usage
@measure_performance
async def generate_text(prompt: str):
    async with BlossomClient() as client:
        return await client.text.generate(prompt)

@measure_performance
def sync_operation():
    # Some synchronous operation
    time.sleep(1)
    return "done"
```

---

## Performance Benchmarks

### Benchmark Script

```python
import asyncio
import time
import statistics
from typing import List

class PerformanceBenchmark:
    """Benchmark Blossom AI performance."""
    
    def __init__(self, client):
        self.client = client
        self.results = []
    
    async def benchmark_text_generation(
        self,
        prompts: List[str],
        iterations: int = 10
    ) -> dict:
        """Benchmark text generation performance."""
        
        times = []
        
        for i in range(iterations):
            start_time = time.time()
            
            tasks = [
                self.client.text.generate(prompt, max_tokens=100)
                for prompt in prompts
            ]
            
            await asyncio.gather(*tasks)
            
            duration = time.time() - start_time
            times.append(duration)
            
            print(f"Iteration {i+1}/{iterations}: {duration:.2f}s")
        
        return {
            "mean": statistics.mean(times),
            "median": statistics.median(times),
            "min": min(times),
            "max": max(times),
            "stddev": statistics.stdev(times) if len(times) > 1 else 0,
            "requests_per_second": (len(prompts) * iterations) / sum(times)
        }
    
    async def benchmark_image_generation(
        self,
        prompts: List[str],
        iterations: int = 5
    ) -> dict:
        """Benchmark image generation performance."""
        
        times = []
        
        for i in range(iterations):
            start_time = time.time()
            
            for prompt in prompts:
                await self.client.image.generate(
                    prompt,
                    width=512,
                    height=512
                )
            
            duration = time.time() - start_time
            times.append(duration)
            
            print(f"Iteration {i+1}/{iterations}: {duration:.2f}s")
        
        return {
            "mean": statistics.mean(times),
            "median": statistics.median(times),
            "min": min(times),
            "max": max(times),
            "stddev": statistics.stdev(times) if len(times) > 1 else 0,
            "images_per_second": (len(prompts) * iterations) / sum(times)
        }

# Run benchmarks
async def run_benchmarks():
    async with BlossomClient() as client:
        benchmark = PerformanceBenchmark(client)
        
        # Text generation benchmark
        text_prompts = [
            "Hello world",
            "How are you?",
            "Tell me a joke",
            "What is AI?",
            "Write a haiku"
        ]
        
        print("Text Generation Benchmark:")
        text_stats = await benchmark.benchmark_text_generation(
            text_prompts,
            iterations=5
        )
        
        print(f"\nText Generation Results:")
        print(f"  Mean time: {text_stats['mean']:.2f}s")
        print(f"  Requests/sec: {text_stats['requests_per_second']:.2f}")
        
        # Image generation benchmark
        image_prompts = [
            "A red apple",
            "A blue sky",
            "A green forest",
            "A yellow sun",
            "A purple flower"
        ]
        
        print("\nImage Generation Benchmark:")
        image_stats = await benchmark.benchmark_image_generation(
            image_prompts,
            iterations=3
        )
        
        print(f"\nImage Generation Results:")
        print(f"  Mean time: {image_stats['mean']:.2f}s")
        print(f"  Images/sec: {image_stats['images_per_second']:.2f}")

# Run if main
if __name__ == "__main__":
    asyncio.run(run_benchmarks())
```

---

## Performance Checklist

### Before Production

- [ ] Use appropriate models for speed/quality needs
- [ ] Optimize image sizes (smaller = faster)
- [ ] Enable caching with appropriate TTL
- [ ] Tune connection pool sizes
- [ ] Set realistic timeouts
- [ ] Use streaming for large responses
- [ ] Implement batch processing for multiple requests
- [ ] Monitor memory usage
- [ ] Test with production-like load
- [ ] Set up performance monitoring

---

### Runtime Optimization

- [ ] Monitor request latencies
- [ ] Track cache hit rates
- [ ] Watch memory usage
- [ ] Monitor error rates
- [ ] Adjust rate limits based on usage
- [ ] Scale connection pools if needed
- [ ] Update cache TTL based on data freshness needs

---

## Performance Troubleshooting

### Common Issues

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Slow requests | Network latency | Use closer region/CDN |
| Timeouts | Large requests | Increase timeout or stream |
| Memory errors | Large responses | Process in chunks |
| Rate limits | Too many requests | Implement backoff |
| Cache misses | Poor cache keys | Optimize key generation |

---

### Debug Performance

```python
import cProfile
import pstats

def profile_performance():
    """Profile Blossom AI performance."""
    
    profiler = cProfile.Profile()
    
    # Profile async function
    profiler.enable()
    asyncio.run(run_performance_test())
    profiler.disable()
    
    # Print stats
    stats = pstats.Stats(profiler)
    stats.sort_stats(pstats.SortKey.TIME)
    stats.print_stats(20)  # Top 20 functions

async def run_performance_test():
    """Run performance test for profiling."""
    async with BlossomClient() as client:
        for i in range(10):
            await client.text.generate(f"Test {i}")
```

---

## See Also

- [Async Patterns](ASYNC_PATTERNS.md) - Async/await best practices
- [Memory Management](MEMORY.md) - Prevent leaks, optimize
- [Connection Pooling](CONNECTION_POOLING.md) - HTTP optimization
- [Debugging Guide](DEBUGGING.md) - Troubleshooting tips
- [Architecture Overview](ARCHITECTURE.md) - Design principles