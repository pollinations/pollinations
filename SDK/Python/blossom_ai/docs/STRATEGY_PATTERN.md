# 🎯 Strategy Pattern Guide

> **Implementing and using the Strategy pattern in Blossom AI**

---

## Overview

The Strategy pattern defines a family of algorithms, encapsulates each one, and makes them interchangeable. Blossom AI uses this pattern for rate limiting, caching, and AI model selection.

---

## When to Use Strategy Pattern

| Use Case | Example |
|----------|---------|
| **Multiple algorithms** | Different caching strategies |
| **Runtime selection** | Choose model based on prompt |
| **Algorithm families** | Rate limiting approaches |
| **Testing** | Mock strategies |
| **Performance** | Optimize based on conditions |

---

## Built-in Strategies

### Rate Limiting Strategies

```python
from blossom_ai.utils.rate_limiter import TokenBucketRateLimiter

# Token bucket strategy (default)
limiter = TokenBucketRateLimiter(
    requests_per_minute=60,
    burst_capacity=10
)

# Different strategies for different use cases
slow_limiter = TokenBucketRateLimiter(requests_per_minute=10)   # Conservative
fast_limiter = TokenBucketRateLimiter(requests_per_minute=1000) # Aggressive
```

---

### Caching Strategies

```python
from blossom_ai.utils.cache import CacheManager, CacheBackend

# Memory strategy (fast, limited)
memory_cache = CacheManager(CacheConfig(backend=CacheBackend.MEMORY))

# Disk strategy (persistent, slower)
disk_cache = CacheManager(CacheConfig(backend=CacheBackend.DISK))

# Hybrid strategy (best of both)
hybrid_cache = CacheManager(CacheConfig(backend=CacheBackend.HYBRID))
```

---

## Creating Custom Strategies

### Strategy Interface

```python
from abc import ABC, abstractmethod
from typing import Any, Optional

class GenerationStrategy(ABC):
    """Abstract strategy for text generation."""
    
    @abstractmethod
    async def generate(self, prompt: str, **kwargs) -> str:
        """Generate text using this strategy."""
        pass
    
    @abstractmethod
    def get_name(self) -> str:
        """Get strategy name."""
        pass
    
    def supports_streaming(self) -> bool:
        """Check if strategy supports streaming."""
        return False
```

---

### Concrete Strategies

```python
class OpenAIStrategy(GenerationStrategy):
    """OpenAI text generation strategy."""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.name = "openai"
    
    async def generate(self, prompt: str, **kwargs) -> str:
        """Generate using OpenAI API."""
        # Implementation would call OpenAI API
        return f"OpenAI response to: {prompt}"
    
    def get_name(self) -> str:
        return self.name
    
    def supports_streaming(self) -> bool:
        return True

class GeminiStrategy(GenerationStrategy):
    """Gemini text generation strategy."""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.name = "gemini"
    
    async def generate(self, prompt: str, **kwargs) -> str:
        """Generate using Gemini API."""
        # Implementation would call Gemini API
        return f"Gemini response to: {prompt}"
    
    def get_name(self) -> str:
        return self.name

class ClaudeStrategy(GenerationStrategy):
    """Claude text generation strategy."""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.name = "claude"
    
    async def generate(self, prompt: str, **kwargs) -> str:
        """Generate using Claude API."""
        # Implementation would call Claude API
        return f"Claude response to: {prompt}"
    
    def get_name(self) -> str:
        return self.name

class MockStrategy(GenerationStrategy):
    """Mock strategy for testing."""
    
    def __init__(self):
        self.name = "mock"
    
    async def generate(self, prompt: str, **kwargs) -> str:
        """Return mock response."""
        return f"Mock response to: {prompt}"
    
    def get_name(self) -> str:
        return self.name
```

---

### Strategy Context

