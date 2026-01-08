# 🔗 Connection Pooling Guide

> **Optimize HTTP connections for maximum performance with Blossom AI**

---

## Overview

This guide covers HTTP connection pooling strategies for Blossom AI, including configuration, optimization, and best practices for both sync and async operations.

---

## Why Connection Pooling?

### Without Pooling
```python
# ❌ Inefficient: New connection for each request
for i in range(100):
    client = BlossomClient()  # New connection each time
    result = await client.text.generate(f"Request {i}")
    await client.aclose()  # Connection closed
# Total: 100 connections opened and closed
```

### With Pooling
```python
# ✅ Efficient: Reuse connections
async with BlossomClient() as client:  # Single connection pool
    tasks = [
        client.text.generate(f"Request {i}")
        for i in range(100)
    ]
    results = await asyncio.gather(*tasks)
# Total: 1-5 connections reused 100 times
```

**Benefits:**
- ⚡ **Faster**: No connection handshake overhead
- 💾 **Efficient**: Less system resource usage
- 🚀 **Scalable**: Handle more concurrent requests
- 🔧 **Reliable**: Better error handling and recovery

---

## Basic Configuration

### 1. Sync Connection Pool

```python
from blossom_ai import SessionConfig, BlossomClient

# Configure sync connection pool
config = SessionConfig(
    # Sync pool settings
    sync_pool_connections=10,      # Number of connection pools
    sync_pool_maxsize=20,         # Max connections per pool
    sync_pool_block=True,         # Block when pool is full
    
    # Timeouts
    timeout=30.0,                 # Total request timeout
    sync_timeout_connect=5.0,     # Connection timeout
    sync_timeout_read=25.0        # Read timeout
)

# Use with client
async with BlossomClient(config=config) as client:
    result = await client.text.generate("Hello world")
```

---

### 2. Async Connection Pool

```python
# Configure async connection pool
config = SessionConfig(
    # Async pool settings
    async_limit_total=100,        # Total concurrent connections
    async_limit_per_host=30,      # Per-host connection limit
    async_timeout_connect=2.0,    # Connection timeout
    async_timeout_sock_read=10.0, # Socket read timeout
    
    # Rate limiting
    rate_limit_per_minute=1000    # Rate limit
)

# Async client automatically uses connection pool
async with BlossomClient(config=config) as client:
    tasks = [
        client.text.generate(f"Request {i}")
        for i in range(50)
    ]
    results = await asyncio.gather(*tasks)
```

---

## Advanced Pool Configuration

### 3. Custom HTTP Client with Pooling

```python
from blossom_ai.utils.http_client import HttpxClient
from blossom_ai import SessionConfig
import httpx

class PooledHTTPClient:
    """Custom HTTP client with advanced pooling."""
    
    def __init__(self, config: SessionConfig):
        self.config = config
        self.client = None
    
    def create_client(self) -> HttpxClient:
        """Create HTTP client with optimized pooling."""
        
        # Configure connection limits
        limits = httpx.Limits(
            max_keepalive_connections=self.config.sync_pool_connections,
            max_connections=self.config.sync_pool_maxsize,
            keepalive_expiry=30.0  # Keep connections alive for 30 seconds
        )
        
        # Configure timeouts
        timeouts = httpx.Timeout(
            connect=self.config.sync_timeout_connect,
            read=self.config.sync_timeout_read,
            write=10.0,
            pool=5.0
        )
        
        # Create client
        self.client = HttpxClient(
            config=self.config,
            limits=limits,
            timeout=timeouts,
            http2=True,  # Enable HTTP/2 for multiplexing
            follow_redirects=True
        )
        
        return self.client
    
    async def __aenter__(self):
        """Enter async context."""
        return self.create_client()
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Exit async context."""
        if self.client:
            await self.client.aclose()

# Usage
async def custom_pooled_client():
    """Use custom pooled HTTP client."""
    
    config = SessionConfig(
        sync_pool_connections=20,
        sync_pool_maxsize=50,
        sync_timeout_connect=3.0,
        sync_timeout_read=30.0
    )
    
    async with PooledHTTPClient(config) as http_client:
        # Use with BlossomClient
        async with BlossomClient(http_client=http_client) as client:
            result = await client.text.generate("Hello")
            print(result)
```

