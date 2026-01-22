# 🏗️ Architecture Overview

> Blossom AI's enterprise-grade architecture and design principles

---

## 🎯 Design Philosophy

### Clean Architecture Principles

Blossom AI is built on **Clean Architecture** principles, ensuring:

- **Separation of Concerns**: Clear boundaries between layers
- **Dependency Rule**: Dependencies point inward, never outward
- **Testability**: Everything is testable without external dependencies
- **Flexibility**: Easy to swap implementations without breaking changes

---

## 🏛️ Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        External Layer                        │
│                    (APIs, Databases, UI)                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Interface Adapters                      │
│                 (Controllers, Gateways, DTOs)                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                        Use Cases Layer                       │
│                   (Application Business Rules)               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                        Entities Layer                        │
│                     (Enterprise Business Rules)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Core Components

### 1. **Entities** (`blossom_ai/core/`)

Core business objects that represent the domain:

```python
# Core entities are pure Python objects
@dataclass(frozen=True)
class ImageGenerationRequest:
    prompt: str
    width: int
    height: int
    quality: str
    
@dataclass(frozen=True)
class TextGenerationResponse:
    text: str
    tokens_used: int
    model: str
```

**Key Characteristics:**
- Immutable (frozen dataclasses)
- No external dependencies
- Pure business logic
- Highly testable

### 2. **Use Cases** (`blossom_ai/generators/`)

Application-specific business rules:

```python
class ImageGenerationUseCase:
    def __init__(
        self,
        config: ConfigProtocol,
        http_client: HttpClientProtocol,
        cache: CacheBackendProtocol
    ):
        self.config = config
        self.http_client = http_client
        self.cache = cache
    
    async def execute(self, request: ImageGenerationRequest) -> Image:
        # Business logic here
        pass
```

**Key Characteristics:**
- Orchestrate entities
- Depend on interfaces, not implementations
- Contain application-specific logic

### 3. **Interface Adapters** (`blossom_ai/utils/`)

Convert data between formats:

```python
class HttpxClient(HttpClientProtocol):
    """HTTP client adapter using httpx."""
    
    def __init__(self, config: ConfigProtocol, logger: LoggerProtocol):
        self.client = httpx.AsyncClient(
            timeout=config.timeout,
            limits=config.connection_limits
        )
```

**Key Characteristics:**
- Implement protocols/interfaces
- Handle external dependencies
- Convert data formats

### 4. **Frameworks & Drivers** (External)

External interfaces:
- HTTP frameworks (FastAPI, Flask)
- Database drivers
- File systems
- Third-party APIs

---

## 🔌 Protocol Interfaces

### Why Protocols Over Abstract Classes?

```python
# Protocol (preferred) ✨
class HttpClientProtocol(Protocol):
    async def get(self, url: str) -> Response: ...
    async def post(self, url: str, data: Dict) -> Response: ...

# Abstract class (avoided)
class HttpClientAbstract(ABC):
    @abstractmethod
    async def get(self, url: str) -> Response: ...
```

**Advantages of Protocols:**
- **Structural Subtyping**: "If it walks like a duck..."
- **No Inheritance Required**: Easy mocking and testing
- **Better Performance**: No inheritance overhead
- **Multiple Implementation**: One class can implement multiple protocols

### Core Protocols

#### 1. ConfigProtocol
```python
class ConfigProtocol(Protocol):
    api_key: str
    base_url: str
    timeout: float
    cache_enabled: bool
    rate_limit_per_minute: int
```

#### 2. HttpClientProtocol
```python
class HttpClientProtocol(Protocol):
    async def get(self, url: str, **kwargs) -> Response: ...
    async def post(self, url: str, json: Dict, **kwargs) -> Response: ...
    async def close(self) -> None: ...
```

#### 3. CacheBackendProtocol
```python
class CacheBackendProtocol(Protocol):
    async def get(self, key: str) -> Optional[Any]: ...
    async def set(self, key: str, value: Any, ttl: int) -> None: ...
    async def delete(self, key: str) -> None: ...
```

#### 4. LoggerProtocol
```python
class LoggerProtocol(Protocol):
    def info(self, msg: str, **kwargs) -> None: ...
    def warning(self, msg: str, **kwargs) -> None: ...
    def error(self, msg: str, **kwargs) -> None: ...
```

---

## 💉 Dependency Injection

### Constructor Injection (Preferred)

```python
class TextGenerator:
    def __init__(
        self,
        config: ConfigProtocol,
        http_client: HttpClientProtocol,
        logger: LoggerProtocol,
        cache: Optional[CacheBackendProtocol] = None
    ):
        # All dependencies injected
        self.config = config
        self.http_client = http_client
        self.logger = logger
        self.cache = cache
```

### Factory Pattern

```python
class GeneratorFactory:
    @staticmethod
    def create_text_generator(
        config: Optional[ConfigProtocol] = None,
        http_client: Optional[HttpClientProtocol] = None
    ) -> TextGenerator:
        config = config or SessionConfig.from_env()
        http_client = http_client or HttpxClient(config)
        
        return TextGenerator(config, http_client)
```

### Service Locator (Anti-pattern, avoided)

```python
# ❌ Avoid this pattern
class BadTextGenerator:
    def __init__(self):
        self.config = ServiceLocator.get_config()
        self.http_client = ServiceLocator.get_http_client()
```

---

## 🧵 Thread Safety

### RLock for Thread Safety

```python
import threading
from typing import RLock

class ThreadSafeCache:
    def __init__(self):
        self._lock = RLock()
        self._data = {}
    
    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            return self._data.get(key)
    
    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._data[key] = value
```

### Immutable Configurations