```python
class TextGeneratorWithStrategies:
    """Text generator that uses different strategies."""
    
    def __init__(self, config: SessionConfig):
        self.config = config
        self.strategies: Dict[str, GenerationStrategy] = {}
        self.default_strategy = "openai"
    
    def register_strategy(self, strategy: GenerationStrategy):
        """Register a generation strategy."""
        self.strategies[strategy.get_name()] = strategy
    
    def set_default_strategy(self, strategy_name: str):
        """Set default strategy."""
        if strategy_name not in self.strategies:
            raise ValueError(f"Unknown strategy: {strategy_name}")
        self.default_strategy = strategy_name
    
    def get_strategy(self, strategy_name: Optional[str] = None) -> GenerationStrategy:
        """Get strategy by name or default."""
        name = strategy_name or self.default_strategy
        
        if name not in self.strategies:
            raise ValueError(f"Strategy not found: {name}")
        
        return self.strategies[name]
    
    async def generate(
        self,
        prompt: str,
        strategy: Optional[str] = None,
        **kwargs
    ) -> str:
        """Generate text using specified strategy."""
        
        selected_strategy = self.get_strategy(strategy)
        return await selected_strategy.generate(prompt, **kwargs)
    
    def list_strategies(self) -> list:
        """List available strategies."""
        return list(self.strategies.keys())

# Usage
generator = TextGeneratorWithStrategies(config)

# Register strategies
generator.register_strategy(OpenAIStrategy("openai-key"))
generator.register_strategy(GeminiStrategy("gemini-key"))
generator.register_strategy(ClaudeStrategy("claude-key"))
generator.register_strategy(MockStrategy())

# Generate with different strategies
openai_result = await generator.generate("Hello", strategy="openai")
gemini_result = await generator.generate("Hello", strategy="gemini")
mock_result = await generator.generate("Hello", strategy="mock")

# Use default strategy
generator.set_default_strategy("gemini")
default_result = await generator.generate("Hello")  # Uses Gemini
```

---

## Advanced Strategy Patterns

### Strategy with Selection Logic

```python
class SmartStrategySelector:
    """Automatically selects best strategy based on input."""
    
    def __init__(self, generator: TextGeneratorWithStrategies):
        self.generator = generator
    
    def select_strategy(self, prompt: str, **kwargs) -> str:
        """Select best strategy for given prompt."""
        
        # Short prompts -> fast strategy
        if len(prompt) < 50:
            return "mock"  # For testing
        
        # Code generation -> Claude
        if any(word in prompt.lower() for word in ["code", "python", "function"]):
            return "claude"
        
        # Creative writing -> Gemini
        if any(word in prompt.lower() for word in ["story", "poem", "creative"]):
            return "gemini"
        
        # Technical questions -> OpenAI
        if any(word in prompt.lower() for word in ["explain", "how", "what"]):
            return "openai"
        
        # Default
        return self.generator.default_strategy
    
    async def generate_with_smart_selection(self, prompt: str, **kwargs) -> str:
        """Generate using automatically selected strategy."""
        
        strategy = self.select_strategy(prompt, **kwargs)
        return await self.generator.generate(prompt, strategy=strategy)

# Usage
selector = SmartStrategySelector(generator)

# Automatically selects best strategy
result1 = await selector.generate_with_smart_selection("Write Python code")
result2 = await selector.generate_with_smart_selection("Tell me a story")
result3 = await selector.generate_with_smart_selection("Explain quantum physics")
```

---

### Strategy with Fallback

```python
class FallbackStrategy:
    """Strategy that tries multiple approaches."""
    
    def __init__(self, generator: TextGeneratorWithStrategies):
        self.generator = generator
        self.primary_strategies = ["openai", "gemini", "claude"]
        self.fallback_strategy = "mock"
    
    async def generate_with_fallback(
        self,
        prompt: str,
        max_attempts: int = 3
    ) -> str:
        """Try multiple strategies until one succeeds."""
        
        # Try primary strategies
        for strategy in self.primary_strategies[:max_attempts]:
            try:
                return await self.generator.generate(prompt, strategy=strategy)
            except Exception as e:
                print(f"Strategy {strategy} failed: {e}")
                continue
        
        # Fallback to mock if all else fails
        return await self.generator.generate(prompt, strategy=self.fallback_strategy)

# Usage
fallback = FallbackStrategy(generator)

# Will try multiple strategies
result = await fallback.generate_with_fallback("Important task")
```

---

### Strategy with Load Balancing

