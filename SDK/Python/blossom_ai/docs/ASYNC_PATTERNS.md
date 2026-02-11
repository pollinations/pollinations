# 🔄 Async Patterns Guide

> **Master async/await patterns with Blossom AI**

---

## Overview

This guide covers async programming patterns for optimal performance with Blossom AI SDK.

---

## Why Async?

### Benefits of Async

```python
# ❌ Sync: 10 requests = 30+ seconds
import time
for i in range(10):
    result = client.text.generate(f"Request {i}")  # Blocks each time
    print(result)

# ✅ Async: 10 requests = 3-4 seconds
import asyncio
async def main():
    async with BlossomClient() as client:
        tasks = [
            client.text.generate(f"Request {i}")
            for i in range(10)
        ]
        results = await asyncio.gather(*tasks)  # Concurrent execution
        for result in results:
            print(result)
```

---

## Basic Async Patterns

### 1. Simple Async Request

```python
import asyncio
from blossom_ai import BlossomClient

async def simple_request():
    """Simple async request pattern."""
    
    async with BlossomClient() as client:
        result = await client.text.generate("Hello, world!")
        print(result)

# Run async function
asyncio.run(simple_request())
```

---

### 2. Multiple Concurrent Requests

```python
async def concurrent_requests():
    """Execute multiple requests concurrently."""
    
    async with BlossomClient() as client:
        # Create multiple tasks
        tasks = [
            client.text.generate("Tell me a joke"),
            client.text.generate("Write a haiku"),
            client.text.generate("Explain quantum physics"),
            client.image.generate("A red apple", width=512, height=512)
        ]
        
        # Execute all concurrently
        results = await asyncio.gather(*tasks)
        
        # Process results
        for i, result in enumerate(results):
            print(f"Result {i+1}: {result}")
```

---

### 3. Batch Processing with Semaphore

```python
import asyncio
from typing import List

class BatchProcessor:
    """Process batches with concurrency control."""
    
    def __init__(self, max_concurrent: int = 5):
        self.max_concurrent = max_concurrent
        self.semaphore = asyncio.Semaphore(max_concurrent)
    
    async def process_item(self, client, item: str) -> str:
        """Process single item with semaphore control."""
        async with self.semaphore:
            return await client.text.generate(item)
    
    async def process_batch(
        self,
        client,
        items: List[str]
    ) -> List[str]:
        """Process entire batch."""
        tasks = [
            self.process_item(client, item)
            for item in items
        ]
        return await asyncio.gather(*tasks)

# Usage
async def main():
    items = [f"Process item {i}" for i in range(20)]
    
    async with BlossomClient() as client:
        processor = BatchProcessor(max_concurrent=3)
        results = await processor.process_batch(client, items)
        print(f"Processed {len(results)} items")
```

---

## Advanced Async Patterns

### 4. Producer-Consumer Pattern

```python
import asyncio
from asyncio import Queue
from typing import Optional

class ProducerConsumer:
    """Producer-consumer pattern for continuous processing."""
    
    def __init__(self, num_workers: int = 3):
        self.queue = Queue()
        self.num_workers = num_workers
        self.results = []
    
    async def producer(self, items: list):
        """Add items to queue."""
        for item in items:
            await self.queue.put(item)
        
        # Signal workers to stop
        for _ in range(self.num_workers):
            await self.queue.put(None)
    
    async def worker(self, client, worker_id: int):
        """Worker that processes items from queue."""
        while True:
            item = await self.queue.get()
            
            if item is None:
                # Stop signal
                break
            
            try:
                result = await client.text.generate(item)
                self.results.append(result)
                print(f"Worker {worker_id}: Processed '{item[:30]}...'")
            except Exception as e:
                print(f"Worker {worker_id}: Error - {e}")
            
            self.queue.task_done()
    
    async def process(self, client, items: list) -> list:
        """Process items using producer-consumer pattern."""
        
        # Start workers
        workers = [
            asyncio.create_task(self.worker(client, i))
            for i in range(self.num_workers)
        ]
        
        # Start producer
        producer_task = asyncio.create_task(self.producer(items))
        
        # Wait for completion
        await producer_task
        await self.queue.join()
        
        # Wait for workers to finish
        for worker in workers:
            await worker
        
        return self.results

# Usage
async def main():
    items = [f"Task {i}" for i in range(50)]
    
    async with BlossomClient() as client:
        pc = ProducerConsumer(num_workers=4)
        results = await pc.process(client, items)
        print(f"Completed {len(results)} tasks")
```

