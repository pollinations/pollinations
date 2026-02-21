# 📖 Complete API Reference

> Comprehensive reference for all Blossom AI classes, methods, and parameters

---

## 🌸 BlossomClient

### Class: `BlossomClient`

Main client class for all AI operations.

```python
BlossomClient(
    config: Optional[ConfigProtocol] = None,
    http_client: Optional[HttpClientProtocol] = None,
    logger: Optional[LoggerProtocol] = None,
    rate_limiter: Optional[RateLimiterInterface] = None,
    cache: Optional[CacheBackendProtocol] = None
)
```

**Parameters:**
- `config` (ConfigProtocol, optional): Configuration object
- `http_client` (HttpClientProtocol, optional): Custom HTTP client
- `logger` (LoggerProtocol, optional): Custom logger
- `rate_limiter` (RateLimiterInterface, optional): Custom rate limiter
- `cache` (CacheBackendProtocol, optional): Custom cache backend

**Example:**
```python
from blossom_ai import BlossomClient

with BlossomClient() as client:
    response = client.text.generate("Hello world")
```

### Methods

#### `close()`

Close all underlying resources.

```python
async def close() -> None
```

**Example:**
```python
client = BlossomClient()
await client.close()
```

#### `get_stats()`

Get client statistics including cache and rate limiter stats.

```python
def get_stats(self) -> Dict[str, Any]
```

**Returns:**
- Dictionary with `rate_limiter` and `cache` statistics

**Example:**
```python
stats = client.get_stats()
print(stats["cache"]["hit_rate"])
```

---

## 🎨 Image Generation

### Class: `ImageGenerator`

Handles image generation operations.

```python
ImageGenerator(
    config: ConfigProtocol,
    http_client: HttpClientProtocol,
    logger: LoggerProtocol,
    rate_limiter: RateLimiterInterface,
    cache: Optional[CacheBackendProtocol] = None
)
```

### Methods

#### `generate()`

Generate an image from a text prompt.

```python
def generate(
    self,
    prompt: str,
    width: int = 1024,
    height: int = 1024,
    quality: str = "standard",
    guidance_scale: float = 7.5,
    negative_prompt: Optional[str] = None,
    seed: Optional[int] = None,
    model: str = "dall-e-3",
    style: str = "vivid",
    response_format: str = "url",
    n: int = 1,
    **kwargs
) -> Union[ImageObject, List[ImageObject]]
```

**Parameters:**
- `prompt` (str): Text description of the image
- `width` (int): Image width in pixels (default: 1024)
- `height` (int): Image height in pixels (default: 1024)
- `quality` (str): Image quality - "standard" or "hd" (default: "standard")
- `guidance_scale` (float): How closely to follow the prompt (default: 7.5)
- `negative_prompt` (str): What to avoid in the image (optional)
- `seed` (int): Random seed for reproducibility (optional)
- `model` (str): Model to use - "dall-e-3" or "dall-e-2" (default: "dall-e-3")
- `style` (str): Style - "vivid" or "natural" (default: "vivid")
- `response_format` (str): Format - "url" or "b64_json" (default: "url")
- `n` (int): Number of images to generate (default: 1)

**Returns:**
- `ImageObject` if n=1
- `List[ImageObject]` if n>1

**Example:**
```python
image = client.image.generate(
    "a beautiful sunset",
    width=1920,
    height=1080,
    quality="hd"
)
```

---

## 💬 Text Generation

### Class: `TextGenerator`

Handles text generation and chat operations.

```python
TextGenerator(
    config: ConfigProtocol,
    http_client: HttpClientProtocol,
    logger: LoggerProtocol,
    rate_limiter: RateLimiterInterface,
    cache: Optional[CacheBackendProtocol] = None
)
```

### Methods

#### `generate()`

Generate text from a prompt.

```python
def generate(
    self,
    prompt: str,
    model: str = "gpt-4",
    max_tokens: int = 1000,
    temperature: float = 0.7,
    top_p: float = 1.0,
    frequency_penalty: float = 0.0,
    presence_penalty: float = 0.0,
    stop: Optional[List[str]] = None,
    stream: bool = False,
    response_format: str = "text",
    **kwargs
) -> Union[TextResponse, AsyncIterator[TextChunk]]
```

**Parameters:**
- `prompt` (str): Input text prompt
- `model` (str): Model to use (default: "gpt-4")
- `max_tokens` (int): Maximum tokens in response (default: 1000)
- `temperature` (float): Creativity vs predictability (default: 0.7)
- `top_p` (float): Nucleus sampling parameter (default: 1.0)
- `frequency_penalty` (float): Repetition penalty (default: 0.0)
- `presence_penalty` (float): Topic diversity penalty (default: 0.0)
- `stop` (List[str]): Stop sequences (optional)
- `stream` (bool): Enable streaming (default: False)
- `response_format` (str): "text" or "json_object" (default: "text")

