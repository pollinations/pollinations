# 🔌 Protocol Interfaces

> **Design clean, testable code with Python Protocol interfaces**

---

## 📋 Table of Contents

- [Protocol Basics](#protocol-basics)
- [Defining Protocols](#defining-protocols)
- [Implementing Protocols](#implementing-protocols)
- [Protocol vs ABC](#protocol-vs-abc)
- [Advanced Protocol Patterns](#advanced-protocol-patterns)
- [Testing with Protocols](#testing-with-protocols)

---

## 🚀 Quick Start

### Basic Protocol Definition

```python
from typing import Protocol, runtime_checkable
from dataclasses import dataclass
import asyncio

# Define a protocol (interface)
class HTTPClientProtocol(Protocol):
    """Protocol for HTTP client operations"""
    
    async def get(self, url: str, **kwargs) -> bytes:
        """Make HTTP GET request"""
        ...
    
    async def post(self, url: str, data: bytes = None, **kwargs) -> bytes:
        """Make HTTP POST request"""
        ...
    
    async def close(self) -> None:
        """Close the HTTP client"""
        ...

# Implement the protocol
@dataclass
class HttpxClient:
    """Concrete implementation using httpx"""
    
    timeout: float = 30.0
    max_connections: int = 100
    
    def __post_init__(self):
        import httpx
        self._client = httpx.AsyncClient(
            timeout=self.timeout,
            limits=httpx.Limits(max_connections=self.max_connections)
        )
    
    async def get(self, url: str, **kwargs) -> bytes:
        response = await self._client.get(url, **kwargs)
        response.raise_for_status()
        return response.content
    
    async def post(self, url: str, data: bytes = None, **kwargs) -> bytes:
        response = await self._client.post(url, content=data, **kwargs)
        response.raise_for_status()
        return response.content
    
    async def close(self) -> None:
        await self._client.aclose()

# Use the protocol
class ImageGenerator:
    def __init__(self, http_client: HTTPClientProtocol):
        self.http_client = http_client  # Depends on protocol, not concrete class
    
    async def generate(self, prompt: str) -> bytes:
        return await self.http_client.post(
            "https://api.blossom-ai.com/generate",
            data=prompt.encode()
        )

# Usage
httpx_client = HttpxClient(timeout=60.0)
generator = ImageGenerator(http_client=httpx_client)
```

### Runtime Protocol Checking

```python
@runtime_checkable
class CacheProtocol(Protocol):
    """Protocol for cache operations with runtime checking"""
    
    async def get(self, key: str) -> bytes | None:
        """Get value from cache"""
        ...
    
    async def set(self, key: str, value: bytes, ttl: int = None) -> None:
        """Set value in cache"""
        ...
    
    async def delete(self, key: str) -> bool:
        """Delete value from cache"""
        ...

# Check if object implements protocol
def is_cache(obj) -> bool:
    return isinstance(obj, CacheProtocol)

# Implementation
class MemoryCache:
    def __init__(self):
        self._cache = {}
    
    async def get(self, key: str) -> bytes | None:
        return self._cache.get(key)
    
    async def set(self, key: str, value: bytes, ttl: int = None) -> None:
        self._cache[key] = value
    
    async def delete(self, key: str) -> bool:
        if key in self._cache:
            del self._cache[key]
            return True
        return False

# Check implementation
cache = MemoryCache()
print(is_cache(cache))  # True with @runtime_checkable
```

---

## 🏗️ Defining Protocols

### Core Protocols in Blossom AI

```python
from typing import Protocol, Any, Dict, Optional, List
from dataclasses import dataclass

class ConfigProtocol(Protocol):
    """Configuration interface"""
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value"""
        ...
    
    def set(self, key: str, value: Any) -> None:
        """Set configuration value"""
        ...
    
    def validate(self) -> bool:
        """Validate configuration"""
        ...

class LoggerProtocol(Protocol):
    """Logging interface"""
    
    def log(self, level: str, message: str, **kwargs) -> None:
        """Log a message"""
        ...
    
    def debug(self, message: str, **kwargs) -> None:
        """Log debug message"""
        ...
    
    def info(self, message: str, **kwargs) -> None:
        """Log info message"""
        ...
    
    def warning(self, message: str, **kwargs) -> None:
        """Log warning message"""
        ...
    
    def error(self, message: str, **kwargs) -> None:
        """Log error message"""
        ...

class RateLimiterProtocol(Protocol):
    """Rate limiting interface"""
    
    async def acquire(self, key: str = None) -> bool:
        """Acquire rate limit permit"""
        ...
    
    async def release(self, key: str = None) -> None:
        """Release rate limit permit"""
        ...
    
    def is_allowed(self, key: str = None) -> bool:
        """Check if request is allowed"""
        ...

class GeneratorProtocol(Protocol):
    """Base generator interface"""
    
    async def generate(self, prompt: str, **kwargs) -> bytes:
        """Generate content from prompt"""
        ...
    
    def supports(self, prompt_type: str) -> bool:
        """Check if generator supports prompt type"""
        ...
```

### Generic Protocols

```python
from typing import TypeVar, Generic

T = TypeVar('T')

class RepositoryProtocol(Protocol, Generic[T]):
    """Generic repository protocol"""
    
    async def get_by_id(self, id: str) -> Optional[T]:
        """Get entity by ID"""
        ...
    
    async def save(self, entity: T) -> T:
        """Save entity"""
        ...
    
    async def delete(self, id: str) -> bool:
        """Delete entity by ID"""
        ...
    
    async def list(self, limit: int = 100, offset: int = 0) -> List[T]:
        """List entities with pagination"""
        ...

@dataclass
class User:
    id: str
    name: str
    email: str

class UserRepository:
    """Concrete implementation for User repository"""
    
    def __init__(self, database):
        self.database = database
    
    async def get_by_id(self, id: str) -> Optional[User]:
        data = await self.database.get(f"user:{id}")
        if data:
            return User(**data)
        return None
    
    async def save(self, user: User) -> User:
        await self.database.set(f"user:{user.id}", user.__dict__)
        return user
    
    async def delete(self, id: str) -> bool:
        return await self.database.delete(f"user:{id}")
    
    async def list(self, limit: int = 100, offset: int = 0) -> List[User]:
        # Implementation here
        return []

# Usage with generic protocol
async def process_users(repo: RepositoryProtocol[User]) -> None:
    """Function that works with any User repository implementation"""
    user = await repo.get_by_id("123")
    if user:
        print(f"User: {user.name}")
```

### Async Protocols

```python
from typing import AsyncIterator, Awaitable

class AsyncGeneratorProtocol(Protocol):
    """Protocol for async streaming generators"""
    
    async def generate_stream(
        self,
        prompt: str,
        **kwargs
    ) -> AsyncIterator[bytes]:
        """Generate content as async stream"""
        ...
    
    async def generate_batch(
        self,
        prompts: List[str],
        **kwargs
    ) -> List[bytes]:
        """Generate multiple items in batch"""
        ...

class StreamingTextGenerator:
    """Implementation of async streaming generator"""
    
    def __init__(self, model, tokenizer):
        self.model = model
        self.tokenizer = tokenizer
    
    async def generate_stream(
        self,
        prompt: str,
        **kwargs
    ) -> AsyncIterator[str]:
        """Stream text generation"""
        
        tokens = self.tokenizer.encode(prompt)
        
        for i in range(kwargs.get("max_tokens", 100)):
            # Generate next token
            next_token = await self.model.generate_next(tokens)
            text = self.tokenizer.decode([next_token])
            yield text
            
            tokens.append(next_token)
    
    async def generate_batch(
        self,
        prompts: List[str],
        **kwargs
    ) -> List[str]:
        """Generate multiple texts"""
        
        results = []
        for prompt in prompts:
            text = ""
            async for chunk in self.generate_stream(prompt, **kwargs):
                text += chunk
            results.append(text)
        
        return results
```

### Callback Protocols

```python
from typing import Callable

class ProgressCallbackProtocol(Protocol):
    """Protocol for progress callbacks"""
    
    def __call__(self, current: int, total: int, message: str = None) -> None:
        """Progress callback"""
        ...

class BatchProcessor:
    """Process items with progress callbacks"""
    
    def __init__(self, logger: LoggerProtocol):
        self.logger = logger
    
    async def process_with_progress(
        self,
        items: List[str],
        processor: Callable[[str], Awaitable[str]],
        callback: ProgressCallbackProtocol = None
    ) -> List[str]:
        """Process items with optional progress callback"""
        
        results = []
        total = len(items)
        
        for i, item in enumerate(items):
            if callback:
                callback(i + 1, total, f"Processing {item}")
            
            result = await processor(item)
            results.append(result)
        
        return results

# Implementation
def console_progress(current: int, total: int, message: str = None):
    """Console progress callback"""
    percent = (current / total) * 100
    bar = "█" * int(percent / 5)
    print(f"\r[{bar:<20}] {percent:.1f}% {message or ''}", end="")

# Usage
processor = BatchProcessor(logger=ConsoleLogger())
results = await processor.process_with_progress(
    items=["a", "b", "c"],
    processor=lambda x: f"processed_{x}",
    callback=console_progress
)
```

---

## 🔧 Implementing Protocols

### Simple Implementation

```python
from blossom_ai.core.protocols import ConfigProtocol
from typing import Dict, Any

class EnvironmentConfig:
    """Configuration from environment variables"""
    
    def __init__(self, prefix: str = "BLOSSOM_"):
        self.prefix = prefix
        self._cache: Dict[str, Any] = {}
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value from environment"""
        cache_key = f"{self.prefix}{key}"
        
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        import os
        value = os.getenv(cache_key, default)
        self._cache[cache_key] = value
        return value
    
    def set(self, key: str, value: Any) -> None:
        """Set configuration value (in-memory only)"""
        cache_key = f"{self.prefix}{key}"
        self._cache[cache_key] = value
    
    def validate(self) -> bool:
        """Validate required configuration"""
        required_keys = ["API_KEY", "BASE_URL"]
        
        for key in required_keys:
            if not self.get(key):
                return False
        
        return True

class YAMLConfig:
    """Configuration from YAML file"""
    
    def __init__(self, file_path: str):
        self.file_path = file_path
        self._config = self._load_config()
    
    def _load_config(self) -> Dict[str, Any]:
        import yaml
        with open(self.file_path, 'r') as f:
            return yaml.safe_load(f)
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value using dot notation"""
        keys = key.split('.')
        value = self._config
        
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        
        return value
    
    def set(self, key: str, value: Any) -> None:
        """Set configuration value (in-memory only)"""
        keys = key.split('.')
        config = self._config
        
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            config = config[k]
        
        config[keys[-1]] = value
    
    def validate(self) -> bool:
        """Validate configuration against schema"""
        # Implementation here
        return True
```

### Protocol Composition

```python
class LoggingCacheProtocol(CacheProtocol, LoggerProtocol):
    """Combined protocol for cache with logging"""
    pass

class LoggingCache:
    """Cache implementation with built-in logging"""
    
    def __init__(self, cache: CacheProtocol, logger: LoggerProtocol):
        self.cache = cache
        self.logger = logger
    
    async def get(self, key: str) -> bytes | None:
        self.logger.debug(f"Cache GET: {key}")
        
        result = await self.cache.get(key)
        
        if result:
            self.logger.debug(f"Cache HIT: {key}")
        else:
            self.logger.debug(f"Cache MISS: {key}")
        
        return result
    
    async def set(self, key: str, value: bytes, ttl: int = None) -> None:
        self.logger.debug(f"Cache SET: {key} (TTL: {ttl})")
        
        await self.cache.set(key, value, ttl)
    
    async def delete(self, key: str) -> bool:
        self.logger.debug(f"Cache DELETE: {key}")
        
        return await self.cache.delete(key)
    
    # Delegate logging methods to underlying logger
    def log(self, level: str, message: str, **kwargs) -> None:
        self.logger.log(level, message, **kwargs)
    
    def debug(self, message: str, **kwargs) -> None:
        self.logger.debug(message, **kwargs)
    
    def info(self, message: str, **kwargs) -> None:
        self.logger.info(message, **kwargs)
    
    def warning(self, message: str, **kwargs) -> None:
        self.logger.warning(message, **kwargs)
    
    def error(self, message: str, **kwargs) -> None:
        self.logger.error(message, **kwargs)
```

---

## ⚖️ Protocol vs ABC

### When to Use Protocols

```python
from abc import ABC, abstractmethod
from typing import Protocol

# ABC Approach
class CacheABC(ABC):
    """Abstract base class for cache"""
    
    @abstractmethod
    async def get(self, key: str) -> bytes | None:
        pass
    
    @abstractmethod
    async def set(self, key: str, value: bytes, ttl: int = None) -> None:
        pass

# Protocol Approach  
class CacheProtocol(Protocol):
    """Protocol for cache operations"""
    
    async def get(self, key: str) -> bytes | None:
        ...
    
    async def set(self, key: str, value: bytes, ttl: int = None) -> None:
        ...

# Key differences:

# 1. Protocols support structural subtyping
class SimpleCache:
    """No explicit inheritance needed"""
    
    def __init__(self):
        self._data = {}
    
    async def get(self, key: str) -> bytes | None:
        return self._data.get(key)
    
    async def set(self, key: str, value: bytes, ttl: int = None) -> None:
        self._data[key] = value

# This works with protocols but not ABCs
cache: CacheProtocol = SimpleCache()  # ✅ Protocol works
# cache: CacheABC = SimpleCache()     # ❌ ABC requires inheritance

# 2. Multiple inheritance with ABCs
class RedisCache(CacheABC):  # Must inherit from ABC
    """Redis cache implementation"""
    
    def __init__(self, redis_client):
        self.redis = redis_client
    
    async def get(self, key: str) -> bytes | None:
        return await self.redis.get(key)
    
    async def set(self, key: str, value: bytes, ttl: int = None) -> None:
        await self.redis.set(key, value, ex=ttl)

# Protocols allow more flexibility
class EnhancedCache:
    """Enhanced cache with extra methods"""
    
    async def get(self, key: str) -> bytes | None:
        ...
    
    async def set(self, key: str, value: bytes, ttl: int = None) -> None:
        ...
    
    async def get_many(self, keys: List[str]) -> Dict[str, bytes]:
        """Extra method not in protocol"""
        ...

# Still works as CacheProtocol
enhanced: CacheProtocol = EnhancedCache()  # ✅ Only required methods needed
```

### Comparison Table

| Feature | Protocol | ABC |
|---------|----------|-----|
| Structural typing | ✅ | ❌ |
| Runtime checking | ✅ (with @runtime_checkable) | ✅ |
| Multiple inheritance | ✅ | ⚠️ (diamond problem) |
| Constructor enforcement | ❌ | ✅ |
| Abstract properties | ❌ | ✅ |
| Mixin support | ✅ | ✅ |
| Static type checking | ✅ | ✅ |

### Best Practices

```python
# Use Protocols for:
# 1. External dependencies you don't control
class ExternalServiceProtocol(Protocol):
    def call_api(self, endpoint: str, data: dict) -> dict: ...

# 2. Simple interfaces with few methods
class SimpleCacheProtocol(Protocol):
    def get(self, key: str) -> bytes | None: ...
    def set(self, key: str, value: bytes) -> None: ...

# 3. When you need structural subtyping
# 4. For dependency injection

# Use ABCs for:
# 1. Base classes with shared implementation
class BaseGenerator(ABC):
    def __init__(self, model):
        self.model = model
    
    @abstractmethod
    async def generate(self, prompt: str) -> bytes:
        pass
    
    def _preprocess(self, prompt: str) -> str:
        """Shared implementation"""
        return prompt.strip()

# 2. When you need to enforce constructor signature
# 3. Complex inheritance hierarchies
# 4. When you need abstract properties
```

---

## 🧪 Testing with Protocols

### Mock Protocols

```python
from unittest.mock import Mock, AsyncMock
from blossom_ai.core.protocols import HTTPClientProtocol, CacheProtocol

class TestWithProtocols:
    def setup_method(self):
        """Setup with protocol-based mocks"""
        
        # Create mock that follows protocol
        self.mock_http = Mock(spec=HTTPClientProtocol)
        self.mock_cache = Mock(spec=CacheProtocol)
        
        # Configure mock behavior
        self.mock_http.get = AsyncMock(return_value=b"mock response")
        self.mock_cache.get = AsyncMock(return_value=None)
        self.mock_cache.set = AsyncMock()
        
        # Create client with mocked protocols
        self.client = BlossomClient(
            http_client=self.mock_http,
            cache=self.mock_cache
        )
    
    async def test_protocol_mocking(self):
        """Test with protocol-based mocking"""
        
        # Test
        result = await self.client.image.generate("test prompt")
        
        # Verify protocol methods were called
        self.mock_http.post.assert_called_once()
        self.mock_cache.get.assert_called_once()
        self.mock_cache.set.assert_called_once()

# Manual mock implementation
class ManualMockCache:
    """Manual mock implementation following protocol"""
    
    def __init__(self):
        self._data = {}
        self.get_calls = []
        self.set_calls = []
    
    async def get(self, key: str) -> bytes | None:
        self.get_calls.append(key)
        return self._data.get(key)
    
    async def set(self, key: str, value: bytes, ttl: int = None) -> None:
        self.set_calls.append((key, value, ttl))
        self._data[key] = value
    
    async def delete(self, key: str) -> bool:
        if key in self._data:
            del self._data[key]
            return True
        return False

# Use manual mock
manual_cache = ManualMockCache()
manual_cache: CacheProtocol = manual_cache  # Type checks correctly
```

### Protocol Validation

```python
def validate_protocol_implementation(obj: Any, protocol: type) -> List[str]:
    """Validate that object implements protocol correctly"""
    
    missing_methods = []
    
    # Get protocol methods
    protocol_methods = {
        name: getattr(protocol, name)
        for name in dir(protocol)
        if not name.startswith('_') and callable(getattr(protocol, name))
    }
    
    # Check each method
    for method_name, method in protocol_methods.items():
        if not hasattr(obj, method_name):
            missing_methods.append(f"Missing method: {method_name}")
            continue
        
        obj_method = getattr(obj, method_name)
        
        # Check if it's callable
        if not callable(obj_method):
            missing_methods.append(f"{method_name} is not callable")
    
    return missing_methods

# Usage
class IncompleteCache:
    """Cache missing required methods"""
    
    async def get(self, key: str) -> bytes | None:
        return None
    # Missing set and delete methods

incomplete = IncompleteCache()
errors = validate_protocol_implementation(incomplete, CacheProtocol)
print(errors)  # ["Missing method: set", "Missing method: delete"]
```

---

## 🎯 Advanced Patterns

### Protocol Inheritance

```python
class ReadableProtocol(Protocol):
    def read(self) -> str: ...

class WritableProtocol(Protocol):
    def write(self, data: str) -> None: ...

class ReadWritableProtocol(ReadableProtocol, WritableProtocol):
    """Protocol inheritance"""
    pass

class FileStorage:
    """Implementation of combined protocol"""
    
    def __init__(self, file_path: str):
        self.file_path = file_path
    
    def read(self) -> str:
        with open(self.file_path, 'r') as f:
            return f.read()
    
    def write(self, data: str) -> None:
        with open(self.file_path, 'w') as f:
            f.write(data)

# Usage
storage = FileStorage("data.txt")
storage: ReadWritableProtocol = storage  # ✅ Implements both protocols
```

### Generic Protocol Constraints

```python
from typing import TypeVar, Generic

T = TypeVar('T', bound='Serializable')

class Serializable(Protocol):
    def serialize(self) -> bytes: ...
    @staticmethod
    def deserialize(data: bytes) -> 'Serializable': ...

class SerializerProtocol(Protocol, Generic[T]):
    """Generic serializer with type constraints"""
    
    def serialize(self, obj: T) -> bytes:
        """Serialize object"""
        ...
    
    def deserialize(self, data: bytes) -> T:
        """Deserialize object"""
        ...

@dataclass
class Person:
    name: str
    age: int
    
    def serialize(self) -> bytes:
        import json
        return json.dumps(self.__dict__).encode()
    
    @staticmethod
    def deserialize(data: bytes) -> 'Person':
        import json
        data_dict = json.loads(data.decode())
        return Person(**data_dict)

class JSONSerializer:
    """JSON serializer implementation"""
    
    def serialize(self, obj: Person) -> bytes:
        return obj.serialize()
    
    def deserialize(self, data: bytes) -> Person:
        return Person.deserialize(data)

# Usage with type constraints
serializer: SerializerProtocol[Person] = JSONSerializer()
person = Person("Alice", 30)
data = serializer.serialize(person)
restored = serializer.deserialize(data)
```

### Protocol with Context Managers

```python
from typing import AsyncContextManager

class ConnectionProtocol(Protocol):
    """Protocol for database connections"""
    
    async def execute(self, query: str, params: List[Any] = None) -> List[Dict]:
        """Execute query"""
        ...
    
    def transaction(self) -> AsyncContextManager['TransactionProtocol']:
        """Start transaction"""
        ...

class TransactionProtocol(Protocol):
    """Protocol for database transactions"""
    
    async def execute(self, query: str, params: List[Any] = None) -> List[Dict]:
        """Execute query in transaction"""
        ...
    
    async def commit(self) -> None:
        """Commit transaction"""
        ...
    
    async def rollback(self) -> None:
        """Rollback transaction"""
        ...

class DatabaseConnection:
    """Database connection with transaction support"""
    
    def __init__(self, dsn: str):
        self.dsn = dsn
        self._conn = None
    
    async def execute(self, query: str, params: List[Any] = None) -> List[Dict]:
        # Implementation here
        return []
    
    def transaction(self) -> AsyncContextManager['DatabaseTransaction']:
        return DatabaseTransaction(self)

class DatabaseTransaction:
    """Database transaction"""
    
    def __init__(self, connection: DatabaseConnection):
        self.connection = connection
    
    async def __aenter__(self):
        # Start transaction
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            await self.rollback()
        else:
            await self.commit()
    
    async def execute(self, query: str, params: List[Any] = None) -> List[Dict]:
        # Execute in transaction
        return []
    
    async def commit(self) -> None:
        # Commit transaction
        pass
    
    async def rollback(self) -> None:
        # Rollback transaction
        pass

# Usage
conn: ConnectionProtocol = DatabaseConnection("postgresql://...")

# Use with context manager
async with conn.transaction() as tx:
    result = await tx.execute("INSERT INTO users ...")
```

---

## 📚 Further Reading

- [Architecture Overview](ARCHITECTURE.md)
- [Dependency Injection](DEPENDENCY_INJECTION.md)
- [Client Guide](CLIENT.md)
- [Testing Guide](TESTING.md)
- [Configuration System](CONFIGURATION.md)