---

### 5. Async Context Managers

```python
class AsyncBlossomSession:
    """Custom async context manager for Blossom AI."""
    
    def __init__(self, config=None):
        self.config = config
        self.client = None
        self.start_time = None
    
    async def __aenter__(self):
        """Enter context."""
        self.client = BlossomClient(config=self.config)
        self.start_time = asyncio.get_event_loop().time()
        print("Session started")
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Exit context."""
        if self.client:
            await self.client.aclose()
        
        duration = asyncio.get_event_loop().time() - self.start_time
        print(f"Session completed in {duration:.2f}s")
        
        if exc_type:
            print(f"Error occurred: {exc_val}")
    
    @property
    def text(self):
        """Access text generator."""
        return self.client.text
    
    @property
    def image(self):
        """Access image generator."""
        return self.client.image

# Usage
async def custom_session():
    """Use custom async session."""
    
    async with AsyncBlossomSession() as session:
        result = await session.text.generate("Hello from custom session")
        print(result)
```

---

### 6. Async Generators

```python
async def async_prompt_generator():
    """Generate prompts asynchronously."""
    prompts = [
        "Hello",
        "How are you?",
        "Tell me a joke",
        "What is AI?",
        "Goodbye"
    ]
    
    for prompt in prompts:
        yield prompt
        await asyncio.sleep(0.1)  # Simulate delay

async def process_with_generator():
    """Process using async generator."""
    
    async with BlossomClient() as client:
        async for prompt in async_prompt_generator():
            result = await client.text.generate(prompt)
            print(f"Prompt: {prompt}")
            print(f"Response: {result}")
            print("-" * 40)
```

---

### 7. Timeout Handling

```python
import asyncio
from typing import Optional

async def with_timeout():
    """Handle timeouts properly."""
    
    async with BlossomClient() as client:
        try:
            # Set timeout for single request
            result = await asyncio.wait_for(
                client.text.generate("Long essay...", max_tokens=2000),
                timeout=30.0  # 30 second timeout
            )
            print(result)
        except asyncio.TimeoutError:
            print("Request timed out!")
        except Exception as e:
            print(f"Error: {e}")

async def batch_with_timeouts():
    """Handle timeouts in batch processing."""
    
    async with BlossomClient() as client:
        tasks = []
        
        for i in range(10):
            task = asyncio.wait_for(
                client.text.generate(f"Request {i}", max_tokens=500),
                timeout=10.0
            )
            tasks.append(task)
        
        # Process with individual timeout handling
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for i, result in enumerate(results):
            if isinstance(result, asyncio.TimeoutError):
                print(f"Request {i}: Timed out")
            elif isinstance(result, Exception):
                print(f"Request {i}: Error - {result}")
            else:
                print(f"Request {i}: Success")
```

---

### 8. Retry Logic

```python
import asyncio
from typing import Optional

class AsyncRetry:
    """Async retry decorator."""
    
    def __init__(
        self,
        max_attempts: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        exponential_base: float = 2.0
    ):
        self.max_attempts = max_attempts
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
    
    def __call__(self, func):
        async def wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(self.max_attempts):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    
                    if attempt < self.max_attempts - 1:
                        # Calculate delay with exponential backoff
                        delay = min(
                            self.base_delay * (self.exponential_base ** attempt),
                            self.max_delay
                        )
                        
                        print(f"Attempt {attempt + 1} failed, retrying in {delay}s...")
                        await asyncio.sleep(delay)
                    
                    else:
                        print(f"All {self.max_attempts} attempts failed")
            
            raise last_exception
        
        return wrapper

# Usage
@AsyncRetry(max_attempts=3, base_delay=2.0)
async def reliable_generation(prompt: str):
    """Generate text with automatic retries."""
    
    async with BlossomClient() as client:
        return await client.text.generate(prompt)

async def main():
    try:
        result = await reliable_generation("Hello with retries")
        print(result)
    except Exception as e:
        print(f"Final error: {e}")
```

