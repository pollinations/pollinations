# ⏱️ Rate Limiting Guide

> Complete guide to rate limiting with Blossom AI

---

## 🎯 Overview

Rate limiting is essential for:
- **Respecting API quotas** and avoiding overages
- **Preventing abuse** and ensuring fair usage
- **Managing costs** by controlling request frequency
- **Maintaining performance** under high load

Blossom AI provides multiple rate limiting strategies:
- Token bucket algorithm
- Per-user rate limiting
- Distributed rate limiting with Redis
- Adaptive rate limiting

---

## 📊 Understanding Rate Limits

### Default Limits

| Service | Free Tier | Paid Tier |
|---------|-----------|-----------|
| Text Generation | 30 req/min | 120 req/min |
| Image Generation | 10 req/min | 60 req/min |
| Vision Analysis | 20 req/min | 100 req/min |

### Limit Types

1. **Per-minute limits**: Most common, resets every minute
2. **Daily limits**: Total requests per day
3. **Monthly limits**: Total requests per month
4. **Concurrent limits**: Simultaneous requests

---

## 🔧 Basic Rate Limiting

### Automatic Rate Limiting

```python
from blossom_ai import BlossomClient, SessionConfig

config = SessionConfig(
    rate_limit_per_minute=60  # 60 requests per minute
)

with BlossomClient(config=config) as client:
    # Rate limiting is handled automatically
    for i in range(100):
        response = client.text.generate(f"Message {i}")
        # Requests 61-100 will be delayed appropriately
```

### Handling Rate Limit Errors

```python
from blossom_ai import RateLimitError, BlossomClient
import asyncio

async def generate_with_handling(prompt):
    try:
        with BlossomClient(rate_limit_per_minute=60) as client:
            return client.text.generate(prompt)
    except RateLimitError as e:
        print(f"Rate limited! Wait {e.retry_after} seconds")
        await asyncio.sleep(e.retry_after)
        return await generate_with_handling(prompt)  # Retry
```

---

## 🏗️ Advanced Rate Limiting

### Token Bucket Rate Limiter

```python
from blossom_ai.utils.rate_limiter import TokenBucketRateLimiter
from blossom_ai import BlossomClient

# Create custom rate limiter
rate_limiter = TokenBucketRateLimiter(
    requests_per_minute=120,
    burst_size=10  # Allow 10 requests in burst
)

# Use with client
with BlossomClient(rate_limiter=rate_limiter) as client:
    response = client.text.generate("test")
```

### Per-User Rate Limiting

```python
from collections import defaultdict
import time

class UserRateLimiter:
    def __init__(self, default_limit=60):
        self.user_limits = defaultdict(lambda: default_limit)
        self.user_requests = defaultdict(list)
    
    def set_user_limit(self, user_id: int, limit: int):
        """Set custom rate limit for user."""
        self.user_limits[user_id] = limit
    
    def is_allowed(self, user_id: int) -> bool:
        """Check if user can make request."""
        now = time.time()
        window_start = now - 60  # 1 minute window
        
        # Clean old requests
        self.user_requests[user_id] = [
            req_time for req_time in self.user_requests[user_id]
            if req_time > window_start
        ]
        
        # Check limit
        if len(self.user_requests[user_id]) >= self.user_limits[user_id]:
            return False
        
        # Add current request
        self.user_requests[user_id].append(now)
        return True
    
    def get_wait_time(self, user_id: int) -> float:
        """Get seconds until next request is allowed."""
        if self.is_allowed(user_id):
            return 0.0
        
        # Find oldest request in current window
        oldest_request = min(self.user_requests[user_id])
        wait_time = 60 - (time.time() - oldest_request)
        return max(0.0, wait_time)

# Usage
user_limiter = UserRateLimiter()

async def handle_user_request(user_id: int, prompt: str):
    if not user_limiter.is_allowed(user_id):
        wait_time = user_limiter.get_wait_time(user_id)
        return f"Rate limited. Wait {wait_time:.1f} seconds"
    
    with BlossomClient() as client:
        return client.text.generate(prompt)
```

### Distributed Rate Limiting with Redis