---

### 4. Connection Pool Statistics

```python
import asyncio
from typing import Dict, Any
import time

class ConnectionPoolMonitor:
    """Monitor connection pool statistics."""
    
    def __init__(self):
        self.stats = {
            "connections_created": 0,
            "connections_reused": 0,
            "connections_closed": 0,
            "requests_total": 0,
            "requests_failed": 0,
            "pool_size_peak": 0,
            "wait_time_total": 0.0
        }
        self.start_time = time.time()
    
    def record_connection_created(self):
        """Record new connection creation."""
        self.stats["connections_created"] += 1
    
    def record_connection_reused(self):
        """Record connection reuse."""
        self.stats["connections_reused"] += 1
    
    def record_request_start(self):
        """Record request start."""
        self.stats["requests_total"] += 1
    
    def record_request_failed(self):
        """Record failed request."""
        self.stats["requests_failed"] += 1
    
    def get_stats(self) -> Dict[str, Any]:
        """Get current statistics."""
        stats = self.stats.copy()
        stats["uptime_seconds"] = time.time() - self.start_time
        
        if stats["connections_created"] > 0:
            stats["reuse_ratio"] = (
                stats["connections_reused"] / stats["connections_created"]
            )
        
        return stats
    
    def print_stats(self):
        """Print connection pool statistics."""
        stats = self.get_stats()
        
        print("\\n" + "=" * 50)
        print("CONNECTION POOL STATISTICS")
        print("=" * 50)
        print(f"Uptime: {stats['uptime_seconds']:.1f}s")
        print(f"Connections created: {stats['connections_created']}")
        print(f"Connections reused: {stats['connections_reused']}")
        if 'reuse_ratio' in stats:
            print(f"Reuse ratio: {stats['reuse_ratio']:.2f}")
        print(f"Requests total: {stats['requests_total']}")
        print(f"Requests failed: {stats['requests_failed']}")
        print("=" * 50)

# Monitor-enabled client
class MonitoredBlossomClient:
    """Blossom client with connection monitoring."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig()
        self.monitor = ConnectionPoolMonitor()
        self.client = None
    
    async def __aenter__(self):
        """Enter context with monitoring."""
        self.client = BlossomClient(config=self.config)
        await self.client.__aenter__()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Exit context."""
        if self.client:
            await self.client.__aexit__(exc_type, exc_val, exc_tb)
    
    async def generate_text(self, prompt: str, **kwargs) -> str:
        """Generate text with monitoring."""
        
        self.monitor.record_request_start()
        start_time = time.time()
        
        try:
            result = await self.client.text.generate(prompt, **kwargs)
            self.monitor.record_connection_reused()  # Successful reuse
            return result
        except Exception as e:
            self.monitor.record_request_failed()
            raise
        finally:
            self.monitor.stats["wait_time_total"] += time.time() - start_time
    
    def print_connection_stats(self):
        """Print connection statistics."""
        self.monitor.print_stats()

# Usage
async def monitored_requests():
    """Make requests with connection monitoring."""
    
    async with MonitoredBlossomClient() as client:
        # Make multiple requests
        tasks = [
            client.generate_text(f"Request {i}")
            for i in range(20)
        ]
        
        results = await asyncio.gather(*tasks)
        
        # Print statistics
        client.print_connection_stats()
```

---

## Pool Optimization Strategies

### 5. Dynamic Pool Sizing

