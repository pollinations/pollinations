# 👤 Singleton Pattern Guide

> **Implementing and using the Singleton pattern in Blossom AI**

---

## Overview

The Singleton pattern ensures a class has only one instance and provides global access to it. Blossom AI uses this pattern for shared resources like configuration, logging, and connection pools.

---

## When to Use Singleton Pattern

| Use Case | Example |
|----------|---------|
| **Shared resources** | Configuration objects |
| **Global state** | Rate limiter state |
| **Connection pools** | HTTP client pools |
| **Logging** | Centralized logging |
| **Caching** | Global cache instances |
| **Resource management** | API key management |

---

## Built-in Singletons

### Configuration Singleton

```python
from blossom_ai import SessionConfig

# Configuration is effectively a singleton within a client
config = SessionConfig(
    api_key="your-key",
    timeout=30.0
)

# Same config used throughout client lifecycle
client = BlossomClient(config=config)
```

---

### Logger Singleton

```python
from blossom_ai.utils.logging import get_logger

# Logger is a singleton - same instance everywhere
logger = get_logger("blossom_ai")

# Subsequent calls return same instance
same_logger = get_logger("blossom_ai")
assert logger is same_logger
```

---

## Creating Singletons

### Thread-Safe Singleton

```python
import threading
from typing import Optional

class SingletonMeta(type):
    """Metaclass for creating thread-safe singletons."""
    
    _instances: dict = {}
    _lock: threading.Lock = threading.Lock()
    
    def __call__(cls, *args, **kwargs):
        """Override __call__ to control instance creation."""
        
        # First check (fast path)
        if cls not in cls._instances:
            with cls._lock:
                # Second check (thread-safe)
                if cls not in cls._instances:
                    instance = super().__call__(*args, **kwargs)
                    cls._instances[cls] = instance
        
        return cls._instances[cls]

class ConfigurationManager(metaclass=SingletonMeta):
    """Thread-safe configuration singleton."""
    
    def __init__(self):
        if hasattr(self, '_initialized'):
            return
        
        self._initialized = True
        self.config = {}
        self._lock = threading.Lock()
    
    def set_config(self, key: str, value: Any):
        """Set configuration value."""
        with self._lock:
            self.config[key] = value
    
    def get_config(self, key: str, default: Any = None) -> Any:
        """Get configuration value."""
        with self._lock:
            return self.config.get(key, default)
    
    def update_config(self, updates: Dict[str, Any]):
        """Update multiple configuration values."""
        with self._lock:
            self.config.update(updates)
    
    def clear_config(self):
        """Clear all configuration."""
        with self._lock:
            self.config.clear()

# Usage
def test_configuration_singleton():
    """Test that ConfigurationManager is truly a singleton."""
    
    # Create multiple instances
    config1 = ConfigurationManager()
    config2 = ConfigurationManager()
    
    # Should be the same instance
    assert config1 is config2
    
    # Modify through one instance
    config1.set_config("api_key", "secret123")
    
    # Changes visible through other instance
    assert config2.get_config("api_key") == "secret123"
    
    print("✅ Singleton pattern working correctly")

# Run test
test_configuration_singleton()
```

---

### Decorator-Based Singleton

```python
def singleton(cls):
    """Decorator for creating singleton classes."""
    
    instances = {}
    lock = threading.Lock()
    
    def get_instance(*args, **kwargs):
        if cls not in instances:
            with lock:
                if cls not in instances:
                    instances[cls] = cls(*args, **kwargs)
        return instances[cls]
    
    # Copy class metadata
    get_instance.__name__ = cls.__name__
    get_instance.__doc__ = cls.__doc__
    
    return get_instance

@singleton
class RateLimiterManager:
    """Singleton rate limiter manager."""
    
    def __init__(self):
        self.limiters: Dict[str, Any] = {}
        self._lock = threading.Lock()
    
    def get_limiter(self, key: str) -> Any:
        """Get or create rate limiter for key."""
        with self._lock:
            if key not in self.limiters:
                from blossom_ai.utils.rate_limiter import TokenBucketRateLimiter
                self.limiters[key] = TokenBucketRateLimiter(requests_per_minute=60)
            
            return self.limiters[key]
    
    def remove_limiter(self, key: str):
        """Remove rate limiter for key."""
        with self._lock:
            if key in self.limiters:
                del self.limiters[key]
    
    def clear_all(self):
        """Clear all rate limiters."""
        with self._lock:
            self.limiters.clear()

# Usage
def test_rate_limiter_singleton():
    """Test rate limiter singleton."""
    
    # Create multiple instances
    manager1 = RateLimiterManager()
    manager2 = RateLimiterManager()
    
    # Same instance
    assert manager1 is manager2
    
    # Get limiter
    limiter1 = manager1.get_limiter("user1")
    limiter2 = manager2.get_limiter("user1")
    
    # Same limiter
    assert limiter1 is limiter2
    
    print("✅ Rate limiter singleton working")

test_rate_limiter_singleton()
```