```python
import redis
import time
import json

class DistributedRateLimiter:
    def __init__(self, redis_client, default_limit=60):
        self.redis = redis_client
        self.default_limit = default_limit
        self.window_size = 60  # 1 minute
    
    def is_allowed(self, user_id: str, limit: int = None) -> bool:
        """Check rate limit using Redis."""
        limit = limit or self.default_limit
        now = time.time()
        window_start = now - self.window_size
        
        # Redis key for this user
        key = f"rate_limit:{user_id}"
        
        # Remove old entries
        self.redis.zremrangebyscore(key, 0, window_start)
        
        # Count current requests
        current_count = self.redis.zcard(key)
        
        if current_count >= limit:
            return False
        
        # Add current request
        self.redis.zadd(key, {str(now): now})
        self.redis.expire(key, self.window_size)
        
        return True
    
    def get_stats(self, user_id: str) -> dict:
        """Get rate limit statistics."""
        key = f"rate_limit:{user_id}"
        current_count = self.redis.zcard(key)
        
        return {
            "current_requests": current_count,
            "limit": self.default_limit,
            "remaining": max(0, self.default_limit - current_count),
            "reset_time": time.time() + 60
        }

# Usage
redis_client = redis.Redis(host='localhost', port=6379)
distributed_limiter = DistributedRateLimiter(redis_client)

async def api_endpoint(user_id: str):
    if not distributed_limiter.is_allowed(user_id):
        return {"error": "Rate limit exceeded"}, 429
    
    # Process request
    with BlossomClient() as client:
        response = client.text.generate("test")
        return {"text": response.text}
```

---

## 🎛️ Adaptive Rate Limiting

### Dynamic Rate Limits Based on Usage

```python
class AdaptiveRateLimiter:
    def __init__(self, base_limit=60, max_limit=200):
        self.base_limit = base_limit
        self.max_limit = max_limit
        self.user_stats = {}
    
    def update_user_stats(self, user_id: int, response_time: float, success: bool):
        """Update user performance statistics."""
        if user_id not in self.user_stats:
            self.user_stats[user_id] = {
                "total_requests": 0,
                "successful_requests": 0,
                "avg_response_time": 0.0
            }
        
        stats = self.user_stats[user_id]
        stats["total_requests"] += 1
        
        if success:
            stats["successful_requests"] += 1
            # Update average response time
            alpha = 0.1  # Smoothing factor
            stats["avg_response_time"] = (
                alpha * response_time + 
                (1 - alpha) * stats["avg_response_time"]
            )
    
    def get_user_limit(self, user_id: int) -> int:
        """Calculate dynamic rate limit for user."""
        if user_id not in self.user_stats:
            return self.base_limit
        
        stats = self.user_stats[user_id]
        
        # Calculate success rate
        success_rate = stats["successful_requests"] / stats["total_requests"]
        
        # Calculate performance score (lower response time = better)
        performance_score = max(0, 1 - stats["avg_response_time"] / 10.0)
        
        # Calculate dynamic limit
        limit_multiplier = (success_rate + performance_score) / 2
        dynamic_limit = int(self.base_limit * (1 + limit_multiplier))
        
        return min(dynamic_limit, self.max_limit)

# Usage
adaptive_limiter = AdaptiveRateLimiter()

async def handle_request(user_id: int, prompt: str):
    limit = adaptive_limiter.get_user_limit(user_id)
    
    if not rate_limiter.is_allowed(user_id, limit):
        wait_time = rate_limiter.get_wait_time(user_id)
        return f"Rate limited. Wait {wait_time:.1f} seconds"
    
    start_time = time.time()
    try:
        with BlossomClient() as client:
            response = client.text.generate(prompt)
        
        response_time = time.time() - start_time
        adaptive_limiter.update_user_stats(user_id, response_time, True)
        
        return response.text
    
    except Exception as e:
        response_time = time.time() - start_time
        adaptive_limiter.update_user_stats(user_id, response_time, False)
        raise
```

---

## 🚀 Best Practices

### 1. Exponential Backoff