**Returns:**
- `TextResponse` if stream=False
- `AsyncIterator[TextChunk]` if stream=True

**Example:**
```python
response = client.text.generate(
    "explain quantum computing",
    max_tokens=500,
    temperature=0.5
)
```

#### `chat()`

Chat completion with conversation history.

```python
def chat(
    self,
    messages: List[Dict[str, str]],
    model: str = "gpt-4",
    max_tokens: int = 1000,
    temperature: float = 0.7,
    top_p: float = 1.0,
    frequency_penalty: float = 0.0,
    presence_penalty: float = 0.0,
    stop: Optional[List[str]] = None,
    stream: bool = False,
    **kwargs
) -> Union[TextResponse, AsyncIterator[TextChunk]]
```

**Parameters:**
- `messages` (List[Dict]): List of message dictionaries with 'role' and 'content'
- Other parameters same as `generate()`

**Example:**
```python
messages = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is Python?"}
]

response = client.text.chat(messages)
```

---

## 👁️ Vision Analysis

### Class: `VisionGenerator`

Handles image analysis and comparison.

```python
VisionGenerator(
    config: ConfigProtocol,
    http_client: HttpClientProtocol,
    logger: LoggerProtocol,
    rate_limiter: RateLimiterInterface,
    cache: Optional[CacheBackendProtocol] = None
)
```

### Methods

#### `analyze()`

Analyze an image with a text prompt.

```python
def analyze(
    self,
    image_url: Optional[str] = None,
    image_path: Optional[str] = None,
    image_bytes: Optional[bytes] = None,
    prompt: str = "describe this image",
    detail: str = "auto",
    max_tokens: int = 300,
    model: str = "gpt-4-vision-preview",
    temperature: float = 0.3,
    **kwargs
) -> VisionAnalysis
```

**Parameters:**
- `image_url` (str): URL of the image (optional)
- `image_path` (str): Local file path (optional)
- `image_bytes` (bytes): Raw image bytes (optional)
- `prompt` (str): Analysis prompt (default: "describe this image")
- `detail` (str): Detail level - "low", "high", "auto" (default: "auto")
- `max_tokens` (int): Maximum response tokens (default: 300)
- `model` (str): Model to use (default: "gpt-4-vision-preview")
- `temperature` (float): Response creativity (default: 0.3)

**Example:**
```python
analysis = client.vision.analyze(
    image_url="https://example.com/photo.jpg",
    prompt="what objects are in this image?"
)
```

#### `compare()`

Compare two images.

```python
def compare(
    self,
    image1_url: Optional[str] = None,
    image2_url: Optional[str] = None,
    image1_path: Optional[str] = None,
    image2_path: Optional[str] = None,
    prompt: str = "compare these images",
    **kwargs
) -> VisionComparison
```

**Parameters:**
- Image parameters same as `analyze()`
- `prompt` (str): Comparison prompt

**Example:**
```python
comparison = client.vision.compare(
    image1_url="https://example.com/img1.jpg",
    image2_url="https://example.com/img2.jpg",
    prompt="find the differences"
)
```

---

## ⚙️ Configuration

### Class: `SessionConfig`

Configuration for Blossom AI client.

```python
SessionConfig(
    api_key: str = "",
    base_url: str = "https://api.blossom-ai.com",
    timeout: float = 30.0,
    rate_limit_per_minute: int = 60,
    cache_enabled: bool = False,
    cache_backend: str = "memory",
    cache_ttl: int = 3600,
    max_file_size_mb: int = 10,
    connection_pool_size: int = 20,
    **kwargs
)
```

**Parameters:**
- `api_key` (str): API key for authentication
- `base_url` (str): Base API URL
- `timeout` (float): Request timeout in seconds
- `rate_limit_per_minute` (int): Rate limit per minute
- `cache_enabled` (bool): Enable caching
- `cache_backend` (str): Cache backend type
- `cache_ttl` (int): Cache TTL in seconds
- `max_file_size_mb` (int): Maximum file size in MB
- `connection_pool_size` (int): HTTP connection pool size

**Methods:**

#### `from_env()`

Load configuration from environment variables.

```python
@classmethod
def from_env(cls) -> SessionConfig
```

**Example:**
```python
config = SessionConfig.from_env()
```

---

## 💾 Caching

### Class: `CacheManager`

Manages cache operations.

```python
CacheManager(config: CacheConfig)
```

**Methods:**

#### `get()`

Get value from cache.

```python
def get(self, key: str) -> Optional[Any]
```

#### `set()`

Set value in cache.

```python
def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None
```

#### `delete()`

Delete value from cache.

```python
def delete(self, key: str) -> None
```

#### `clear()`

Clear all cache.

```python
def clear(self) -> None
```

#### `get_stats()`

Get cache statistics.

