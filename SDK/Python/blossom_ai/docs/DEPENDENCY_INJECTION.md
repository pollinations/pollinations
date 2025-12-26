# 💉 Dependency Injection Patterns

> **Implement clean dependency injection for testable, maintainable code**

---

## 📋 Table of Contents

- [DI Basics](#di-basics)
- [Constructor Injection](#constructor-injection)
- [Property Injection](#property-injection)
- [Method Injection](#method-injection)
- [DI Containers](#di-containers)
- [Testing with DI](#testing-with-di)
- [Advanced Patterns](#advanced-patterns)

---

## 🚀 Quick Start

### Basic Dependency Injection

```python
from blossom_ai.core.protocols import HTTPClientProtocol, CacheProtocol
from blossom_ai.utils.cache import MemoryCache
import httpx

class BlossomClient:
    def __init__(
        self,
        http_client: HTTPClientProtocol = None,  # Dependency injection
        cache: CacheProtocol = None,             # Dependency injection
        api_key: str = None
    ):
        # Inject HTTP client or create default
        self.http_client = http_client or httpx.AsyncClient()
        
        # Inject cache or create default
        self.cache = cache or MemoryCache()
        
        self.api_key = api_key
```

### Protocol-Based DI

```python
from typing import Protocol
from dataclasses import dataclass

# Define protocols (interfaces)
class LoggerProtocol(Protocol):
    def log(self, level: str, message: str) -> None: ...
    def debug(self, message: str) -> None: ...
    def error(self, message: str) -> None: ...

class MetricsProtocol(Protocol):
    def increment(self, metric: str, value: int = 1) -> None: ...
    def timing(self, metric: str, milliseconds: float) -> None: ...

# Implement concrete classes
@dataclass
class ConsoleLogger:
    def log(self, level: str, message: str) -> None:
        print(f"[{level}] {message}")
    
    def debug(self, message: str) -> None:
        self.log("DEBUG", message)
    
    def error(self, message: str) -> None:
        self.log("ERROR", message)

@dataclass  
class StatsDMetrics:
    host: str = "localhost"
    port: int = 8125
    
    def increment(self, metric: str, value: int = 1) -> None:
        # Send to StatsD
        pass
    
    def timing(self, metric: str, milliseconds: float) -> None:
        # Send to StatsD
        pass

# Class with injected dependencies
class ImageGenerator:
    def __init__(
        self,
        logger: LoggerProtocol,
        metrics: MetricsProtocol,
        http_client: HTTPClientProtocol
    ):
        self.logger = logger
        self.metrics = metrics
        self.http_client = http_client
    
    async def generate(self, prompt: str) -> bytes:
        self.logger.debug(f"Generating image for prompt: {prompt}")
        
        start_time = time.time()
        
        # Generate image...
        response = await self.http_client.post(
            "https://api.blossom-ai.com/generate",
            json={"prompt": prompt}
        )
        
        duration = (time.time() - start_time) * 1000
        self.metrics.timing("image_generation", duration)
        self.metrics.increment("images_generated")
        
        return response.content
```

---

## 🔧 Constructor Injection

### Required Dependencies

```python
from blossom_ai.core.protocols import ConfigProtocol
from dataclasses import dataclass
from typing import Optional

@dataclass(frozen=True)
class DatabaseConfig:
    host: str
    port: int
    database: str
    username: str
    password: str

class DatabaseClient:
    def __init__(self, config: DatabaseConfig):
        # Required dependency - must be provided
        if not config.host:
            raise ValueError("Database host is required")
        
        self.config = config
        self._connection = None
    
    async def connect(self):
        """Connect to database using injected config"""
        self._connection = await self._create_connection(
            host=self.config.host,
            port=self.config.port,
            database=self.config.database,
            user=self.config.username,
            password=self.config.password
        )

# Usage with constructor injection
config = DatabaseConfig(
    host="db.example.com",
    port=5432,
    database="myapp",
    username="app_user",
    password="secure_password"
)

db_client = DatabaseClient(config=config)
```

### Optional Dependencies with Defaults

```python
class CacheManager:
    def __init__(
        self,
        backend: str = "memory",  # Default value
        ttl: int = 3600,         # Default value
        max_size: Optional[int] = None  # Optional
    ):
        self.backend = backend
        self.ttl = ttl
        self.max_size = max_size or (1024 if backend == "memory" else float('inf'))
        
        # Initialize based on backend type
        if backend == "memory":
            self._cache = {}
        elif backend == "redis":
            self._cache = self._create_redis_client()
        elif backend == "file":
            self._cache = self._create_file_cache()
```

### Factory Pattern with DI

```python
from typing import Type, Dict, Any

class ClientFactory:
    """Factory for creating clients with different configurations"""
    
    @staticmethod
    def create_production_client(
        api_key: str,
        cache_size: int = 1000
    ) -> BlossomClient:
        """Create production client with optimized settings"""
        
        # Production dependencies
        http_client = httpx.AsyncClient(
            limits=httpx.Limits(
                max_keepalive_connections=20,
                max_connections=100
            )
        )
        
        cache = CacheManager(
            backend="redis",
            ttl=3600,
            max_size=cache_size
        )
        
        logger = StructuredLogger(
            level="INFO",
            format="json",
            outputs=["console", "file"]
        )
        
        rate_limiter = RateLimiter(
            requests_per_minute=120,
            burst_limit=10
        )
        
        return BlossomClient(
            api_key=api_key,
            http_client=http_client,
            cache=cache,
            logger=logger,
            rate_limiter=rate_limiter
        )
    
    @staticmethod
    def create_testing_client() -> BlossomClient:
        """Create testing client with mock dependencies"""
        
        # Mock dependencies for testing
        mock_http = MockHTTPClient()
        mock_cache = MockCache()
        mock_logger = MockLogger()
        
        return BlossomClient(
            api_key="test_key",
            http_client=mock_http,
            cache=mock_cache,
            logger=mock_logger
        )
    
    @staticmethod
    def create_development_client(api_key: str) -> BlossomClient:
        """Create development client with debug settings"""
        
        # Development dependencies
        http_client = httpx.AsyncClient(
            timeout=30.0,
            verify=False  # Skip SSL verification for development
        )
        
        cache = CacheManager(
            backend="memory",
            ttl=300,  # Short TTL for development
            max_size=100
        )
        
        logger = ConsoleLogger(level="DEBUG")
        
        return BlossomClient(
            api_key=api_key,
            http_client=http_client,
            cache=cache,
            logger=logger
        )
```

---

## 📦 Property Injection

### Setter Injection

```python
class TextGenerator:
    def __init__(self):
        self._model = None
        self._tokenizer = None
        self._cache = None
    
    # Property setters for injection
    def set_model(self, model):
        """Inject model dependency"""
        self._model = model
        return self
    
    def set_tokenizer(self, tokenizer):
        """Inject tokenizer dependency"""
        self._tokenizer = tokenizer
        return self
    
    def set_cache(self, cache):
        """Inject cache dependency"""
        self._cache = cache
        return self
    
    def validate_dependencies(self):
        """Ensure all required dependencies are set"""
        if not self._model:
            raise ValueError("Model dependency is required")
        if not self._tokenizer:
            raise ValueError("Tokenizer dependency is required")
    
    async def generate(self, prompt: str) -> str:
        self.validate_dependencies()
        
        # Check cache first
        if self._cache:
            cached = await self._cache.get(prompt)
            if cached:
                return cached
        
        # Generate with model
        tokens = self._tokenizer.encode(prompt)
        output = await self._model.generate(tokens)
        result = self._tokenizer.decode(output)
        
        # Cache result
        if self._cache:
            await self._cache.set(prompt, result)
        
        return result

# Usage with property injection
generator = TextGenerator()
generator.set_model(gpt_model)
generator.set_tokenizer(tokenizer)
generator.set_cache(redis_cache)
```

### Method Injection

```python
class BatchProcessor:
    def __init__(self, logger: LoggerProtocol):
        # Required dependency in constructor
        self.logger = logger
    
    async def process_batch(
        self,
        items: List[str],
        processor: Callable[[str], Awaitable[str]]  # Method injection
    ) -> List[str]:
        """Process batch with injected processor function"""
        
        results = []
        
        for item in items:
            self.logger.debug(f"Processing item: {item}")
            
            # Use injected processor
            result = await processor(item)
            results.append(result)
        
        return results
    
    async def process_with_different_strategies(
        self,
        items: List[str],
        strategy: str = "sequential"
    ) -> List[str]:
        """Process with different processing strategies"""
        
        if strategy == "sequential":
            return await self.process_batch(items, self._sequential_processor)
        elif strategy == "parallel":
            return await self.process_batch(items, self._parallel_processor)
        elif strategy == "cached":
            return await self.process_batch(items, self._cached_processor)
        else:
            raise ValueError(f"Unknown strategy: {strategy}")
    
    async def _sequential_processor(self, item: str) -> str:
        """Default sequential processor"""
        await asyncio.sleep(0.1)  # Simulate work
        return f"processed_{item}"
    
    async def _parallel_processor(self, item: str) -> str:
        """Parallel processor (same as sequential for single items)"""
        return await self._sequential_processor(item)
    
    async def _cached_processor(self, item: str) -> str:
        """Cached processor"""
        return await self._sequential_processor(item)

# Usage with method injection
processor = BatchProcessor(logger=console_logger)

# Process with custom processor function
async def custom_processor(item: str) -> str:
    return f"custom_{item.upper()}"

results = await processor.process_batch(
    items=["a", "b", "c"],
    processor=custom_processor  # Method injection
)
```

---

## 🏗️ DI Containers

### Simple Container

```python
from typing import Type, TypeVar, Generic, Dict, Any
import inspect

T = TypeVar('T')

class DIContainer:
    """Simple dependency injection container"""
    
    def __init__(self):
        self._services: Dict[Type, Any] = {}
        self._factories: Dict[Type, Callable] = {}
        self._singletons: Dict[Type, Any] = {}
    
    def register(self, interface: Type[T], implementation: T) -> None:
        """Register a service implementation"""
        self._services[interface] = implementation
    
    def register_factory(self, interface: Type[T], factory: Callable[[], T]) -> None:
        """Register a factory function"""
        self._factories[interface] = factory
    
    def register_singleton(self, interface: Type[T], implementation: T) -> None:
        """Register a singleton service"""
        self._singletons[interface] = implementation
    
    def resolve(self, interface: Type[T]) -> T:
        """Resolve a service by interface"""
        
        # Check singletons first
        if interface in self._singletons:
            return self._singletons[interface]
        
        # Check registered services
        if interface in self._services:
            return self._services[interface]
        
        # Check factories
        if interface in self._factories:
            return self._factories[interface]()
        
        # Try to create instance with constructor injection
        return self._create_instance(interface)
    
    def _create_instance(self, cls: Type[T]) -> T:
        """Create instance with constructor injection"""
        
        # Get constructor signature
        sig = inspect.signature(cls.__init__)
        
        # Resolve constructor parameters
        kwargs = {}
        for param_name, param in sig.parameters.items():
            if param_name == 'self':
                continue
            
            param_type = param.annotation
            if param_type != inspect.Parameter.empty:
                kwargs[param_name] = self.resolve(param_type)
            elif param.default != inspect.Parameter.empty:
                kwargs[param_name] = param.default
            else:
                raise ValueError(f"Cannot resolve parameter {param_name} for {cls}")
        
        return cls(**kwargs)
    
    def create_scope(self) -> 'DIScope':
        """Create a new dependency scope"""
        return DIScope(self)

class DIScope:
    """Scoped dependency container"""
    
    def __init__(self, parent: DIContainer):
        self.parent = parent
        self._scoped_services: Dict[Type, Any] = {}
    
    def register_scoped(self, interface: Type[T], implementation: T) -> None:
        """Register a scoped service"""
        self._scoped_services[interface] = implementation
    
    def resolve(self, interface: Type[T]) -> T:
        """Resolve from scope or parent"""
        if interface in self._scoped_services:
            return self._scoped_services[interface]
        
        return self.parent.resolve(interface)

# Usage
container = DIContainer()

# Register services
container.register(LoggerProtocol, ConsoleLogger())
container.register(CacheProtocol, RedisCache())
container.register(HTTPClientProtocol, httpx.AsyncClient())

# Register factory
container.register_factory(
    DatabaseConfig,
    lambda: DatabaseConfig(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5432")),
        database=os.getenv("DB_NAME", "myapp"),
        username=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "")
    )
)

# Resolve with automatic constructor injection
image_generator = container.resolve(ImageGenerator)
```

### Configuration-Based Container

```python
from typing import Dict, Any, List
import yaml

class ConfigurationContainer:
    """DI container configured from YAML/JSON"""
    
    def __init__(self, config_path: str):
        self.config = self._load_config(config_path)
        self.container = DIContainer()
        self._configure_services()
    
    def _load_config(self, config_path: str) -> Dict[str, Any]:
        """Load configuration from file"""
        with open(config_path, 'r') as f:
            return yaml.safe_load(f)
    
    def _configure_services(self):
        """Configure services from configuration"""
        
        services = self.config.get('services', {})
        
        for service_name, service_config in services.items():
            self._register_service(service_name, service_config)
    
    def _register_service(self, name: str, config: Dict[str, Any]):
        """Register a service from configuration"""
        
        service_type = config['type']
        
        if service_type == 'singleton':
            instance = self._create_instance(config['class'], config.get('args', {}))
            self.container.register_singleton(name, instance)
        
        elif service_type == 'transient':
            factory = lambda: self._create_instance(config['class'], config.get('args', {}))
            self.container.register_factory(name, factory)
        
        elif service_type == 'scoped':
            # Scoped services handled by scope creation
            pass
    
    def _create_instance(self, class_path: str, args: Dict[str, Any]):
        """Create instance from class path and arguments"""
        
        # Import class dynamically
        module_path, class_name = class_path.rsplit('.', 1)
        module = __import__(module_path, fromlist=[class_name])
        cls = getattr(module, class_name)
        
        # Create instance with resolved dependencies
        resolved_args = {}
        for arg_name, arg_value in args.items():
            if isinstance(arg_value, str) and arg_value.startswith('@'):
                # Reference to another service
                service_name = arg_value[1:]
                resolved_args[arg_name] = self.container.resolve(service_name)
            else:
                resolved_args[arg_name] = arg_value
        
        return cls(**resolved_args)
    
    def get_container(self) -> DIContainer:
        """Get the configured container"""
        return self.container

# Example configuration file (services.yaml)
"""
services:
  logger:
    type: singleton
    class: blossom_ai.utils.logging.StructuredLogger
    args:
      level: INFO
      format: json
      outputs: ["console", "file"]
  
  cache:
    type: singleton
    class: blossom_ai.utils.cache.RedisCache
    args:
      host: localhost
      port: 6379
      database: 0
  
  http_client:
    type: singleton
    class: httpx.AsyncClient
    args:
      limits:
        max_keepalive_connections: 20
        max_connections: 100
  
  image_generator:
    type: transient
    class: blossom_ai.generators.image.ImageGenerator
    args:
      logger: "@logger"
      cache: "@cache"
      http_client: "@http_client"
"""

# Usage
container = ConfigurationContainer("services.yaml").get_container()
image_generator = container.resolve("image_generator")
```

---

## 🧪 Testing with DI

### Mock Dependencies

```python
from unittest.mock import Mock, AsyncMock
from blossom_ai.core.protocols import HTTPClientProtocol, CacheProtocol

class TestImageGenerator:
    def setup_method(self):
        """Setup test dependencies"""
        
        # Create mock dependencies
        self.mock_http = Mock(spec=HTTPClientProtocol)
        self.mock_cache = Mock(spec=CacheProtocol)
        self.mock_logger = Mock(spec=LoggerProtocol)
        
        # Inject mocks into ImageGenerator
        self.generator = ImageGenerator(
            http_client=self.mock_http,
            cache=self.mock_cache,
            logger=self.mock_logger
        )
    
    async def test_generate_with_cache_hit(self):
        """Test generation when result is cached"""
        
        # Setup mock behavior
        self.mock_cache.get.return_value = b"cached_image_data"
        
        # Test
        result = await self.generator.generate("test prompt")
        
        # Verify cache was checked
        self.mock_cache.get.assert_called_once_with("test prompt")
        
        # Verify HTTP client was NOT called (cache hit)
        self.mock_http.post.assert_not_called()
        
        # Verify result
        assert result == b"cached_image_data"
    
    async def test_generate_with_cache_miss(self):
        """Test generation when result is not cached"""
        
        # Setup mock behavior
        self.mock_cache.get.return_value = None
        self.mock_http.post = AsyncMock(return_value=Mock(content=b"generated_image"))
        
        # Test
        result = await self.generator.generate("test prompt")
        
        # Verify cache was checked
        self.mock_cache.get.assert_called_once_with("test prompt")
        
        # Verify HTTP client was called (cache miss)
        self.mock_http.post.assert_called_once()
        
        # Verify result was cached
        self.mock_cache.set.assert_called_once_with("test prompt", b"generated_image")
        
        # Verify result
        assert result == b"generated_image"
```

### Test Configuration

```python
import pytest
from blossom_ai import BlossomClient

@pytest.fixture
def test_client():
    """Create test client with mock dependencies"""
    
    # Create client with test configuration
    client = BlossomClient(
        api_key="test_key",
        base_url="https://test-api.blossom-ai.com",
        timeout=5.0,
        cache_enabled=False,  # Disable cache for tests
        rate_limit_enabled=False  # Disable rate limiting for tests
    )
    
    yield client
    
    # Cleanup
    client.close()

@pytest.fixture
def mocked_client(mock_http_client, mock_cache):
    """Create client with mocked dependencies"""
    
    client = BlossomClient(
        api_key="test_key",
        http_client=mock_http_client,
        cache=mock_cache
    )
    
    return client

@pytest.fixture
def mock_http_client():
    """Mock HTTP client"""
    mock = Mock()
    mock.post = AsyncMock()
    mock.get = AsyncMock()
    return mock

@pytest.fixture
def mock_cache():
    """Mock cache"""
    mock = Mock()
    mock.get = AsyncMock(return_value=None)
    mock.set = AsyncMock()
    return mock

# Test using mocked client
async def test_image_generation(mocked_client, mock_http_client):
    """Test image generation with mocked client"""
    
    # Setup mock response
    mock_response = Mock()
    mock_response.content = b"fake_image_data"
    mock_response.status_code = 200
    mock_http_client.post.return_value = mock_response
    
    # Test
    result = await mocked_client.image.generate("test prompt")
    
    # Verify
    assert result == b"fake_image_data"
    mock_http_client.post.assert_called_once()
```

---

## 🎯 Advanced Patterns

### Service Locator (Anti-Pattern)

```python
# WARNING: Service Locator is considered an anti-pattern
# but shown here for completeness

class ServiceLocator:
    """Service locator pattern (anti-pattern)"""
    
    _services: Dict[Type, Any] = {}
    
    @classmethod
    def register(cls, interface: Type[T], implementation: T) -> None:
        """Register a service"""
        cls._services[interface] = implementation
    
    @classmethod
    def resolve(cls, interface: Type[T]) -> T:
        """Resolve a service"""
        return cls._services[interface]

# Usage (AVOID THIS PATTERN)
class BadlyDesignedService:
    def do_something(self):
        # Hidden dependency - hard to test and reason about
        logger = ServiceLocator.resolve(LoggerProtocol)
        logger.debug("Doing something")

# Better approach - constructor injection
class WellDesignedService:
    def __init__(self, logger: LoggerProtocol):
        # Explicit dependency
        self.logger = logger
    
    def do_something(self):
        self.logger.debug("Doing something")
```

### Ambient Context

```python
from contextvars import ContextVar
from typing import Optional

# Ambient context for request-scoped data
request_id_var: ContextVar[Optional[str]] = ContextVar('request_id', default=None)
user_id_var: ContextVar[Optional[str]] = ContextVar('user_id', default=None)

class RequestContext:
    """Request-scoped context"""
    
    def __init__(self, request_id: str, user_id: str):
        self.request_id = request_id
        self.user_id = user_id
        self._token1 = None
        self._token2 = None
    
    def __enter__(self):
        self._token1 = request_id_var.set(self.request_id)
        self._token2 = user_id_var.set(self.user_id)
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        request_id_var.reset(self._token1)
        user_id_var.reset(self._token2)

class ContextualLogger:
    """Logger that uses ambient context"""
    
    def __init__(self, base_logger: LoggerProtocol):
        self.base_logger = base_logger
    
    def log(self, level: str, message: str):
        request_id = request_id_var.get()
        user_id = user_id_var.get()
        
        contextual_message = f"[req:{request_id}] [user:{user_id}] {message}"
        self.base_logger.log(level, contextual_message)

# Usage
logger = ContextualLogger(ConsoleLogger())

with RequestContext(request_id="req-123", user_id="user-456"):
    logger.log("INFO", "User action performed")
    # Output: [req:req-123] [user:user-456] User action performed
```

### Decorator-Based DI

```python
from functools import wraps
from typing import Callable, TypeVar, ParamSpec

P = ParamSpec('P')
T = TypeVar('T')

def inject_dependencies(**dependencies):
    """Decorator for dependency injection"""
    
    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        @wraps(func)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            # Inject dependencies
            for dep_name, dep_type in dependencies.items():
                if dep_name not in kwargs:
                    kwargs[dep_name] = container.resolve(dep_type)
            
            return func(*args, **kwargs)
        
        return wrapper
    
    return decorator

# Usage with decorator
@inject_dependencies(logger=LoggerProtocol, cache=CacheProtocol)
def generate_image(
    prompt: str,
    logger: LoggerProtocol = None,
    cache: CacheProtocol = None
):
    """Function with injected dependencies"""
    logger.debug(f"Generating image: {prompt}")
    
    # Check cache
    cached = cache.get(prompt)
    if cached:
        return cached
    
    # Generate image...
    return b"generated_image"
```

---

## 📚 Further Reading

- [Architecture Overview](ARCHITECTURE.md)
- [Protocol Interfaces](PROTOCOL_INTERFACES.md)
- [Configuration System](CONFIGURATION.md)
- [Testing Guide](TESTING.md)
- [Client Guide](CLIENT.md)