```python
import asyncio
import random

async def exponential_backoff_retry(func, max_attempts=5, base_delay=1.0):
    """Retry with exponential backoff."""
    
    for attempt in range(max_attempts):
        try:
            return await func()
        except RateLimitError:
            if attempt == max_attempts - 1:
                raise
            
            # Exponential backoff with jitter
            delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
            print(f"Rate limited. Waiting {delay:.1f} seconds...")
            await asyncio.sleep(delay)

# Usage
async def generate_text(prompt):
    return await exponential_backoff_retry(
        lambda: ai.text.generate(prompt),
        max_attempts=3
    )
```

### 2. Request Queuing

```python
import asyncio
from collections import deque

class RequestQueue:
    def __init__(self, rate_limit=60):
        self.rate_limit = rate_limit
        self.queue = deque()
        self.processing = False
        self.last_request_time = 0
    
    async def add_request(self, request_func):
        """Add request to queue."""
        future = asyncio.Future()
        self.queue.append((request_func, future))
        
        if not self.processing:
            asyncio.create_task(self.process_queue())
        
        return await future
    
    async def process_queue(self):
        """Process requests respecting rate limit."""
        self.processing = True
        
        while self.queue:
            # Wait if needed
            now = time.time()
            time_since_last = now - self.last_request_time
            if time_since_last < (60 / self.rate_limit):
                await asyncio.sleep((60 / self.rate_limit) - time_since_last)
            
            # Process next request
            request_func, future = self.queue.popleft()
            
            try:
                result = await request_func()
                future.set_result(result)
            except Exception as e:
                future.set_exception(e)
            
            self.last_request_time = time.time()
        
        self.processing = False

# Usage
request_queue = RequestQueue(rate_limit=60)

async def handle_many_requests(prompts):
    tasks = []
    for prompt in prompts:
        task = request_queue.add_request(
            lambda p=prompt: ai.text.generate(p)
        )
        tasks.append(task)
    
    results = await asyncio.gather(*tasks)
    return results
```

### 3. Circuit Breaker Pattern

```python
import time
from enum import Enum

class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

class CircuitBreaker:
    def __init__(self, failure_threshold=5, timeout=60, recovery_timeout=30):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.recovery_timeout = recovery_timeout
        
        self.failure_count = 0
        self.last_failure_time = None
        self.state = CircuitState.CLOSED
        self.half_open_start = None
    
    def __call__(self, func):
        async def wrapper(*args, **kwargs):
            if self.state == CircuitState.OPEN:
                if time.time() - self.last_failure_time > self.timeout:
                    self.state = CircuitState.HALF_OPEN
                    self.half_open_start = time.time()
                else:
                    raise Exception("Circuit breaker is OPEN")
            
            try:
                result = await func(*args, **kwargs)
                
                if self.state == CircuitState.HALF_OPEN:
                    if time.time() - self.half_open_start > self.recovery_timeout:
                        self.state = CircuitState.CLOSED
                        self.failure_count = 0
                
                return result
            
            except Exception as e:
                self.failure_count += 1
                self.last_failure_time = time.time()
                
                if self.failure_count >= self.failure_threshold:
                    self.state = CircuitState.OPEN
                
                raise
        
        return wrapper

# Usage
breaker = CircuitBreaker(failure_threshold=3, timeout=60)

@breaker
async def generate_with_circuit_breaker(prompt):
    return ai.text.generate(prompt)
```

---

## 📊 Monitoring Rate Limits

### Rate Limit Metrics