---

### Module-Based Singleton

```python
# cache_manager.py
import threading
from typing import Dict, Any, Optional

class _CacheManager:
    """Internal cache manager implementation."""
    
    def __init__(self):
        self._cache: Dict[str, Any] = {}
        self._lock = threading.Lock()
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        with self._lock:
            return self._cache.get(key)
    
    def set(self, key: str, value: Any) -> None:
        """Set value in cache."""
        with self._lock:
            self._cache[key] = value
    
    def clear(self) -> None:
        """Clear all cached data."""
        with self._lock:
            self._cache.clear()
    
    def get_stats(self) -> Dict[str, int]:
        """Get cache statistics."""
        with self._lock:
            return {
                "size": len(self._cache),
                "keys": list(self._cache.keys())
            }

# Singleton instance
_cache_manager = _CacheManager()

# Public API
def get_cache_manager() -> _CacheManager:
    """Get the singleton cache manager instance."""
    return _cache_manager

def get_cache_stats() -> Dict[str, int]:
    """Get cache statistics."""
    return _cache_manager.get_stats()

def clear_cache():
    """Clear all cached data."""
    _cache_manager.clear()

# Usage
def test_module_singleton():
    """Test module-based singleton."""
    
    # Get manager
    manager1 = get_cache_manager()
    manager2 = get_cache_manager()
    
    # Same instance
    assert manager1 is manager2
    
    # Use cache
    manager1.set("key1", "value1")
    value = manager2.get("key1")
    
    assert value == "value1"
    
    # Check stats
    stats = get_cache_stats()
    assert stats["size"] == 1
    
    print("✅ Module singleton working")

test_module_singleton()
```

---

## Advanced Singleton Patterns

### Singleton with Lazy Initialization

```python
class LazySingleton:
    """Singleton with lazy initialization."""
    
    _instance: Optional["LazySingleton"] = None
    _lock = threading.Lock()
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        # Ensure __init__ is called only once
        if not LazySingleton._initialized:
            self.http_client = None
            self.logger = None
            self.config = {}
            LazySingleton._initialized = True
    
    def initialize(self, config: Dict[str, Any]):
        """Initialize with configuration (called once)."""
        if not self.http_client:  # Only initialize once
            from blossom_ai.utils.http_client import HttpxClient
            from blossom_ai.utils.logging import StructuredLogger
            
            self.config = config
            self.http_client = HttpxClient(config)
            self.logger = StructuredLogger("singleton")
    
    def is_initialized(self) -> bool:
        """Check if singleton is initialized."""
        return self.http_client is not None
    
    def get_http_client(self):
        """Get HTTP client."""
        if not self.is_initialized():
            raise RuntimeError("Singleton not initialized")
        return self.http_client
    
    def get_logger(self):
        """Get logger."""
        if not self.is_initialized():
            raise RuntimeError("Singleton not initialized")
        return self.logger

# Usage
def test_lazy_singleton():
    """Test lazy singleton initialization."""
    
    # Create instance (not initialized yet)
    singleton1 = LazySingleton()
    singleton2 = LazySingleton()
    
    # Same instance
    assert singleton1 is singleton2
    
    # Not initialized
    assert not singleton1.is_initialized()
    
    # Initialize
    singleton1.initialize({"timeout": 30.0})
    
    # Now initialized
    assert singleton1.is_initialized()
    assert singleton2.is_initialized()  # Both see the same state
    
    # Get components
    client = singleton1.get_http_client()
    logger = singleton2.get_logger()
    
    assert client is singleton2.get_http_client()
    assert logger is singleton1.get_logger()
    
    print("✅ Lazy singleton working")

test_lazy_singleton()
```

---

### Singleton with Configuration