```python
import asyncio
from typing import Optional
import time

class DynamicPoolManager:
    """Dynamically adjust pool size based on usage."""
    
    def __init__(
        self,
        min_connections: int = 5,
        max_connections: int = 50,
        adjustment_interval: int = 60  # seconds
    ):
        self.min_connections = min_connections
        self.max_connections = max_connections
        self.adjustment_interval = adjustment_interval
        
        self.current_connections = min_connections
        self.request_times = []
        self.last_adjustment = time.time()
    
    def record_request(self, duration: float):
        """Record request duration."""
        self.request_times.append(duration)
        
        # Keep only recent requests (last interval)
        cutoff = time.time() - self.adjustment_interval
        self.request_times = [
            t for t in self.request_times
            if t > cutoff
        ]
    
    def should_adjust_pool(self) -> bool:
        """Check if pool size should be adjusted."""
        return (
            time.time() - self.last_adjustment >
            self.adjustment_interval
        )
    
    def adjust_pool_size(self) -> int:
        """Adjust pool size based on performance."""
        
        if not self.should_adjust_pool():
            return self.current_connections
        
        if len(self.request_times) < 10:
            # Not enough data
            return self.current_connections
        
        # Calculate average response time
        avg_response_time = sum(self.request_times) / len(self.request_times)
        
        # Adjust based on response time
        if avg_response_time > 2.0:  # Slow responses
            # Increase pool size
            new_size = min(
                self.current_connections + 5,
                self.max_connections
            )
            print(f"Increasing pool size: {self.current_connections} → {new_size}")
            self.current_connections = new_size
        
        elif avg_response_time < 0.5:  # Fast responses
            # Decrease pool size
            new_size = max(
                self.current_connections - 2,
                self.min_connections
            )
            if new_size != self.current_connections:
                print(f"Decreasing pool size: {self.current_connections} → {new_size}")
                self.current_connections = new_size
        
        self.last_adjustment = time.time()
        return self.current_connections
    
    def get_config(self) -> SessionConfig:
        """Get current pool configuration."""
        return SessionConfig(
            sync_pool_connections=self.current_connections,
            sync_pool_maxsize=self.current_connections * 2,
            async_limit_total=self.current_connections * 10
        )

# Usage
async def dynamic_pool_example():
    """Use dynamic pool sizing."""
    
    pool_manager = DynamicPoolManager(
        min_connections=5,
        max_connections=30
    )
    
    async with BlossomClient(config=pool_manager.get_config()) as client:
        for i in range(100):
            start_time = time.time()
            
            result = await client.text.generate(f"Request {i}")
            
            duration = time.time() - start_time
            pool_manager.record_request(duration)
            
            # Adjust pool periodically
            if i % 20 == 0:
                new_size = pool_manager.adjust_pool_size()
                print(f"Request {i}: Pool size = {new_size}")
```

---

### 6. Connection Health Checks

```python
import asyncio
from typing import List, Dict, Any
import time

class HealthCheckedPool:
    """Connection pool with health monitoring."""
    
    def __init__(
        self,
        health_check_interval: int = 300,  # 5 minutes
        max_failed_checks: int = 3
    ):
        self.health_check_interval = health_check_interval
        self.max_failed_checks = max_failed_checks
        
        self.connections = {}
        self.failed_checks = {}
        self.last_check = time.time()
    
    async def check_connection_health(self, client) -> bool:
        """Check if a connection is healthy."""
        try:
            # Simple health check - generate a quick response
            start_time = time.time()
            result = await client.text.generate("Health check", max_tokens=10)
            response_time = time.time() - start_time
            
            # Consider healthy if response time < 5 seconds
            is_healthy = (
                result is not None and
                response_time < 5.0
            )
            
            return is_healthy
        
        except Exception:
            return False
    
    async def run_health_checks(self, client):
        """Run health checks on all connections."""
        
        if time.time() - self.last_check < self.health_check_interval:
            return
        
        print("Running connection health checks...")
        
        # Check current connection
        is_healthy = await self.check_connection_health(client)
        connection_id = id(client)
        
        if not is_healthy:
            self.failed_checks[connection_id] = self.failed_checks.get(connection_id, 0) + 1
            
            if self.failed_checks[connection_id] >= self.max_failed_checks:
                print(f"Connection {connection_id} is unhealthy, marking for replacement")
                # In real implementation, would trigger connection replacement
        else:
            # Reset failed count
            self.failed_checks[connection_id] = 0
        
        self.last_check = time.time()
    
    def get_health_report(self) -> Dict[str, Any]:
        """Get health report."""
        return {
            "total_connections": len(self.connections),
            "failed_connections": sum(1 for count in self.failed_checks.values() if count > 0),
            "last_check": self.last_check,
            "failed_checks": self.failed_checks.copy()
        }

# Usage
async def health_checked_requests():
    """Make requests with health checking."""
    
    health_pool = HealthCheckedPool()
    
    async with BlossomClient() as client:
        for i in range(100):
            # Run health checks periodically
            await health_pool.run_health_checks(client)
            
            # Make request
            result = await client.text.generate(f"Request {i}")
            print(f"Request {i}: {result[:30]}...")
            
            # Print health report occasionally
            if i % 25 == 0:
                report = health_pool.get_health_report()
                print(f"Health report: {report}")
```