```python
def get_stats(self) -> CacheStats
```

### Class: `CacheConfig`

Cache configuration.

```python
CacheConfig(
    backend: str = "memory",
    max_size: int = 1000,
    ttl: int = 3600,
    cache_dir: Optional[str] = None,
    host: Optional[str] = None,
    port: Optional[int] = None,
    database: int = 0,
    password: Optional[str] = None,
    ssl: bool = False,
    eviction_policy: str = "lru"
)
```

---

## 📝 Logging

### Class: `StructuredLogger`

Structured logging with correlation IDs.

```python
StructuredLogger(name: str)
```

**Methods:**

#### `info()`

Log info message.

```python
def info(self, msg: str, **kwargs) -> None
```

#### `warning()`

Log warning message.

```python
def warning(self, msg: str, **kwargs) -> None
```

#### `error()`

Log error message.

```python
def error(self, msg: str, **kwargs) -> None
```

#### `debug()`

Log debug message.

```python
def debug(self, msg: str, **kwargs) -> None
```

---

## ❌ Error Types

### Class: `BlossomError`

Base exception for all Blossom AI errors.

```python
BlossomError(message: str, code: Optional[str] = None)
```

### Class: `ValidationError`

Raised when input validation fails.

```python
ValidationError(message: str, field: Optional[str] = None)
```

### Class: `AuthenticationError`

Raised when authentication fails.

```python
AuthenticationError(message: str = "Invalid API key")
```

### Class: `RateLimitError`

Raised when rate limit is exceeded.

```python
RateLimitError(message: str = "Rate limit exceeded", retry_after: Optional[int] = None)
```

### Class: `NetworkError`

Raised when network request fails.

```python
NetworkError(message: str, status_code: Optional[int] = None)
```

### Class: `TimeoutError`

Raised when request times out.

```python
TimeoutError(message: str = "Request timeout")
```

---

## 🎓 Response Types

### Class: `ImageObject`

Represents a generated image.

**Properties:**
- `url` (str): Image URL
- `b64_json` (str): Base64 encoded image
- `revised_prompt` (str): Revised prompt used
- `size` (str): Image size

**Methods:**

#### `save()`

Save image to file.

```python
def save(self, path: str, format: str = "PNG") -> None
```

#### `bytes`

Get image as bytes.

```python
@property
def bytes(self) -> bytes
```

### Class: `TextResponse`

Represents a text generation response.

**Properties:**
- `text` (str): Generated text
- `prompt_tokens` (int): Number of prompt tokens
- `completion_tokens` (int): Number of completion tokens
- `total_tokens` (int): Total tokens used
- `model` (str): Model used
- `finish_reason` (str): Reason generation stopped

### Class: `VisionAnalysis`

Represents image analysis results.

**Properties:**
- `description` (str): Image description
- `objects` (List[str]): Detected objects
- `colors` (List[str]): Color analysis
- `text` (str): Extracted text
- `style` (str): Style analysis

---

## 🔧 Utilities

### Function: `set_correlation_id()`

Set correlation ID for logging.

```python
def set_correlation_id(correlation_id: str) -> None
```

### Function: `get_correlation_id()`

Get current correlation ID.

```python
def get_correlation_id() -> Optional[str]
```

### Function: `validate_file_path()`

Validate file path for security.

```python
def validate_file_path(file_path: str) -> bool
```

### Function: `sanitize_filename()`

Sanitize filename for safe usage.

```python
def sanitize_filename(filename: str) -> str
```

---

## 🚀 Examples

### Complete Example

```python
import asyncio
from blossom_ai import BlossomClient, SessionConfig
from blossom_ai.utils.cache import CacheConfig, CacheManager

async def main():
    # Configuration
    config = SessionConfig(
        api_key="your-api-key",
        cache_enabled=True,
        rate_limit_per_minute=60
    )
    
    # Custom cache
    cache_config = CacheConfig(
        backend="memory",
        max_size=1000,
        ttl=3600
    )
    cache = CacheManager(cache_config)
    
    # Use client
    async with BlossomClient(config=config, cache=cache) as client:
        # Generate image
        image = await client.image.generate(
            "a beautiful landscape",
            width=1920,
            height=1080,
            quality="hd"
        )
        
        # Generate text
        response = await client.text.generate(
            "describe this image",
            max_tokens=500
        )
        
        # Get statistics
        stats = client.get_stats()
        print(f"Cache hit rate: {stats['cache']['hit_rate']:.2%}")

# Run
asyncio.run(main())
```

---

## 📚 See Also

- [🎓 Tutorial](TUTORIAL.md)
- [🎨 Image Generation](IMAGE_GENERATION.md)
- [💬 Text Generation](TEXT_GENERATION.md)
- [👁️ Vision Analysis](VISION.md)
- [🏗️ Architecture](ARCHITECTURE.md)