```python
class ConfigurableSingleton:
    """Singleton that can be configured."""
    
    _instance: Optional["ConfigurableSingleton"] = None
    _lock = threading.Lock()
    _config_lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if not self._initialized:
            self.config = {}
            self.observers = []
            self._initialized = True
    
    def configure(self, config: Dict[str, Any]):
        """Update configuration."""
        with self._config_lock:
            old_config = self.config.copy()
            self.config.update(config)
            
            # Notify observers of changes
            for observer in self.observers:
                observer.on_config_change(self.config, old_config)
    
    def get_config(self, key: str = None) -> Any:
        """Get configuration value."""
        with self._config_lock:
            if key:
                return self.config.get(key)
            return self.config.copy()
    
    def add_observer(self, observer):
        """Add configuration observer."""
        self.observers.append(observer)
    
    def remove_observer(self, observer):
        """Remove configuration observer."""
        if observer in self.observers:
            self.observers.remove(observer)

class ConfigObserver:
    """Observer for configuration changes."""
    
    def on_config_change(self, new_config: Dict, old_config: Dict):
        """Handle configuration change."""
        print(f"Config changed: {old_config} -> {new_config}")

# Usage
def test_configurable_singleton():
    """Test configurable singleton."""
    
    # Create singleton
    config1 = ConfigurableSingleton()
    config2 = ConfigurableSingleton()
    
    # Same instance
    assert config1 is config2
    
    # Add observer
    observer = ConfigObserver()
    config1.add_observer(observer)
    
    # Configure
    config1.configure({"api_key": "key1", "timeout": 30.0})
    
    # Both instances see same config
    assert config2.get_config("api_key") == "key1"
    assert config2.get_config("timeout") == 30.0
    
    # Update config
    config2.configure({"timeout": 60.0})
    
    # Both see the update
    assert config1.get_config("timeout") == 60.0
    
    print("✅ Configurable singleton working")

test_configurable_singleton()
```

---

### Singleton Pool

```python
class SingletonPool:
    """Pool of singleton instances."""
    
    _pools: Dict[str, Any] = {}
    _lock = threading.Lock()
    
    @classmethod
    def get_instance(
        cls,
        key: str,
        factory: Callable[[], Any]
    ) -> Any:
        """Get or create singleton instance for key."""
        
        if key not in cls._pools:
            with cls._lock:
                if key not in cls._pools:
                    cls._pools[key] = factory()
        
        return cls._pools[key]
    
    @classmethod
    def clear_pool(cls, key: str = None):
        """Clear pool or specific instance."""
        if key:
            if key in cls._pools:
                del cls._pools[key]
        else:
            cls._pools.clear()
    
    @classmethod
    def get_pool_stats(cls) -> Dict[str, int]:
        """Get pool statistics."""
        return {
            "total_instances": len(cls._pools),
            "keys": list(cls._pools.keys())
        }

# Usage
def test_singleton_pool():
    """Test singleton pool."""
    
    # Create different rate limiters
    limiter1 = SingletonPool.get_instance(
        "user1",
        lambda: TokenBucketRateLimiter(requests_per_minute=60)
    )
    
    limiter2 = SingletonPool.get_instance(
        "user2",
        lambda: TokenBucketRateLimiter(requests_per_minute=100)
    )
    
    # Same instance for same key
    limiter1_again = SingletonPool.get_instance(
        "user1",
        lambda: TokenBucketRateLimiter(requests_per_minute=999)
    )
    
    assert limiter1 is limiter1_again
    assert limiter1 is not limiter2
    
    # Check stats
    stats = SingletonPool.get_pool_stats()
    assert stats["total_instances"] == 2
    
    print("✅ Singleton pool working")

test_singleton_pool()
```

---

## Testing Singletons

### Unit Testing

```python
import pytest
import threading
import time

class TestSingletonPatterns:
    """Test various singleton implementations."""
    
    def test_metaclass_singleton(self):
        """Test metaclass-based singleton."""
        
        # Create instances
        instance1 = ConfigurationManager()
        instance2 = ConfigurationManager()
        
        # Same instance
        assert instance1 is instance2
        
        # Shared state
        instance1.set_config("test_key", "test_value")
        assert instance2.get_config("test_key") == "test_value"
    
    def test_decorator_singleton(self):
        """Test decorator-based singleton."""
        
        # Create instances
        manager1 = RateLimiterManager()
        manager2 = RateLimiterManager()
        
        # Same instance
        assert manager1 is manager2
        
        # Shared state
        limiter1 = manager1.get_limiter("test")
        limiter2 = manager2.get_limiter("test")
        
        assert limiter1 is limiter2
    
    def test_module_singleton(self):
        """Test module-based singleton."""
        
        # Get manager multiple times
        manager1 = get_cache_manager()
        manager2 = get_cache_manager()
        
        # Same instance
        assert manager1 is manager2
        
        # Shared state
        manager1.set("key", "value")
        assert manager2.get("key") == "value"
    
    def test_lazy_singleton(self):
        """Test lazy singleton initialization."""
        
        # Create instance
        singleton1 = LazySingleton()
        singleton2 = LazySingleton()
        
        # Same instance
        assert singleton1 is singleton2
        
        # Not initialized initially
        assert not singleton1.is_initialized()
        
        # Initialize
        singleton1.initialize({"test": "config"})
        
        # Both see initialization
        assert singleton1.is_initialized()
        assert singleton2.is_initialized()
    
    def test_thread_safety(self):
        """Test thread safety of singleton."""
        
        instances = []
        
        def create_instance():
            instance = ConfigurationManager()
            instances.append(instance)
        
        # Create threads
        threads = [threading.Thread(target=create_instance) for _ in range(10)]
        
        # Start threads
        for thread in threads:
            thread.start()
        
        # Wait for completion
        for thread in threads:
            thread.join()
        
        # All should be the same instance
        first_instance = instances[0]
        for instance in instances[1:]:
            assert instance is first_instance

@pytest.mark.asyncio
async def test_async_singleton_usage():
    """Test singleton in async context."""
    
    # Get singleton
    config_manager = ConfigurationManager()
    
    # Use in async function
    async def async_task(task_id: int):
        config_manager.set_config(f"task_{task_id}", f"value_{task_id}")
        return config_manager.get_config(f"task_{task_id}")
    
    # Run multiple async tasks
    tasks = [async_task(i) for i in range(10)]
    results = await asyncio.gather(*tasks)
    
    # All tasks should see the same singleton
    assert all(f"value_{i}" in results for i in range(10))
```