---

## HTTP/2 Multiplexing

### 7. HTTP/2 Optimization

```python
import httpx
from blossom_ai import SessionConfig
from blossom_ai.utils.http_client import HttpxClient

async def http2_optimization():
    """Use HTTP/2 for better multiplexing."""
    
    # Configure HTTP/2 client
    config = SessionConfig(
        sync_pool_connections=20,
        sync_pool_maxsize=50,
        async_limit_total=200,
        async_limit_per_host=50
    )
    
    # Create HTTP/2 enabled client
    limits = httpx.Limits(
        max_keepalive_connections=20,
        max_connections=100,
        keepalive_expiry=60.0
    )
    
    http_client = HttpxClient(
        config=config,
        limits=limits,
        http2=True,  # Enable HTTP/2
        follow_redirects=True
    )
    
    async with http_client as client:
        # HTTP/2 allows multiple concurrent streams on single connection
        tasks = [
            client.text.generate(f"HTTP/2 request {i}")
            for i in range(100)
        ]
        
        # All requests share the same HTTP/2 connection
        results = await asyncio.gather(*tasks)
        print(f"Made {len(results)} requests over HTTP/2")

# Benefits of HTTP/2:
# - Multiplexing: Multiple requests on single connection
# - Header compression: Reduced overhead
# - Server push: Proactive resource delivery
# - Stream prioritization: Important requests first
```

---

### 8. Connection Warmup

```python
import asyncio
from typing import List

class ConnectionWarmer:
    """Warmup connections for better performance."""
    
    def __init__(self, client):
        self.client = client
        self.warmed_up = False
    
    async def warmup_connections(self, num_connections: int = 5):
        """Warmup multiple connections."""
        
        if self.warmed_up:
            return
        
        print(f"Warming up {num_connections} connections...")
        
        # Create warmup tasks
        warmup_tasks = [
            self._warmup_single_connection()
            for _ in range(num_connections)
        ]
        
        # Execute warmup concurrently
        await asyncio.gather(*warmup_tasks)
        
        self.warmed_up = True
        print("Connection warmup complete")
    
    async def _warmup_single_connection(self):
        """Warmup a single connection."""
        
        # Quick request to establish connection
        start_time = time.time()
        result = await self.client.text.generate(
            "Warmup",
            max_tokens=5
        )
        elapsed = time.time() - start_time
        
        print(f"Connection warmup: {elapsed:.2f}s")
    
    async def ensure_warmup(self, num_connections: int = 5):
        """Ensure connections are warmed up."""
        if not self.warmed_up:
            await self.warmup_connections(num_connections)

# Usage
async def warmup_example():
    """Example of connection warmup."""
    
    async with BlossomClient() as client:
        warmer = ConnectionWarmer(client)
        
        # Warmup connections before main processing
        await warmer.warmup_connections(num_connections=3)
        
        # Now connections are ready for high-throughput processing
        tasks = [
            client.text.generate(f"Fast request {i}")
            for i in range(50)
        ]
        
        results = await asyncio.gather(*tasks)
        print(f"Processed {len(results)} requests quickly")
```

---

## Load Balancing and Failover

### 9. Multi-Region Connection Pooling