---

## Error Handling in Async

### 9. Exception Aggregation

```python
import asyncio
from typing import List, Union, Any

class AsyncExceptionAggregator:
    """Aggregate exceptions from multiple tasks."""
    
    def __init__(self):
        self.results = []
        self.exceptions = []
    
    async def gather_with_errors(
        self,
        tasks: List[asyncio.Task]
    ) -> List[Union[Any, Exception]]:
        """Gather results, collecting exceptions."""
        
        self.results = []
        self.exceptions = []
        
        # Wait for all tasks
        done, pending = await asyncio.wait(tasks)
        
        for task in done:
            try:
                result = task.result()
                self.results.append(result)
            except Exception as e:
                self.exceptions.append(e)
                self.results.append(e)
        
        return self.results
    
    def has_errors(self) -> bool:
        """Check if any errors occurred."""
        return len(self.exceptions) > 0
    
    def get_errors(self) -> List[Exception]:
        """Get all exceptions."""
        return self.exceptions.copy()

# Usage
async def error_handling_example():
    """Example of aggregated error handling."""
    
    async with BlossomClient() as client:
        # Create tasks that might fail
        tasks = [
            asyncio.create_task(client.text.generate("Valid prompt 1")),
            asyncio.create_task(client.text.generate("")),  # Might fail
            asyncio.create_task(client.text.generate("Valid prompt 2")),
            asyncio.create_task(client.text.generate(None)),  # Will fail
        ]
        
        aggregator = AsyncExceptionAggregator()
        results = await aggregator.gather_with_errors(tasks)
        
        # Process results
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                print(f"Task {i}: Failed - {result}")
            else:
                print(f"Task {i}: Success - {result[:50]}...")
        
        if aggregator.has_errors():
            print(f"\nTotal errors: {len(aggregator.get_errors())}")
```

---

### 10. Circuit Breaker Pattern

```python
import asyncio
from enum import Enum
from datetime import datetime, timedelta

class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

class CircuitBreaker:
    """Circuit breaker for async operations."""
    
    def __init__(
        self,
        failure_threshold: int = 5,
        timeout: float = 60.0,
        reset_timeout: float = 30.0
    ):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.reset_timeout = reset_timeout
        
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = None
        self.half_open_start = None
    
    async def __call__(self, func, *args, **kwargs):
        """Execute function with circuit breaker protection."""
        
        if self.state == CircuitState.OPEN:
            if self._should_attempt_reset():
                self.state = CircuitState.HALF_OPEN
                self.half_open_start = datetime.now()
            else:
                raise Exception("Circuit breaker is OPEN")
        
        try:
            result = await asyncio.wait_for(
                func(*args, **kwargs),
                timeout=self.timeout
            )
            
            # Success - reset on half-open
            if self.state == CircuitState.HALF_OPEN:
                self._reset()
            
            # Success in closed state - no change
            return result
            
        except Exception as e:
            self._record_failure()
            
            if self.failure_count >= self.failure_threshold:
                self.state = CircuitState.OPEN
                self.last_failure_time = datetime.now()
            
            raise
    
    def _should_attempt_reset(self) -> bool:
        """Check if should attempt to reset circuit breaker."""
        if not self.last_failure_time:
            return False
        
        return datetime.now() - self.last_failure_time >= timedelta(
            seconds=self.reset_timeout
        )
    
    def _record_failure(self):
        """Record a failure."""
        self.failure_count += 1
        self.last_failure_time = datetime.now()
    
    def _reset(self):
        """Reset circuit breaker."""
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = None
        self.half_open_start = None

# Usage
circuit_breaker = CircuitBreaker(
    failure_threshold=3,
    timeout=10.0,
    reset_timeout=15.0
)

async def protected_request(prompt: str):
    """Make request with circuit breaker protection."""
    
    async with BlossomClient() as client:
        return await circuit_breaker(
            client.text.generate,
            prompt
        )

async def main():
    for i in range(10):
        try:
            result = await protected_request(f"Request {i}")
            print(f"Success: {result[:50]}...")
        except Exception as e:
            print(f"Error: {e}")
        
        await asyncio.sleep(1)
```