```python
import asyncio
from typing import List

class LoadBalancedStrategy:
    """Distributes requests across multiple strategies."""
    
    def __init__(self, generator: TextGeneratorWithStrategies):
        self.generator = generator
        self.strategies = ["openai", "gemini", "claude"]
        self.current_index = 0
    
    def get_next_strategy(self) -> str:
        """Get next strategy in rotation."""
        strategy = self.strategies[self.current_index]
        self.current_index = (self.current_index + 1) % len(self.strategies)
        return strategy
    
    async def generate(self, prompt: str, **kwargs) -> str:
        """Generate using load-balanced strategy."""
        strategy = self.get_next_strategy()
        return await self.generator.generate(prompt, strategy=strategy)
    
    async def generate_batch(
        self,
        prompts: List[str],
        **kwargs
    ) -> List[str]:
        """Generate multiple prompts using load balancing."""
        
        tasks = []
        for prompt in prompts:
            strategy = self.get_next_strategy()
            task = self.generator.generate(prompt, strategy=strategy)
            tasks.append(task)
        
        return await asyncio.gather(*tasks)

# Usage
load_balancer = LoadBalancedStrategy(generator)

# Requests distributed across strategies
result1 = await load_balancer.generate("Task 1")  # Uses openai
result2 = await load_balancer.generate("Task 2")  # Uses gemini
result3 = await load_balancer.generate("Task 3")  # Uses claude
result4 = await load_balancer.generate("Task 4")  # Uses openai again

# Batch processing
prompts = ["Task 1", "Task 2", "Task 3", "Task 4", "Task 5"]
results = await load_balancer.generate_batch(prompts)
```

---

## Caching Strategies

### Strategy Interface

```python
from abc import ABC, abstractmethod
from typing import Any, Optional

class CacheStrategy(ABC):
    """Abstract cache strategy."""
    
    @abstractmethod
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        pass
    
    @abstractmethod
    async def set(self, key: str, value: Any, ttl: int = None) -> None:
        """Set value in cache."""
        pass
    
    @abstractmethod
    async def clear(self) -> None:
        """Clear all cached data."""
        pass
    
    @abstractmethod
    def get_name(self) -> str:
        """Get strategy name."""
        pass
```

---

### Concrete Cache Strategies

```python
class MemoryCacheStrategy(CacheStrategy):
    """In-memory caching strategy."""
    
    def __init__(self, max_size: int = 1000):
        self.max_size = max_size
        self.cache: Dict[str, Any] = {}
        self.timestamps: Dict[str, float] = {}
    
    async def get(self, key: str) -> Optional[Any]:
        if key in self.cache:
            # Check if expired (simplified)
            return self.cache[key]
        return None
    
    async def set(self, key: str, value: Any, ttl: int = None) -> None:
        # Simple implementation
        self.cache[key] = value
        
        # Enforce max size
        if len(self.cache) > self.max_size:
            # Remove oldest entry
            oldest_key = min(self.timestamps, key=self.timestamps.get)
            del self.cache[oldest_key]
            del self.timestamps[oldest_key]
    
    async def clear(self) -> None:
        self.cache.clear()
        self.timestamps.clear()
    
    def get_name(self) -> str:
        return "memory"

class DiskCacheStrategy(CacheStrategy):
    """File-based caching strategy."""
    
    def __init__(self, cache_dir: str = ".cache"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(exist_ok=True)
    
    async def get(self, key: str) -> Optional[Any]:
        cache_file = self.cache_dir / f"{key}.json"
        
        if cache_file.exists():
            try:
                import json
                with open(cache_file, "r") as f:
                    return json.load(f)
            except:
                return None
        
        return None
    
    async def set(self, key: str, value: Any, ttl: int = None) -> None:
        import json
        cache_file = self.cache_dir / f"{key}.json"
        
        with open(cache_file, "w") as f:
            json.dump(value, f)
    
    async def clear(self) -> None:
        import shutil
        shutil.rmtree(self.cache_dir)
        self.cache_dir.mkdir(exist_ok=True)
    
    def get_name(self) -> str:
        return "disk"

class NoCacheStrategy(CacheStrategy):
    """No caching strategy."""
    
    async def get(self, key: str) -> Optional[Any]:
        return None
    
    async def set(self, key: str, value: Any, ttl: int = None) -> None:
        pass
    
    async def clear(self) -> None:
        pass
    
    def get_name(self) -> str:
        return "none"
```

---

### Cache Strategy Context