```python
import asyncio
from typing import List, Dict, Any
import random

class MultiRegionPool:
    """Connection pooling across multiple regions."""
    
    def __init__(self, regions: List[str]):
        self.regions = regions
        self.region_pools = {}
        self.region_health = {region: True for region in regions}
        
        for region in regions:
            # Create region-specific configuration
            config = SessionConfig(
                sync_pool_connections=10,
                sync_pool_maxsize=20,
                # Add region-specific settings
            )
            self.region_pools[region] = config
    
    def get_healthy_regions(self) -> List[str]:
        """Get list of healthy regions."""
        return [region for region, healthy in self.region_health.items() if healthy]
    
    def select_region(self, strategy: str = "round_robin") -> str:
        """Select region based on strategy."""
        
        healthy_regions = self.get_healthy_regions()
        
        if not healthy_regions:
            raise Exception("No healthy regions available")
        
        if strategy == "round_robin":
            # Simple round-robin (in real implementation, track last used)
            return healthy_regions[0]
        
        elif strategy == "random":
            return random.choice(healthy_regions)
        
        elif strategy == "primary_backup":
            # First healthy region as primary
            return healthy_regions[0]
        
        else:
            return healthy_regions[0]
    
    async def make_request(
        self,
        prompt: str,
        region_strategy: str = "round_robin",
        max_retries: int = 3
    ) -> str:
        """Make request with region failover."""
        
        for attempt in range(max_retries):
            try:
                # Select region
                region = self.select_region(region_strategy)
                config = self.region_pools[region]
                
                # Make request
                async with BlossomClient(config=config) as client:
                    result = await client.text.generate(prompt)
                    return result
            
            except Exception as e:
                print(f"Request failed for region {region}: {e}")
                
                # Mark region as unhealthy
                self.region_health[region] = False
                
                # If no more regions, raise
                if len(self.get_healthy_regions()) == 0:
                    raise Exception("All regions failed")
                
                # Wait before retry
                await asyncio.sleep(0.5 * (attempt + 1))
        
        raise Exception("All retry attempts failed")
    
    async def health_check(self):
        """Periodic health check for all regions."""
        
        for region in self.regions:
            try:
                config = self.region_pools[region]
                async with BlossomClient(config=config) as client:
                    await client.text.generate("Health check", max_tokens=5)
                    self.region_health[region] = True
                    print(f"Region {region}: Healthy")
            
            except Exception as e:
                self.region_health[region] = False
                print(f"Region {region}: Unhealthy - {e}")

# Usage
async def multi_region_example():
    """Example of multi-region connection pooling."""
    
    regions = ["us-east", "us-west", "eu-west"]
    pool = MultiRegionPool(regions)
    
    # Run health check
    await pool.health_check()
    
    # Make requests with automatic failover
    for i in range(10):
        try:
            result = await pool.make_request(
                f"Request {i}",
                region_strategy="primary_backup"
            )
            print(f"Request {i}: Success")
        except Exception as e:
            print(f"Request {i}: Failed - {e}")
```

---

### 10. Circuit Breaker with Pooling