---

### Integration Testing

```python
@pytest.mark.asyncio
async def test_singleton_with_client():
    """Test singleton integration with BlossomClient."""
    
    from blossom_ai import BlossomClient, SessionConfig
    
    # Use singleton configuration
    config_manager = ConfigurationManager()
    config_manager.update_config({
        "timeout": 30.0,
        "max_retries": 3
    })
    
    # Create client with singleton config
    config = SessionConfig(**config_manager.get_config())
    
    async with BlossomClient(config=config) as client:
        # Modify singleton config during operation
        config_manager.set_config("log_level", "DEBUG")
        
        # Singleton maintains shared state
        assert config_manager.get_config("timeout") == 30.0
        assert config_manager.get_config("max_retries") == 3
        assert config_manager.get_config("log_level") == "DEBUG"
```

---

## Best Practices

### 1. Use Singletons Sparingly

```python
# Good: Only for truly shared resources
class DatabaseConnectionPool:
    """Shared database connection pool."""
    pass

# Bad: Overusing singletons
class UserService:
    """Should not be singleton - creates tight coupling."""
    pass
```

---

### 2. Prefer Dependency Injection

```python
# Good: Dependency injection
class GoodService:
    def __init__(self, config_manager: ConfigurationManager):
        self.config = config_manager

# Bad: Direct singleton access
class BadService:
    def __init__(self):
        self.config = ConfigurationManager()  # Hard to test
```

---

### 3. Make Singletons Thread-Safe

```python
class ThreadSafeSingleton:
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
```

---

### 4. Consider Alternatives

```python
# Alternative 1: Module-level variables
# my_module.py
shared_config = {}

# Alternative 2: Factory pattern
class ConfigFactory:
    _instances = {}
    
    @classmethod
    def get_config(cls, name):
        if name not in cls._instances:
            cls._instances[name] = Config()
        return cls._instances[name]

# Alternative 3: Dependency injection container
class Container:
    def __init__(self):
        self._services = {}
    
    def register(self, name, factory):
        self._services[name] = factory()
    
    def get(self, name):
        return self._services[name]
```

---

### 5. Document Singleton Usage

```python
class DocumentedSingleton:
    """
    Global configuration manager.
    
    This is a singleton - only one instance exists.
    Use get_instance() to access it.
    
    Example:
        >>> config = DocumentedSingleton.get_instance()
        >>> config.set("key", "value")
    
    Thread-safe and lazily initialized.
    """
    
    @classmethod
    def get_instance(cls):
        """Get singleton instance."""
        pass
```

---

### 6. Test Singleton Behavior

```python
def test_singleton_behavior():
    """Test that class behaves as singleton."""
    
    # Multiple creations should return same instance
    instances = [SingletonClass() for _ in range(10)]
    assert all(instance is instances[0] for instance in instances)
    
    # Shared state
    instances[0].set_state("test")
    assert instances[1].get_state() == "test"
```

---

## See Also

- [Factory Pattern](FACTORY_PATTERN.md) - Object creation
- [Builder Pattern](BUILDER_PATTERN.md) - Complex configurations
- [Strategy Pattern](STRATEGY_PATTERN.md) - Algorithm selection
- [Custom Components](CUSTOM_COMPONENTS.md) - Creating custom implementations
- [Architecture Overview](ARCHITECTURE.md) - Design principles