```python
class CacheManagerWithStrategies:
    """Cache manager that uses different strategies."""
    
    def __init__(self):
        self.strategies: Dict[str, CacheStrategy] = {}
        self.default_strategy = "memory"
    
    def register_strategy(self, strategy: CacheStrategy):
        """Register cache strategy."""
        self.strategies[strategy.get_name()] = strategy
    
    def set_strategy(self, strategy_name: str):
        """Set active strategy."""
        if strategy_name not in self.strategies:
            raise ValueError(f"Unknown strategy: {strategy_name}")
        self.default_strategy = strategy_name
    
    def get_strategy(self, strategy_name: Optional[str] = None) -> CacheStrategy:
        """Get strategy by name or default."""
        name = strategy_name or self.default_strategy
        return self.strategies[name]
    
    async def get(self, key: str, strategy: Optional[str] = None) -> Optional[Any]:
        """Get from cache using specified strategy."""
        selected_strategy = self.get_strategy(strategy)
        return await selected_strategy.get(key)
    
    async def set(
        self,
        key: str,
        value: Any,
        strategy: Optional[str] = None,
        ttl: int = None
    ) -> None:
        """Set in cache using specified strategy."""
        selected_strategy = self.get_strategy(strategy)
        await selected_strategy.set(key, value, ttl)
    
    async def clear(self, strategy: Optional[str] = None) -> None:
        """Clear cache using specified strategy."""
        selected_strategy = self.get_strategy(strategy)
        await selected_strategy.clear()

# Usage
cache_manager = CacheManagerWithStrategies()

# Register strategies
cache_manager.register_strategy(MemoryCacheStrategy())
cache_manager.register_strategy(DiskCacheStrategy())
cache_manager.register_strategy(NoCacheStrategy())

# Use different strategies
cache_manager.set_strategy("memory")
await cache_manager.set("key1", "value1")

cache_manager.set_strategy("disk")
await cache_manager.set("key2", "value2")

# Explicit strategy selection
value = await cache_manager.get("key1", strategy="memory")
```

---

## Testing Strategies

### Unit Testing

```python
import pytest
from unittest.mock import Mock, AsyncMock

class TestGenerationStrategies:
    """Test generation strategies."""
    
    @pytest.mark.asyncio
    async def test_openai_strategy(self):
        strategy = OpenAIStrategy("test-key")
        
        result = await strategy.generate("Hello")
        
        assert result == "OpenAI response to: Hello"
        assert strategy.get_name() == "openai"
        assert strategy.supports_streaming() is True
    
    @pytest.mark.asyncio
    async def test_gemini_strategy(self):
        strategy = GeminiStrategy("test-key")
        
        result = await strategy.generate("Hello")
        
        assert result == "Gemini response to: Hello"
        assert strategy.get_name() == "gemini"
    
    @pytest.mark.asyncio
    async def test_mock_strategy(self):
        strategy = MockStrategy()
        
        result = await strategy.generate("Hello")
        
        assert result == "Mock response to: Hello"
        assert strategy.get_name() == "mock"

class TestStrategyContext:
    """Test strategy context."""
    
    @pytest.fixture
    def generator(self):
        from blossom_ai import SessionConfig
        return TextGeneratorWithStrategies(SessionConfig())
    
    @pytest.fixture
    def strategies(self, generator):
        strategies = [
            MockStrategy(),
            MockStrategy(),
            MockStrategy()
        ]
        
        for strategy in strategies:
            generator.register_strategy(strategy)
        
        return generator
    
    def test_register_strategy(self, generator):
        strategy = MockStrategy()
        generator.register_strategy(strategy)
        
        assert "mock" in generator.list_strategies()
    
    def test_set_default_strategy(self, strategies):
        strategies.set_default_strategy("mock")
        assert strategies.default_strategy == "mock"
    
    def test_get_strategy(self, strategies):
        strategy = strategies.get_strategy("mock")
        assert isinstance(strategy, MockStrategy)
    
    def test_get_strategy_default(self, strategies):
        strategies.set_default_strategy("mock")
        strategy = strategies.get_strategy()
        assert isinstance(strategy, MockStrategy)
    
    @pytest.mark.asyncio
    async def test_generate_with_strategy(self, strategies):
        result = await strategies.generate("Hello", strategy="mock")
        assert result == "Mock response to: Hello"
    
    @pytest.mark.asyncio
    async def test_generate_with_default_strategy(self, strategies):
        strategies.set_default_strategy("mock")
        result = await strategies.generate("Hello")
        assert result == "Mock response to: Hello"

class TestSmartStrategySelector:
    """Test smart strategy selector."""
    
    @pytest.fixture
    def selector(self):
        from blossom_ai import SessionConfig
        generator = TextGeneratorWithStrategies(SessionConfig())
        
        # Register mock strategies
        generator.register_strategy(MockStrategy())
        generator.register_strategy(MockStrategy())
        generator.register_strategy(MockStrategy())
        
        return SmartStrategySelector(generator)
    
    def test_select_strategy_short_prompt(self, selector):
        strategy = selector.select_strategy("Hi")
        assert strategy == "mock"
    
    def test_select_strategy_code_prompt(self, selector):
        strategy = selector.select_strategy("Write Python code")
        assert strategy == "claude"
    
    def test_select_strategy_creative_prompt(self, selector):
        strategy = selector.select_strategy("Write a story about AI")
        assert strategy == "gemini"
    
    def test_select_strategy_technical_prompt(self, selector):
        strategy = selector.select_strategy("Explain quantum physics")
        assert strategy == "openai"
```