```python
from dataclasses import dataclass

@dataclass(frozen=True)  # Immutable
class SessionConfig:
    api_key: str
    base_url: str = "https://api.blossom-ai.com"
    timeout: float = 30.0
    
    def with_api_key(self, api_key: str) -> "SessionConfig":
        """Return new instance with updated API key."""
        return SessionConfig(
            api_key=api_key,
            base_url=self.base_url,
            timeout=self.timeout
        )
```

---

## 🏗️ Module Structure

```
blossom_ai/
├── __init__.py              # Public API
├── client.py                # Main client
├── _version.py              # Version info
│
├── core/                    # Enterprise business rules
│   ├── __init__.py
│   ├── config.py            # Configuration protocols
│   ├── interfaces.py        # Protocol definitions
│   └── errors.py            # Custom exceptions
│
├── generators/              # Application business rules
│   ├── __init__.py
│   ├── base_generator.py    # Base class
│   ├── image_generator.py   # Image generation use cases
│   └── text_generator.py    # Text generation use cases
│
├── utils/                   # Interface adapters
│   ├── __init__.py
│   ├── http_client.py       # HTTP implementation
│   ├── cache.py             # Caching implementation
│   ├── logging.py           # Logging implementation
│   ├── security.py          # Security utilities
│   └── rate_limiter.py      # Rate limiting

```

---

## 🔒 Security Architecture

### Layered Security

1. **Input Validation** (Outer layer)
   - File path validation
   - URL validation
   - Size limits

2. **API Key Sanitization** (Middle layer)
   - Mask in logs
   - Exclude from cache keys
   - Secure storage

3. **Response Validation** (Inner layer)
   - Content type checking
   - Size validation
   - Malware scanning

### Security by Design

```python
class SecureImageGenerator:
    def __init__(self, config: ConfigProtocol):
        self.config = config
        self.max_size_mb = config.max_file_size_mb
    
    async def generate(self, prompt: str) -> Image:
        # 1. Validate prompt (prevent injection)
        validate_prompt(prompt)
        
        # 2. Generate image
        image_data = await self._call_api(prompt)
        
        # 3. Validate response
        if len(image_data) > self.max_size_mb * 1024 * 1024:
            raise ValidationError("Image too large")
        
        # 4. Check content type
        if not is_valid_image_format(image_data):
            raise ValidationError("Invalid image format")
        
        return Image(image_data)
```

---

## 📊 Performance Architecture

### Caching Strategy

```python
class LRUCache:
    """Thread-safe LRU cache with TTL."""
    
    def __init__(self, max_size: int, default_ttl: int):
        self._cache = OrderedDict()
        self._max_size = max_size
        self._default_ttl = default_ttl
        self._lock = RLock()
    
    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key in self._cache:
                value, expiry = self._cache[key]
                if datetime.now() < expiry:
                    # Move to end (LRU)
                    self._cache.move_to_end(key)
                    return value
                else:
                    # Expired
                    del self._cache[key]
            return None
```

### Connection Pooling

```python
class HttpxClient(HttpClientProtocol):
    def __init__(self, config: ConfigProtocol):
        self.client = httpx.AsyncClient(
            # Connection pooling
            limits=httpx.Limits(
                max_keepalive_connections=20,
                max_connections=100,
                keepalive_expiry=30.0
            ),
            # Connection timeout
            timeout=httpx.Timeout(
                connect=5.0,
                read=config.timeout,
                write=10.0,
                pool=5.0
            )
        )
```

---

## 🧪 Testability

### Easy Mocking with Protocols

```python
from unittest.mock import Mock, AsyncMock

# Create mock HTTP client
mock_http = Mock(spec=HttpClientProtocol)
mock_http.post = AsyncMock(return_value=mock_response)

# Inject mock
client = BlossomClient(http_client=mock_http)

# Test without real API calls
result = await client.text.generate("test")
```

### Property-Based Testing

```python
from hypothesis import given, strategies as st

@given(prompt=st.text(min_size=1, max_size=100))
def test_prompt_validation(prompt):
    """Test that all prompts are properly sanitized."""
    sanitized = sanitize_prompt(prompt)
    assert len(sanitized) <= 1000
    assert "<script>" not in sanitized
```

---

## 🚢 Deployment Architecture

### Stateless Design

```python
class BlossomClient:
    """Stateless client - no persistent connections between requests."""
    
    def __init__(self, config: ConfigProtocol):
        self.config = config
        # Lazy initialization
        self._http_client = None
    
    @property
    def http_client(self):
        if self._http_client is None:
            self._http_client = HttpxClient(self.config)
        return self._http_client
    
    async def close(self):
        """Clean shutdown."""
        if self._http_client:
            await self._http_client.close()
```

### Horizontal Scaling

- **No shared state**: Each instance is independent
- **External caching**: Redis, Memcached for shared cache
- **Load balancing**: Any instance can handle any request
- **Circuit breakers**: Prevent cascade failures

---

## 🔗 Key Benefits

### 1. **Maintainability**
- Clear separation of concerns
- Easy to understand and modify
- Reduced coupling

### 2. **Testability**
- Protocol-based interfaces enable easy mocking
- Pure business logic without side effects
- Comprehensive test coverage

### 3. **Flexibility**
- Swap implementations without breaking changes
- Add new features without modifying existing code
- Support for multiple providers

### 4. **Performance**
- Thread-safe operations
- Efficient caching
- Connection pooling

### 5. **Security**
- Layered security approach
- Input validation at boundaries
- Secure by design

---

## 📚 Further Reading

- [💉 Dependency Injection](DEPENDENCY_INJECTION.md)
- [🔌 Protocol Interfaces](PROTOCOL_INTERFACES.md)
- [⚙️ Configuration System](CONFIGURATION.md)
- [🎨 Code Style Guide](CODE_STYLE.md)