---

## Performance Patterns

### 11. Connection Pooling

```python
import asyncio
from blossom_ai import SessionConfig
from blossom_ai.utils.http_client import HttpxClient

async def optimized_connections():
    """Use optimized connection pools."""
    
    # Configure connection pool
    config = SessionConfig(
        sync_pool_connections=50,
        sync_pool_maxsize=100,
        async_limit_total=1000,
        async_limit_per_host=100,
        async_timeout_connect=5.0,
        async_timeout_sock_read=30.0
    )
    
    async with BlossomClient(config=config) as client:
        # All requests reuse connections
        tasks = [
            client.text.generate(f"Request {i}")
            for i in range(100)
        ]
        
        results = await asyncio.gather(*tasks)
        print(f"Completed {len(results)} requests with connection reuse")
```

---

### 12. Rate Limiting

```python
import asyncio
from typing import Optional
import time

class AsyncRateLimiter:
    """Async rate limiter."""
    
    def __init__(self, max_requests: int, time_window: float = 60.0):
        self.max_requests = max_requests
        self.time_window = time_window
        self.requests = []
        self.lock = asyncio.Lock()
    
    async def acquire(self):
        """Acquire permission to make request."""
        async with self.lock:
            now = time.time()
            
            # Remove old requests outside time window
            self.requests = [
                req_time for req_time in self.requests
                if now - req_time < self.time_window
            ]
            
            # Check if we can make request
            if len(self.requests) >= self.max_requests:
                # Wait until oldest request is outside window
                oldest_request = min(self.requests)
                wait_time = self.time_window - (now - oldest_request)
                if wait_time > 0:
                    await asyncio.sleep(wait_time)
                
                # Clean up again
                now = time.time()
                self.requests = [
                    req_time for req_time in self.requests
                    if now - req_time < self.time_window
                ]
            
            # Record request
            self.requests.append(now)
    
    async def __call__(self, func, *args, **kwargs):
        """Execute function with rate limiting."""
        await self.acquire()
        return await func(*args, **kwargs)

# Usage
rate_limiter = AsyncRateLimiter(max_requests=10, time_window=60.0)

async def rate_limited_request(prompt: str):
    """Make rate-limited request."""
    
    async with BlossomClient() as client:
        return await rate_limiter(
            client.text.generate,
            prompt
        )

async def main():
    for i in range(20):
        start_time = time.time()
        result = await rate_limited_request(f"Request {i}")
        elapsed = time.time() - start_time
        print(f"Request {i}: {elapsed:.2f}s - {result[:30]}...")
```

---

### 13. Request Batching