```python
import time
from collections import defaultdict

class RateLimitMonitor:
    def __init__(self):
        self.metrics = defaultdict(lambda: {
            "total_requests": 0,
            "rate_limited_requests": 0,
            "avg_response_time": 0.0
        })
    
    def record_request(self, user_id: int, response_time: float, rate_limited: bool):
        """Record request metrics."""
        metrics = self.metrics[user_id]
        metrics["total_requests"] += 1
        
        if rate_limited:
            metrics["rate_limited_requests"] += 1
        
        # Update average response time
        alpha = 0.1
        metrics["avg_response_time"] = (
            alpha * response_time + 
            (1 - alpha) * metrics["avg_response_time"]
        )
    
    def get_stats(self, user_id: int) -> dict:
        """Get rate limit statistics."""
        metrics = self.metrics[user_id]
        
        return {
            "total_requests": metrics["total_requests"],
            "rate_limited_requests": metrics["rate_limited_requests"],
            "rate_limit_rate": (
                metrics["rate_limited_requests"] / metrics["total_requests"]
                if metrics["total_requests"] > 0 else 0
            ),
            "avg_response_time": metrics["avg_response_time"]
        }

# Usage
monitor = RateLimitMonitor()

async def monitored_generation(user_id: int, prompt: str):
    start_time = time.time()
    rate_limited = False
    
    try:
        with BlossomClient() as client:
            response = client.text.generate(prompt)
        result = response.text
    except RateLimitError:
        rate_limited = True
        result = "Rate limited"
    except Exception as e:
        result = f"Error: {e}"
    
    response_time = time.time() - start_time
    monitor.record_request(user_id, response_time, rate_limited)
    
    return result
```

### Alerting

```python
import asyncio

class RateLimitAlert:
    def __init__(self, threshold_rate=0.1):
        self.threshold_rate = threshold_rate
        self.alerted_users = set()
    
    def check_and_alert(self, user_id: int, stats: dict):
        """Check if user needs rate limit alert."""
        if stats["rate_limit_rate"] > self.threshold_rate:
            if user_id not in self.alerted_users:
                self.send_alert(user_id, stats)
                self.alerted_users.add(user_id)
        else:
            # Reset alert status if rate improves
            self.alerted_users.discard(user_id)
    
    def send_alert(self, user_id: int, stats: dict):
        """Send rate limit alert."""
        message = f"""
        Rate Limit Alert:
        - User: {user_id}
        - Rate limit rate: {stats['rate_limit_rate']:.1%}
        - Total requests: {stats['total_requests']}
        - Avg response time: {stats['avg_response_time']:.2f}s
        """
        print(message)
        # Send email, Slack notification, etc.

# Usage
alert_system = RateLimitAlert(threshold_rate=0.2)

# Check periodically
async def periodic_check():
    while True:
        for user_id in monitor.metrics.keys():
            stats = monitor.get_stats(user_id)
            alert_system.check_and_alert(user_id, stats)
        
        await asyncio.sleep(60)  # Check every minute
```

---

## 🎓 Best Practices

### 1. Choose Appropriate Limits

```python
# Good: Reasonable limits for your use case
config = SessionConfig(
    rate_limit_per_minute=60  # 1 per second
)

# Bad: Too aggressive or too lenient
config = SessionConfig(
    rate_limit_per_minute=1000  # Too high
)

config = SessionConfig(
    rate_limit_per_minute=1  # Too low
)
```

### 2. Handle Rate Limits Gracefully

```python
# Good: Inform user and suggest wait time
try:
    response = ai.text.generate(prompt)
except RateLimitError as e:
    return {
        "error": "Rate limit exceeded",
        "retry_after": e.retry_after,
        "message": f"Please wait {e.retry_after} seconds before trying again"
    }

# Bad: Generic error
try:
    response = ai.text.generate(prompt)
except RateLimitError:
    return {"error": "Something went wrong"}  # Unhelpful
```

### 3. Monitor and Adjust

```python
# Good: Monitor rate limit effectiveness
rate_limiter = TokenBucketRateLimiter(requests_per_minute=60)

# Track metrics
metrics = {
    "rate_limit_hits": 0,
    "total_requests": 0
}

def track_rate_limit_hit():
    metrics["rate_limit_hits"] += 1
    hit_rate = metrics["rate_limit_hits"] / metrics["total_requests"]
    
    if hit_rate > 0.1:  # 10% hit rate
        print(f"High rate limit hit rate: {hit_rate:.1%}")
        # Consider increasing limits
```

---

## 📚 Related Documentation

- [💾 Caching System](CACHING.md)
- [⚙️ Configuration System](CONFIGURATION.md)
- [🎓 Performance Tuning](PERFORMANCE.md)
- [🧪 Testing Guide](TESTING.md)
- [🔒 Security Guide](../../SECURITY.md)