```python
import asyncio
from enum import Enum
from datetime import datetime, timedelta
from typing import Optional, Callable, Any

class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

class PooledCircuitBreaker:
    """Circuit breaker integrated with connection pooling."""
    
    def __init__(
        self,
        failure_threshold: int = 5,
        timeout: float = 30.0,
        reset_timeout: float = 60.0,
        pool_size: int = 10
    ):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.reset_timeout = reset_timeout
        self.pool_size = pool_size
        
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = None
        self.success_count = 0
    
    async def __call__(self, func: Callable, *args, **kwargs) -> Any:
        """Execute function with circuit breaker protection."""
        
        if self.state == CircuitState.OPEN:
            if self._should_attempt_reset():
                self.state = CircuitState.HALF_OPEN
                print("Circuit breaker: Attempting reset (HALF_OPEN)")
            else:
                raise Exception("Circuit breaker is OPEN")
        
        try:
            # Execute with timeout
            result = await asyncio.wait_for(
                func(*args, **kwargs),
                timeout=self.timeout
            )
            
            # Success - handle state transition
            self._record_success()
            return result
            
        except asyncio.TimeoutError:
            self._record_failure()
            raise Exception("Request timeout")
            
        except Exception as e:
            self._record_failure()
            
            if self.failure_count >= self.failure_threshold:
                self.state = CircuitState.OPEN
                self.last_failure_time = datetime.now()
                print(f"Circuit breaker: OPEN due to {self.failure_count} failures")
            
            raise
    
    def _should_attempt_reset(self) -> bool:
        """Check if should attempt to reset circuit breaker."""
        if not self.last_failure_time:
            return False
        
        return datetime.now() - self.last_failure_time >= timedelta(
            seconds=self.reset_timeout
        )
    
    def _record_success(self):
        """Record successful execution."""
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            
            # Reset if we have enough successes
            if self.success_count >= 3:
                self._reset()
                print("Circuit breaker: Reset to CLOSED")
        
        elif self.state == CircuitState.CLOSED:
            # Reset failure count on success
            self.failure_count = 0
    
    def _record_failure(self):
        """Record failed execution."""
        self.failure_count += 1
        self.last_failure_time = datetime.now()
        
        if self.state == CircuitState.HALF_OPEN:
            # Failed in half-open state, go back to open
            self.state = CircuitState.OPEN
            print("Circuit breaker: Failed in HALF_OPEN, returning to OPEN")
    
    def _reset(self):
        """Reset circuit breaker."""
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = None
        self.success_count = 0
    
    def get_state(self) -> CircuitState:
        """Get current circuit breaker state."""
        return self.state

# Usage
async def circuit_breaker_example():
    """Example of circuit breaker with pooling."""
    
    circuit_breaker = PooledCircuitBreaker(
        failure_threshold=3,
        timeout=10.0,
        reset_timeout=30.0,
        pool_size=10
    )
    
    async with BlossomClient() as client:
        for i in range(20):
            try:
                result = await circuit_breaker(
                    client.text.generate,
                    f"Circuit breaker request {i}"
                )
                print(f"Request {i}: Success - {circuit_breaker.get_state().value}")
            
            except Exception as e:
                print(f"Request {i}: Failed - {e} - {circuit_breaker.get_state().value}")
            
            await asyncio.sleep(1)
```

---

## Performance Optimization

### 11. Connection Pool Tuning

```python
import asyncio
import time
from typing import List, Dict, Any

class PoolOptimizer:
    """Optimize connection pool settings based on workload."""
    
    def __init__(self):
        self.metrics = {
            "request_times": [],
            "concurrent_requests": [],
            "pool_utilization": []
        }
    
    def record_request(self, duration: float, concurrent: int):
        """Record request metrics."""
        self.metrics["request_times"].append(duration)
        self.metrics["concurrent_requests"].append(concurrent)
        
        # Keep only recent metrics (last 1000)
        for key in self.metrics:
            if len(self.metrics[key]) > 1000:
                self.metrics[key] = self.metrics[key][-1000:]
    
    def analyze_workload(self) -> Dict[str, Any]:
        """Analyze current workload patterns."""
        
        if not self.metrics["request_times"]:
            return {}
        
        # Calculate statistics
        avg_response_time = sum(self.metrics["request_times"]) / len(self.metrics["request_times"])
        max_concurrent = max(self.metrics["concurrent_requests"])
        avg_concurrent = sum(self.metrics["concurrent_requests"]) / len(self.metrics["concurrent_requests"])
        
        # Recommend pool sizes
        recommended_pool_size = int(avg_concurrent * 1.5)  # 50% buffer
        recommended_pool_size = max(5, min(50, recommended_pool_size))
        
        return {
            "avg_response_time": avg_response_time,
            "max_concurrent": max_concurrent,
            "avg_concurrent": avg_concurrent,
            "recommended_pool_size": recommended_pool_size,
            "current_metrics_count": len(self.metrics["request_times"])
        }
    
    def get_optimal_config(self) -> SessionConfig:
        """Get optimal configuration based on analysis."""
        
        analysis = self.analyze_workload()
        
        if not analysis:
            # Default configuration
            return SessionConfig(
                sync_pool_connections=10,
                sync_pool_maxsize=20,
                async_limit_total=100
            )
        
        pool_size = analysis["recommended_pool_size"]
        
        return SessionConfig(
            sync_pool_connections=pool_size,
            sync_pool_maxsize=pool_size * 2,
            async_limit_total=pool_size * 10,
            async_limit_per_host=pool_size * 3
        )
    
    def print_analysis(self):
        """Print workload analysis."""
        analysis = self.analyze_workload()
        
        if not analysis:
            print("No metrics available for analysis")
            return
        
        print("\\n" + "=" * 50)
        print("POOL OPTIMIZATION ANALYSIS")
        print("=" * 50)
        print(f"Average response time: {analysis['avg_response_time']:.2f}s")
        print(f"Max concurrent requests: {analysis['max_concurrent']}")
        print(f"Average concurrent requests: {analysis['avg_concurrent']:.1f}")
        print(f"Recommended pool size: {analysis['recommended_pool_size']}")
        print(f"Metrics collected: {analysis['current_metrics_count']}")
        print("=" * 50)

# Usage
async def optimized_pool_example():
    """Example of pool optimization."""
    
    optimizer = PoolOptimizer()
    concurrent_requests = 0
    
    async with BlossomClient() as client:
        # Simulate varying workload
        for batch_size in [5, 10, 20, 15, 8]:
            tasks = []
            
            for i in range(batch_size):
                concurrent_requests += 1
                
                async def make_request(idx: int):
                    nonlocal concurrent_requests
                    start_time = time.time()
                    
                    result = await client.text.generate(f"Request {idx}")
                    
                    duration = time.time() - start_time
                    optimizer.record_request(duration, concurrent_requests)
                    
                    concurrent_requests -= 1
                    return result
                
                tasks.append(make_request(i))
            
            await asyncio.gather(*tasks)
            
            # Print analysis periodically
            optimizer.print_analysis()
            
            # Update configuration based on analysis
            optimal_config = optimizer.get_optimal_config()
            print(f"Optimal pool size: {optimal_config.sync_pool_connections}")
```