```python
import asyncio
from typing import List, Dict, Any

class RequestBatcher:
    """Batch multiple requests into single API calls."""
    
    def __init__(self, client, max_batch_size: int = 10, max_wait_time: float = 1.0):
        self.client = client
        self.max_batch_size = max_batch_size
        self.max_wait_time = max_wait_time
        self.batch = []
        self.batch_lock = asyncio.Lock()
        self.flush_event = asyncio.Event()
    
    async def add_request(self, prompt: str, **kwargs) -> str:
        """Add request to batch."""
        
        # Create future for this request
        future = asyncio.Future()
        
        async with self.batch_lock:
            self.batch.append({
                'prompt': prompt,
                'kwargs': kwargs,
                'future': future
            })
            
            # Flush if batch is full
            if len(self.batch) >= self.max_batch_size:
                self.flush_event.set()
        
        # Wait for result
        return await future
    
    async def batch_processor(self):
        """Process batches continuously."""
        
        while True:
            # Wait for flush signal or timeout
            try:
                await asyncio.wait_for(
                    self.flush_event.wait(),
                    timeout=self.max_wait_time
                )
            except asyncio.TimeoutError:
                # Timeout reached, check if we have requests
                pass
            
            # Get current batch
            async with self.batch_lock:
                if not self.batch:
                    self.flush_event.clear()
                    continue
                
                current_batch = self.batch.copy()
                self.batch = []
                self.flush_event.clear()
            
            # Process batch
            await self._process_batch(current_batch)
    
    async def _process_batch(self, batch: List[Dict]):
        """Process a batch of requests."""
        
        try:
            # Extract prompts
            prompts = [item['prompt'] for item in batch]
            
            # Make batch request (simplified - actual implementation would depend on API support)
            results = []
            for prompt in prompts:
                result = await self.client.text.generate(prompt)
                results.append(result)
            
            # Fulfill futures
            for item, result in zip(batch, results):
                item['future'].set_result(result)
        
        except Exception as e:
            # Set error on all futures
            for item in batch:
                item['future'].set_exception(e)

# Usage
async def batching_example():
    """Example of request batching."""
    
    async with BlossomClient() as client:
        batcher = RequestBatcher(client, max_batch_size=5)
        
        # Start batch processor
        processor_task = asyncio.create_task(batcher.batch_processor())
        
        # Add multiple requests
        tasks = [
            batcher.add_request(f"Batch request {i}")
            for i in range(12)
        ]
        
        # Wait for results
        results = await asyncio.gather(*tasks)
        
        print(f"Processed {len(results)} batched requests")
        
        # Stop processor
        processor_task.cancel()
```

---

### 14. Connection Pool Management

```python
import asyncio
from blossom_ai.utils.http_client import HttpxClient
from blossom_ai import SessionConfig
import httpx

class PooledBlossomClient:
    """Blossom client with advanced connection pooling."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig()
        self.http_client = None
        self._closed = False
    
    async def __aenter__(self):
        """Enter async context."""
        
        # Create HTTP client with optimized limits
        limits = httpx.Limits(
            max_keepalive_connections=self.config.sync_pool_connections,
            max_connections=self.config.sync_pool_maxsize
        )
        
        self.http_client = HttpxClient(
            config=self.config,
            limits=limits,
            http2=True  # Enable HTTP/2 for multiplexing
        )
        
        # Initialize client
        await self.http_client.__aenter__()
        
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Exit async context."""
        
        self._closed = True
        
        if self.http_client:
            await self.http_client.__aexit__(exc_type, exc_val, exc_tb)
    
    @property
    def text(self):
        """Access text generator."""
        # Return proxy that uses pooled client
        return TextGeneratorProxy(self)
    
    @property
    def image(self):
        """Access image generator."""
        return ImageGeneratorProxy(self)

class TextGeneratorProxy:
    """Proxy for text generation using pooled client."""
    
    def __init__(self, pooled_client: PooledBlossomClient):
        self.pooled_client = pooled_client
    
    async def generate(self, prompt: str, **kwargs):
        """Generate text using pooled connection."""
        
        # Use the pooled HTTP client for the request
        http_client = self.pooled_client.http_client
        
        # Make request using pooled connection
        # (Implementation would use actual Blossom AI endpoints)
        response = await http_client.post(
            "/api/text/generate",
            json={"prompt": prompt, **kwargs}
        )
        
        return response.json()["text"]

# Usage
async def pooled_client_example():
    """Example of using pooled client."""
    
    config = SessionConfig(
        sync_pool_connections=20,
        sync_pool_maxsize=50
    )
    
    async with PooledBlossomClient(config) as client:
        # All requests share the same connection pool
        tasks = [
            client.text.generate(f"Pooled request {i}")
            for i in range(100)
        ]
        
        results = await asyncio.gather(*tasks)
        print(f"Made {len(results)} requests with connection pooling")
```

---

### 15. Async Caching