---

### Integration Testing

```python
@pytest.mark.asyncio
async def test_strategy_integration():
    """Test strategies in real scenario."""
    
    from blossom_ai import SessionConfig, TextGeneratorWithStrategies
    
    # Setup
    config = SessionConfig(test_mode=True)
    generator = TextGeneratorWithStrategies(config)
    
    # Register test strategies
    generator.register_strategy(MockStrategy())
    generator.register_strategy(MockStrategy())
    
    # Test different strategies
    result1 = await generator.generate("Test 1", strategy="mock")
    result2 = await generator.generate("Test 2", strategy="mock")
    
    assert result1 == "Mock response to: Test 1"
    assert result2 == "Mock response to: Test 2"

@pytest.mark.asyncio
async def test_load_balancing_integration():
    """Test load balancing strategy."""
    
    from blossom_ai import SessionConfig, TextGeneratorWithStrategies
    
    # Setup
    config = SessionConfig(test_mode=True)
    generator = TextGeneratorWithStrategies(config)
    load_balancer = LoadBalancedStrategy(generator)
    
    # Register mock strategies with different names
    mock1 = MockStrategy()
    mock1.name = "strategy1"
    mock2 = MockStrategy()
    mock2.name = "strategy2"
    
    generator.register_strategy(mock1)
    generator.register_strategy(mock2)
    load_balancer.strategies = ["strategy1", "strategy2"]
    
    # Test load balancing
    results = await load_balancer.generate_batch([
        "Test 1", "Test 2", "Test 3", "Test 4"
    ])
    
    assert len(results) == 4
    assert all("Mock response" in result for result in results)
```

---

## Best Practices

### 1. Keep Strategies Focused

```python
# Good: Single responsibility
class ImageGenerationStrategy:
    def generate_image(self, prompt: str) -> bytes:
        pass

# Bad: Too many responsibilities
class UniversalStrategy:
    def generate_text(self, prompt: str) -> str:
        pass
    
    def generate_image(self, prompt: str) -> bytes:
        pass
    
    def analyze_image(self, image: bytes) -> str:
        pass
```

---

### 2. Use Protocols/Interfaces

```python
from typing import Protocol

class GenerationStrategy(Protocol):
    def generate(self, prompt: str) -> str:
        ...

# Any class with this method works
class MyStrategy:
    def generate(self, prompt: str) -> str:
        return f"Generated: {prompt}"
```

---

### 3. Make Strategies Stateless

```python
# Good: Stateless
class StatelessStrategy:
    def generate(self, prompt: str) -> str:
        # No internal state
        return f"Response: {prompt}"

# Bad: Stateful
class StatefulStrategy:
    def __init__(self):
        self.history = []  # State builds up
    
    def generate(self, prompt: str) -> str:
        self.history.append(prompt)
        return f"Response: {prompt}"
```

---

### 4. Document Strategy Behavior

```python
class DocumentedStrategy:
    """
    Strategy for creative text generation.
    
    Best for:
        - Stories and narratives
        - Poetry
        - Creative writing
    
    Not suitable for:
        - Technical documentation
        - Code generation
        - Factual content
    """
    
    def generate(self, prompt: str) -> str:
        """Generate creative text."""
        pass
```

---

### 5. Handle Strategy Failures

```python
class RobustStrategy:
    def generate(self, prompt: str) -> str:
        try:
            # Main logic
            return self._do_generation(prompt)
        except Exception as e:
            # Fallback behavior
            return f"Error generating response: {e}"
```

---

### 6. Test All Strategies

```python
@pytest.mark.parametrize("strategy", [
    OpenAIStrategy("key"),
    GeminiStrategy("key"),
    ClaudeStrategy("key")
])
async def test_all_strategies(strategy):
    result = await strategy.generate("Test")
    assert result is not None
    assert len(result) > 0
```

---

## See Also

- [Factory Pattern](FACTORY_PATTERN.md) - Object creation
- [Builder Pattern](BUILDER_PATTERN.md) - Complex configurations
- [Singleton Pattern](SINGLETON_PATTERN.md) - Shared instances
- [Custom Components](CUSTOM_COMPONENTS.md) - Creating custom implementations
- [Architecture Overview](ARCHITECTURE.md) - Design principles