---

## Best Practices

### 12. Connection Pool Best Practices

```python
# ✅ DO: Reuse client instances
async def good_practice():
    async with BlossomClient() as client:
        # All requests share the same pool
        for i in range(100):
            result = await client.text.generate(f"Request {i}")

# ❌ DON'T: Create multiple clients
async def bad_practice():
    for i in range(100):
        async with BlossomClient() as client:  # New pool each time
            result = await client.text.generate(f"Request {i}")

# ✅ DO: Configure appropriate pool sizes
config = SessionConfig(
    sync_pool_connections=20,      # Based on expected load
    sync_pool_maxsize=40,         # 2x connections for burst
    async_limit_total=200,        # High concurrency support
    async_limit_per_host=50       # Per-host limits
)

# ❌ DON'T: Use default pool sizes for high-load applications
config = SessionConfig()  # Default settings may be too low
```

---

### 13. Pool Configuration Guidelines

```python
# High-throughput application
high_throughput_config = SessionConfig(
    sync_pool_connections=50,      # Many connections
    sync_pool_maxsize=100,        # Handle bursts
    async_limit_total=1000,       # High concurrency
    async_limit_per_host=100,     # Per-host limits
    sync_timeout_connect=2.0,     # Fast connection
    sync_timeout_read=30.0,       # Allow slow responses
    rate_limit_per_minute=50000   # High rate limit
)

# Low-latency application
low_latency_config = SessionConfig(
    sync_pool_connections=10,      # Fewer connections
    sync_pool_maxsize=20,         # Minimal pooling
    async_limit_total=100,        # Moderate concurrency
    async_limit_per_host=30,      # Standard limits
    sync_timeout_connect=1.0,     # Very fast connection
    sync_timeout_read=5.0,        # Quick responses only
    rate_limit_per_minute=10000   # Conservative rate limit
)

# Batch processing
batch_config = SessionConfig(
    sync_pool_connections=5,       # Minimal connections
    sync_pool_maxsize=10,         # Small pool
    async_limit_total=50,         # Limited concurrency
    async_limit_per_host=10,      # Conservative limits
    sync_timeout_connect=5.0,     # Allow slow connections
    sync_timeout_read=120.0,      # Long read timeout
    rate_limit_per_minute=2000    # Low rate limit
)
```

---

## Troubleshooting

### 14. Common Pool Issues