```python
import asyncio
from typing import Optional, Any, Callable
import hashlib
import json

class AsyncCache:
    """Async cache with TTL support."""
    
    def __init__(self, ttl: float = 3600):
        self.ttl = ttl
        self.cache = {}
        self.timestamps = {}
        self.lock = asyncio.Lock()
    
    def _generate_key(self, *args, **kwargs) -> str:
        """Generate cache key from arguments."""
        key_data = {
            "args": args,
            "kwargs": sorted(kwargs.items())
        }
        key_string = json.dumps(key_data, sort_keys=True)
        return hashlib.sha256(key_string.encode()).hexdigest()
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        async with self.lock:
            if key in self.cache:
                timestamp = self.timestamps[key]
                if asyncio.get_event_loop().time() - timestamp < self.ttl:
                    return self.cache[key]
                else:
                    # Expired
                    del self.cache[key]
                    del self.timestamps[key]
            
            return None
    
    async def set(self, key: str, value: Any):
        """Set value in cache."""
        async with self.lock:
            self.cache[key] = value
            self.timestamps[key] = asyncio.get_event_loop().time()
    
    async def clear(self):
        """Clear all cache entries."""
        async with self.lock:
            self.cache.clear()
            self.timestamps.clear()

def async_cache(ttl: float = 3600):
    """Decorator for async function caching."""
    
    cache = AsyncCache(ttl)
    
    def decorator(func: Callable) -> Callable:
        async def wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = cache._generate_key(*args, **kwargs)
            
            # Try to get from cache
            cached_result = await cache.get(cache_key)
            if cached_result is not None:
                print("Cache hit!")
                return cached_result
            
            # Execute function
            result = await func(*args, **kwargs)
            
            # Store in cache
            await cache.set(cache_key, result)
            
            return result
        
        return wrapper
    
    return decorator

# Usage
@async_cache(ttl=1800)  # 30 minutes TTL
async def cached_generation(prompt: str):
    """Generate text with caching."""
    
    async with BlossomClient() as client:
        print(f"Making API call for: {prompt}")
        return await client.text.generate(prompt)

async def caching_example():
    """Example of async caching."""\n    
    # First call - hits API
    result1 = await cached_generation("Hello world")
    print(f"First call: {result1[:50]}...")
    
    # Second call - hits cache
    result2 = await cached_generation("Hello world")
    print(f"Second call: {result2[:50]}...")
    
    # Different prompt - hits API
    result3 = await cached_generation("How are you?")
    print(f"Different prompt: {result3[:50]}...")
```

---

### 16. Request Prioritization

```python
import asyncio
from typing import List, Dict, Any
from enum import IntEnum
import heapq

class Priority(IntEnum):
    LOW = 3
    NORMAL = 2
    HIGH = 1
    CRITICAL = 0

class PriorityRequest:
    """Request with priority."""
    
    def __init__(
        self,
        prompt: str,
        priority: Priority = Priority.NORMAL,
        **kwargs
    ):
        self.prompt = prompt
        self.priority = priority
        self.kwargs = kwargs
        self.future = asyncio.Future()
        self.timestamp = asyncio.get_event_loop().time()
    
    def __lt__(self, other):
        """Compare for priority queue."""
        if self.priority == other.priority:
            return self.timestamp < other.timestamp
        return self.priority < other.priority

class PriorityBatcher:
    """Process requests by priority."""
    
    def __init__(self, client, max_batch_size: int = 10):
        self.client = client
        self.max_batch_size = max_batch_size
        self.priority_queue = []
        self.processing = False
        self.lock = asyncio.Lock()
    
    async def submit(
        self,
        prompt: str,
        priority: Priority = Priority.NORMAL,
        **kwargs
    ) -> Any:
        """Submit request with priority."""
        
        request = PriorityRequest(prompt, priority, **kwargs)
        
        async with self.lock:
            heapq.heappush(self.priority_queue, request)
            
            if not self.processing:
                self.processing = True
                asyncio.create_task(self._process_batch())
        
        return await request.future
    
    async def _process_batch(self):
        """Process highest priority requests."""
        
        while True:
            async with self.lock:
                if not self.priority_queue:
                    self.processing = False
                    break
                
                # Get highest priority requests
                batch = []
                for _ in range(min(self.max_batch_size, len(self.priority_queue))):
                    request = heapq.heappop(self.priority_queue)
                    batch.append(request)
            
            # Process batch
            await self._execute_batch(batch)
    
    async def _execute_batch(self, batch: List[PriorityRequest]):
        """Execute batch of requests."""
        
        try:
            # Process each request
            for request in batch:
                result = await self.client.text.generate(
                    request.prompt,
                    **request.kwargs
                )
                request.future.set_result(result)
        
        except Exception as e:
            # Set error on all requests
            for request in batch:
                request.future.set_exception(e)

# Usage
async def prioritization_example():
    """Example of request prioritization."""
    
    async with BlossomClient() as client:
        batcher = PriorityBatcher(client, max_batch_size=5)
        
        # Submit requests with different priorities
        tasks = [
            batcher.submit("Low priority", Priority.LOW),
            batcher.submit("Critical request", Priority.CRITICAL),
            batcher.submit("Normal request", Priority.NORMAL),
            batcher.submit("High priority", Priority.HIGH),
            batcher.submit("Another critical", Priority.CRITICAL),
        ]
        
        # Wait for results (processed in priority order)
        results = await asyncio.gather(*tasks)
        
        for i, result in enumerate(results):
            print(f"Result {i}: {result[:50]}...")
```

---

## Best Practices

### 17. Resource Cleanup

```python
import asyncio
import weakref

class ResourceManager:
    """Manage async resources properly."""
    
    def __init__(self):
        self.resources = []
        self.closed = False
    
    async def add_resource(self, resource):
        """Add resource for cleanup."""
        if not self.closed:
            self.resources.append(weakref.ref(resource))
    
    async def close_all(self):
        """Close all managed resources."""
        self.closed = True
        
        for resource_ref in self.resources:
            resource = resource_ref()
            if resource and hasattr(resource, 'aclose'):
                try:
                    await resource.aclose()
                except Exception as e:
                    print(f"Error closing resource: {e}")
        
        self.resources.clear()

# Usage
async def resource_management_example():
    """Example of proper resource management."""
    
    manager = ResourceManager()
    
    try:
        async with BlossomClient() as client:
            await manager.add_resource(client)
            
            # Use client...
            result = await client.text.generate("Hello")
            print(result)
    
    finally:
        # Ensure cleanup
        await manager.close_all()
```

---

### 18. Graceful Shutdown

```python
import asyncio
import signal

class GracefulShutdown:
    """Handle graceful shutdown of async operations."""
    
    def __init__(self):
        self.shutdown_event = asyncio.Event()
        self.tasks = []
    
    def setup_signal_handlers(self):
        """Setup signal handlers for graceful shutdown."""
        
        def signal_handler(signum, frame):
            print(f"Received signal {signum}, shutting down...")
            self.shutdown_event.set()
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    
    async def wait_for_shutdown(self):
        """Wait for shutdown signal."""
        await self.shutdown_event.wait()
    
    def add_task(self, task: asyncio.Task):
        """Add task to be cancelled on shutdown."""
        self.tasks.append(task)
    
    async def cancel_all_tasks(self):
        """Cancel all managed tasks."""
        for task in self.tasks:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

# Usage
async def graceful_shutdown_example():
    """Example of graceful shutdown."""
    
    shutdown_manager = GracefulShutdown()
    shutdown_manager.setup_signal_handlers()
    
    try:
        async with BlossomClient() as client:
            # Start long-running task
            async def continuous_processing():
                while not shutdown_manager.shutdown_event.is_set():
                    result = await client.text.generate("Continuous task")
                    print(f"Processed: {result[:50]}...")
                    await asyncio.sleep(5)
            
            task = asyncio.create_task(continuous_processing())
            shutdown_manager.add_task(task)
            
            # Wait for shutdown signal
            await shutdown_manager.wait_for_shutdown()
            
            # Cancel task gracefully
            await shutdown_manager.cancel_all_tasks()
            
            print("Shutdown complete")
    
    except Exception as e:
        print(f"Error during shutdown: {e}")
```

---

### 19. Testing Async Code