```python
# Debug connection pool issues
async def debug_pool_issues():
    """Debug common connection pool problems."""
    
    config = SessionConfig(
        sync_pool_connections=10,
        sync_pool_maxsize=20,
        log_level="DEBUG",  # Enable debug logging
        log_requests=True   # Log all requests
    )
    
    async with BlossomClient(config=config) as client:
        # Monitor pool statistics
        print(f"Pool connections: {config.sync_pool_connections}")
        print(f"Pool max size: {config.sync_pool_maxsize}")
        
        # Make requests and monitor
        for i in range(50):
            start_time = time.time()
            result = await client.text.generate(f"Request {i}")
            elapsed = time.time() - start_time
            
            if elapsed > 5.0:  # Slow request
                print(f"Slow request {i}: {elapsed:.2f}s")
```

---

### 15. Pool Statistics Monitoring

```python
import asyncio
import time
from typing import Dict, Any

class PoolStatistics:
    """Monitor detailed pool statistics."""
    
    def __init__(self):
        self.stats = {
            "connections_created": 0,
            "connections_reused": 0,
            "connections_closed": 0,
            "requests_total": 0,
            "requests_failed": 0,
            "pool_wait_time": [],
            "request_duration": []
        }
    
    def record_connection_created(self):
        """Record new connection."""
        self.stats["connections_created"] += 1
    
    def record_connection_reused(self):
        """Record reused connection."""
        self.stats["connections_reused"] += 1
    
    def record_request(self, duration: float, wait_time: float = 0):
        """Record request metrics."""
        self.stats["requests_total"] += 1
        self.stats["request_duration"].append(duration)
        self.stats["pool_wait_time"].append(wait_time)
    
    def get_summary(self) -> Dict[str, Any]:
        """Get summary statistics."""
        
        durations = self.stats["request_duration"]
        wait_times = self.stats["pool_wait_time"]
        
        return {
            "connections_created": self.stats["connections_created"],
            "connections_reused": self.stats["connections_reused"],
            "reuse_ratio": (
                self.stats["connections_reused"] / max(self.stats["connections_created"], 1)
            ),
            "requests_total": self.stats["requests_total"],
            "avg_request_duration": sum(durations) / len(durations) if durations else 0,
            "avg_wait_time": sum(wait_times) / len(wait_times) if wait_times else 0,
            "max_wait_time": max(wait_times) if wait_times else 0
        }

# Usage
async def monitored_high_volume():
    """Monitor high-volume requests."""
    
    stats = PoolStatistics()
    
    async with BlossomClient() as client:
        # Make many concurrent requests
        semaphore = asyncio.Semaphore(20)  # Limit concurrency
        
        async def make_request(idx: int):
            async with semaphore:
                start_time = time.time()
                
                result = await client.text.generate(f"Request {idx}")
                
                duration = time.time() - start_time
                stats.record_request(duration)
                
                return result
        
        tasks = [make_request(i) for i in range(100)]
        results = await asyncio.gather(*tasks)
    
    # Print statistics
    summary = stats.get_summary()
    print("\\nPool Statistics:")
    for key, value in summary.items():
        print(f"  {key}: {value}")
```

---

## Summary

Key connection pooling strategies for Blossom AI:

1. **Always reuse clients**: Use context managers for automatic pooling
2. **Configure appropriate pool sizes**: Based on expected load
3. **Monitor pool statistics**: Track connection reuse and performance
4. **Use HTTP/2**: Enable multiplexing for better performance
5. **Implement health checks**: Monitor connection health
6. **Dynamic pool sizing**: Adjust based on workload
7. **Circuit breakers**: Protect against cascading failures
8. **Multi-region pooling**: Distribute load across regions
9. **Warmup connections**: Pre-establish connections for better performance
10. **Monitor and tune**: Continuously optimize pool configuration

---

## See Also

- [Performance Guide](PERFORMANCE.md) - Performance optimization techniques
- [Async Patterns](ASYNC_PATTERNS.md) - Async/await best practices
- [Memory Management](MEMORY.md) - Managing memory efficiently
- [Error Handling](ERROR_TYPES.md) - Handling connection errors
- [Docker Guide](DOCKER.md) - Container networking considerations