```python
import asyncio
import pytest
from unittest.mock import AsyncMock, patch

# Test async functions
@pytest.mark.asyncio
async def test_async_generation():
    """Test async text generation."""
    
    async with BlossomClient() as client:
        result = await client.text.generate("Test prompt")
        assert result is not None
        assert len(result) > 0

@pytest.mark.asyncio
async def test_concurrent_requests():
    """Test concurrent requests."""
    
    async with BlossomClient() as client:
        tasks = [
            client.text.generate(f"Test {i}")
            for i in range(5)
        ]
        
        results = await asyncio.gather(*tasks)
        assert len(results) == 5
        assert all(result is not None for result in results)

@pytest.mark.asyncio
async def test_timeout_handling():
    """Test timeout handling."""
    
    async with BlossomClient() as client:
        try:
            result = await asyncio.wait_for(
                client.text.generate("Long task", max_tokens=2000),
                timeout=0.1  # Very short timeout
            )
            assert False, "Should have timed out"
        except asyncio.TimeoutError:
            pass  # Expected

# Mock testing
@pytest.mark.asyncio
@patch('blossom_ai.BlossomClient')
async def test_with_mock_client(mock_client_class):
    """Test with mocked client."""
    
    # Setup mock
    mock_client = AsyncMock()
    mock_client.text.generate.return_value = "Mocked response"
    mock_client_class.return_value.__aenter__.return_value = mock_client
    
    # Test
    async with BlossomClient() as client:
        result = await client.text.generate("Test")
        assert result == "Mocked response"
```

---

### 20. Performance Monitoring

```python
import asyncio
import time
from typing import Dict, Any

class AsyncPerformanceMonitor:
    """Monitor async performance."""
    
    def __init__(self):
        self.metrics = {
            "requests_total": 0,
            "requests_success": 0,
            "requests_failed": 0,
            "total_time": 0.0,
            "concurrent_requests": 0,
            "max_concurrent": 0
        }
        self.lock = asyncio.Lock()
    
    def monitor(self, func):
        """Decorator to monitor function performance."""
        
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            
            async with self.lock:
                self.metrics["requests_total"] += 1
                self.metrics["concurrent_requests"] += 1
                self.metrics["max_concurrent"] = max(
                    self.metrics["max_concurrent"],
                    self.metrics["concurrent_requests"]
                )
            
            try:
                result = await func(*args, **kwargs)
                
                async with self.lock:
                    self.metrics["requests_success"] += 1
                    self.metrics["concurrent_requests"] -= 1
                
                return result
            
            except Exception as e:
                async with self.lock:
                    self.metrics["requests_failed"] += 1
                    self.metrics["concurrent_requests"] -= 1
                
                raise
            
            finally:
                duration = time.time() - start_time
                async with self.lock:
                    self.metrics["total_time"] += duration
        
        return wrapper
    
    def get_stats(self) -> Dict[str, Any]:
        """Get performance statistics."""
        return self.metrics.copy()

# Usage
monitor = AsyncPerformanceMonitor()

@monitor.monitor
async def monitored_generation(prompt: str):
    """Generate text with performance monitoring."""
    
    async with BlossomClient() as client:
        return await client.text.generate(prompt)

async def monitoring_example():
    """Example of performance monitoring."""
    
    # Run multiple concurrent requests
    tasks = [
        monitored_generation(f"Monitored request {i}")
        for i in range(10)
    ]
    
    results = await asyncio.gather(*tasks)
    
    # Get stats
    stats = monitor.get_stats()
    print(f"Total requests: {stats['requests_total']}")
    print(f"Success rate: {stats['requests_success'] / stats['requests_total'] * 100:.1f}%")
    print(f"Max concurrent: {stats['max_concurrent']}")
```

---

## See Also

- [Performance Guide](PERFORMANCE.md) - Performance optimization techniques
- [Memory Management](MEMORY.md) - Managing memory in async applications
- [Connection Pooling](CONNECTION_POOLING.md) - HTTP connection optimization
- [Error Handling](ERROR_TYPES.md) - Handling errors in async code
- [Testing Guide](TESTING.md) - Testing async applications

---

## Summary

Key takeaways for async patterns with Blossom AI:

1. **Always use async/await** for better performance
2. **Handle timeouts** to prevent hanging requests
3. **Implement retries** for unreliable operations
4. **Use connection pooling** for HTTP optimization
5. **Monitor performance** to identify bottlenecks
6. **Clean up resources** properly
7. **Test thoroughly** with async test tools