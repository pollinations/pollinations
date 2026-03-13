# ❌ Error Types Reference

> **Complete reference for all error classes in Blossom AI**

---

## Overview

Blossom AI provides a comprehensive error handling system with specific error types for different failure scenarios. All errors inherit from the base `BlossomError` class.

---

## Error Hierarchy

```
BlossomError (base)
├── AuthenticationError
├── RateLimitError
├── ValidationError
├── ConfigurationError
├── TimeoutError
├── NetworkError
├── APIError
├── StreamError
├── EmptyResponseError
├── FileTooLargeError
├── Blossom520Error
├── PaymentError
└── APISchemaError
```

---

## Base Error Class

### `BlossomError`

Base class for all Blossom AI errors.

```python
from blossom_ai import BlossomError

error = BlossomError(
    message: str,
    error_type: ErrorType = ErrorType.UNKNOWN,
    suggestion: Optional[str] = None,
    context: Optional[ErrorContext] = None,
    original_error: Optional[Exception] = None,
    retry_after: Optional[int] = None
)
```

**Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `message` | `str` | Human-readable error message |
| `error_type` | `ErrorType` | Categorized error type |
| `suggestion` | `str` | Recommended action |
| `context` | `ErrorContext` | Detailed context information |
| `original_error` | `Exception` | Original underlying exception |
| `retry_after` | `int` | Seconds to wait before retry |

**Example:**
```python
try:
    result = await client.text.generate("Test")
except BlossomError as e:
    print(f"Error: {e.message}")
    print(f"Type: {e.error_type}")
    print(f"Suggestion: {e.suggestion}")
    
    if e.context:
        print(f"Context: {e.context}")
    
    if e.retry_after:
        print(f"Retry after: {e.retry_after}s")
```

---

## Authentication Errors

### `AuthenticationError`

Raised when authentication fails.

**Common Causes:**
- Missing API key
- Invalid API key
- Expired API key

**Example:**
```python
from blossom_ai import AuthenticationError

try:
    client = BlossomClient()  # No API key provided
    result = await client.text.generate("Test")
except AuthenticationError as e:
    print(f"Authentication failed: {e}")
    print(f"Suggestion: {e.suggestion}")  # Check API key
```

**Attributes:**
- `error_type`: `ErrorType.AUTH`
- `suggestion`: "Check your API token or set the POLLINATIONS_API_KEY environment variable"

---

## Rate Limiting Errors

### `RateLimitError`

Raised when rate limit is exceeded.

**Common Causes:**
- Too many requests
- Burst traffic
- Inefficient polling

**Example:**
```python
from blossom_ai import RateLimitError

try:
    # Make many rapid requests
    for i in range(1000):
        result = await client.text.generate(f"Request {i}")
except RateLimitError as e:
    print(f"Rate limited! Wait {e.retry_after} seconds")
    await asyncio.sleep(e.retry_after)
```

**Attributes:**
- `error_type`: `ErrorType.RATE_LIMIT`
- `retry_after`: Seconds to wait (from API response)
- `suggestion`: "Rate limit exceeded. Retry after X seconds"

**Handling Strategies:**
```python
import asyncio

async def handle_rate_limits():
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            return await client.text.generate("Test")
        except RateLimitError as e:
            if attempt < max_retries - 1:
                print(f"Rate limited, waiting {e.retry_after}s...")
                await asyncio.sleep(e.retry_after)
            else:
                raise
```

---

## Validation Errors

### `ValidationError`

Raised when request parameters are invalid.

**Common Causes:**
- Invalid parameter values
- Missing required parameters
- Type mismatches
- Range violations

**Example:**
```python
from blossom_ai import ValidationError

try:
    # Invalid image dimensions
    image = await client.image.generate(
        "Test",
        width=-100,  # Negative width
        height=0     # Zero height
    )
except ValidationError as e:
    print(f"Validation failed: {e}")
    print(f"Fix parameters and try again")
```

**Attributes:**
- `error_type`: `ErrorType.INVALID_PARAM`
- `suggestion`: "Check the documentation for valid parameter values"

**Common Validation Rules:**
```python
# Image generation
width: 64 <= width <= 2048
height: 64 <= height <= 2048
quality: quality in ["normal", "hd"]
model: model in available_models()

# Text generation
temperature: 0.0 <= temperature <= 2.0
top_p: 0.0 <= top_p <= 1.0
max_tokens: max_tokens > 0
prompt: len(prompt) > 0
```

---

## Configuration Errors

### `ConfigurationError`

Raised when configuration is invalid.

**Common Causes:**
- Invalid config values
- Missing required settings
- Incompatible options

**Example:**
```python
from blossom_ai import ConfigurationError, SessionConfig

try:
    # Invalid timeout
    config = SessionConfig(timeout=-5.0)
except ConfigurationError as e:
    print(f"Configuration invalid: {e}")
    print(f"Fix: Use positive timeout value")
```

**Attributes:**
- `error_type`: `ErrorType.CONFIG`
- `suggestion`: "Check your configuration values"

---

## Timeout Errors

### `TimeoutError`

Raised when request times out.

**Common Causes:**
- Network issues
- Slow server response
- Timeout set too low

**Example:**
```python
from blossom_ai import TimeoutError, SessionConfig

try:
    # Very short timeout
    config = SessionConfig(timeout=0.1)
    async with BlossomClient(config=config) as client:
        result = await client.text.generate("Long running task")
except TimeoutError as e:
    print(f"Request timed out: {e}")
    print(f"Suggestion: {e.suggestion}")  # Increase timeout
```

**Attributes:**
- `error_type`: `ErrorType.TIMEOUT`
- `suggestion`: "Increase timeout value or check network connection"

**Solutions:**
```python
# Increase timeout
config = SessionConfig(timeout=120.0)

# Use streaming for long operations
async for chunk in await client.text.generate(
    "Long task...",
    stream=True
):
    process(chunk)
```

---

## Network Errors

### `NetworkError`

Raised when network connection fails.

**Common Causes:**
- No internet connection
- DNS resolution failure
- Firewall blocking
- Proxy issues

**Example:**
```python
from blossom_ai import NetworkError

try:
    # Simulate network failure
    result = await client.text.generate("Test")
except NetworkError as e:
    print(f"Network error: {e}")
    print(f"Check your internet connection")
```

**Attributes:**
- `error_type`: `ErrorType.NETWORK`
- `suggestion`: "Check your network connection and try again"

**Debugging:**
```python
import requests

def test_network():
    try:
        response = requests.get("https://gen.pollinations.ai", timeout=5)
        print("✅ Network connectivity OK")
        return True
    except:
        print("❌ Network connectivity failed")
        return False
```

---

## API Errors

### `APIError`

Generic API-related error.

**Common Causes:**
- Server errors (5xx status codes)
- Unexpected API responses
- Service outages

**Example:**
```python
from blossom_ai import APIError

try:
    result = await client.text.generate("Test")
except APIError as e:
    print(f"API error: {e}")
    if e.context and e.context.status_code:
        print(f"Status code: {e.context.status_code}")
```

**Attributes:**
- `error_type`: `ErrorType.API`
- `suggestion`: "API temporarily unavailable. Try again later"

---

## Stream Errors

### `StreamError`

Raised when streaming response fails.

**Common Causes:**
- Network interruption during stream
- Server disconnects
- Invalid stream data

**Example:**
```python
from blossom_ai import StreamError

try:
    async for chunk in await client.text.generate(
        "Long story...",
        stream=True
    ):
        print(chunk, end="")
except StreamError as e:
    print(f"\nStream failed: {e}")
    print("Attempting to recover...")
```

**Attributes:**
- `error_type`: `ErrorType.STREAM`
- `suggestion`: "Stream interrupted. Retry the request"

---

## Empty Response Errors

### `EmptyResponseError`

Raised when API returns empty response.

**Common Causes:**
- Model returns empty string
- Filtering removes all content
- Processing error

**Example:**
```python
from blossom_ai import EmptyResponseError

try:
    result = await client.text.generate(
        "",  # Empty prompt
        max_tokens=0  # No tokens allowed
    )
except EmptyResponseError as e:
    print(f"Empty response: {e}")
    print("Try adjusting parameters")
```

**Attributes:**
- `error_type`: `ErrorType.EMPTY_RESPONSE`
- `suggestion`: "Model returned empty response. Try different parameters"

---

## File Errors

### `FileTooLargeError`

Raised when file exceeds size limit.

**Common Causes:**
- Image > 10MB
- Upload size exceeded

**Example:**
```python
from blossom_ai import FileTooLargeError

try:
    # Large image file
    with open("huge_image.jpg", "rb") as f:
        image_data = f.read()  # > 10MB
    
    result = await client.image.generate("Test", image_data=image_data)
except FileTooLargeError as e:
    print(f"File too large: {e}")
    print("Compress or resize the image")
```

**Attributes:**
- `error_type`: `ErrorType.FILE_TOO_LARGE`
- `suggestion`: "Reduce file size or use compression"

---

## Cloudflare Errors

### `Blossom520Error`

Raised when Cloudflare returns 520 error.

**Common Causes:**
- Cloudflare configuration issue
- Origin server problem
- Temporary Cloudflare issue

**Example:**
```python
from blossom_ai import Blossom520Error

try:
    result = await client.text.generate("Test")
except Blossom520Error as e:
    print(f"Cloudflare error: {e}")
    print("Usually temporary - will retry")
    
    # Wait and retry
    await asyncio.sleep(10)
    return await client.text.generate("Test")
```

**Attributes:**
- `error_type`: `ErrorType.HTTP_520`
- `suggestion`: "Temporary server issue. Try again in a few moments"

---

## Payment Errors

### `PaymentError`

Raised when payment is required.

**Common Causes:**
- Insufficient credits
- Payment method issue
- Billing problem

**Example:**
```python
from blossom_ai import PaymentError

try:
    result = await client.text.generate("Test")
except PaymentError as e:
    print(f"Payment required: {e}")
    print(f"Visit: {e.suggestion}")
```

**Attributes:**
- `error_type`: `ErrorType.PAYMENT_REQUIRED`
- `suggestion`: "Visit pollinations.ai to add credits"

---

## Schema Errors

### `APISchemaError`

Raised when API response format is unexpected.

**Common Causes:**
- API version mismatch
- Breaking API change
- Unexpected response structure

**Example:**
```python
from blossom_ai import APISchemaError

try:
    result = await client.text.generate("Test")
except APISchemaError as e:
    print(f"API format changed: {e}")
    print("Update Blossom AI SDK")
```

**Attributes:**
- `error_type`: `ErrorType.INVALID_PARAM`
- `suggestion`: "Update to latest SDK version"

---

## Error Context

### `ErrorContext`

Provides detailed context about errors.

```python
from blossom_ai import ErrorContext

context = ErrorContext(
    operation: str,
    url: Optional[str] = None,
    method: Optional[str] = None,
    status_code: Optional[int] = None,
    request_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
)
```

**Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `operation` | `str` | Operation being performed |
| `url` | `str` | Request URL |
| `method` | `str` | HTTP method |
| `status_code` | `int` | HTTP status code |
| `request_id` | `str` | Request ID for debugging |
| `metadata` | `dict` | Additional metadata |

**Example:**
```python
try:
    result = await client.text.generate("Test")
except BlossomError as e:
    if e.context:
        print(f"Operation: {e.context.operation}")
        print(f"URL: {e.context.url}")
        print(f"Status: {e.context.status_code}")
        print(f"Request ID: {e.context.request_id}")
```

---

## Error Types Enum

### `ErrorType`

```python
from blossom_ai.core.errors import ErrorType

class ErrorType:
    UNKNOWN = "unknown"
    AUTH = "authentication"
    RATE_LIMIT = "rate_limit"
    INVALID_PARAM = "invalid_parameter"
    CONFIG = "configuration"
    TIMEOUT = "timeout"
    NETWORK = "network"
    API = "api"
    STREAM = "stream"
    EMPTY_RESPONSE = "empty_response"
    FILE_TOO_LARGE = "file_too_large"
    HTTP_520 = "http_520"
    PAYMENT_REQUIRED = "payment_required"
```

---

## Error Handling Patterns

### 1. Comprehensive Error Handling

```python
from blossom_ai import (
    AuthenticationError, RateLimitError, ValidationError,
    TimeoutError, NetworkError, EmptyResponseError,
    FileTooLargeError, BlossomError
)

async def comprehensive_handler():
    try:
        result = await client.text.generate("Test")
        return result
    
    except AuthenticationError:
        print("❌ Check API key")
        return None
    
    except RateLimitError as e:
        print(f"⏱️  Rate limited, waiting {e.retry_after}s...")
        await asyncio.sleep(e.retry_after)
        return await client.text.generate("Test")
    
    except ValidationError as e:
        print(f"⚠️  Invalid parameters: {e}")
        return None
    
    except TimeoutError:
        print("⏰ Request timed out")
        return await client.text.generate("Test (shorter)")
    
    except NetworkError:
        print("🌐 Network error - check connection")
        return None
    
    except EmptyResponseError:
        print("📝 Empty response - try different parameters")
        return "[No response generated]"
    
    except FileTooLargeError:
        print("📁 File too large - compress and retry")
        return None
    
    except BlossomError as e:
        print(f"❌ Unexpected error: {e}")
        if e.context:
            print(f"   Context: {e.context}")
        return None
```

---

### 2. Retry Logic

```python
import asyncio
from functools import wraps

def retry_on_errors(errors, max_retries=3, backoff_factor=2):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except tuple(errors) as e:
                    if attempt < max_retries - 1:
                        wait_time = backoff_factor ** attempt
                        print(f"Error {type(e).__name__}, retrying in {wait_time}s...")
                        await asyncio.sleep(wait_time)
                    else:
                        raise
        return wrapper
    return decorator

@retry_on_errors([RateLimitError, TimeoutError, NetworkError], max_retries=3)
async def reliable_generate(prompt):
    return await client.text.generate(prompt)
```

---

### 3. Error Recovery

```python
async def error_recovery_example():
    """Example of recovering from different error types."""
    
    try:
        # Try primary model
        return await client.text.generate("Test", model="openai")
    except (RateLimitError, TimeoutError):
        # Fallback to secondary model
        try:
            return await client.text.generate("Test", model="gemini")
        except Exception:
            # Final fallback to cached response
            return get_cached_response("Test")
    except AuthenticationError:
        # Use free tier
        return await client.text.generate("Test (free)")
```

---

### 4. Error Logging

```python
import logging

def log_error(error, level=logging.ERROR):
    """Log error with full context."""
    
    logger = logging.getLogger("blossom_ai")
    
    if isinstance(error, BlossomError):
        logger.log(level, f"Blossom AI Error: {error.message}")
        logger.log(level, f"Error Type: {error.error_type}")
        
        if error.suggestion:
            logger.log(level, f"Suggestion: {error.suggestion}")
        
        if error.context:
            logger.log(level, f"Context: {error.context.to_dict()}")
        
        if error.original_error:
            logger.log(level, f"Original Error: {error.original_error}")
    else:
        logger.log(level, f"Unexpected Error: {error}", exc_info=True)

# Usage
try:
    result = await client.text.generate("Test")
except Exception as e:
    log_error(e)
```

---

### 5. Error Monitoring

```python
class ErrorMonitor:
    def __init__(self):
        self.error_counts = {}
        self.error_history = []
    
    def record_error(self, error):
        error_type = type(error).__name__
        self.error_counts[error_type] = self.error_counts.get(error_type, 0) + 1
        
        self.error_history.append({
            "type": error_type,
            "timestamp": time.time(),
            "message": str(error)
        })
    
    def get_stats(self):
        return {
            "total_errors": len(self.error_history),
            "error_counts": self.error_counts,
            "recent_errors": self.error_history[-10:]
        }

# Usage
monitor = ErrorMonitor()

try:
    result = await client.text.generate("Test")
except Exception as e:
    monitor.record_error(e)
    
    # Check if errors are spiking
    stats = monitor.get_stats()
    if stats["total_errors"] > 10:
        print("⚠️  Error rate is high - investigate")
```

---

## Best Practices

### 1. Always Catch Specific Errors First

```python
# Good: Specific to general
try:
    result = await client.text.generate("Test")
except AuthenticationError:
    # Handle auth first
    pass
except RateLimitError:
    # Then rate limits
    pass
except BlossomError:
    # Then general errors
    pass

# Bad: Catching general first
try:
    result = await client.text.generate("Test")
except Exception:
    # Too broad - can't handle specifically
    pass
```

---

### 2. Use Error Context

```python
try:
    result = await client.text.generate("Test")
except BlossomError as e:
    if e.context:
        # Log full context for debugging
        logger.error(f"Error context: {e.context.to_dict()}")
        
        # Use context for decisions
        if e.context.status_code == 503:
            # Service unavailable - wait longer
            await asyncio.sleep(60)
```

---

### 3. Provide Meaningful Fallbacks

```python
async def robust_generation(prompt):
    try:
        # Try with all features
        return await client.text.generate(
            prompt,
            model="openai",
            max_tokens=1000
        )
    except ValidationError:
        # Fallback to simpler request
        return await client.text.generate(
            prompt,
            max_tokens=500
        )
    except AuthenticationError:
        # Fallback to free tier
        return await client.text.generate(prompt)
```

---

### 4. Log Errors Appropriately

```python
import logging

def handle_generation_error(error):
    if isinstance(error, ValidationError):
        logging.warning(f"Invalid parameters: {error}")
    elif isinstance(error, (RateLimitError, TimeoutError)):
        logging.info(f"Temporary issue: {error}")
    elif isinstance(error, AuthenticationError):
        logging.error(f"Authentication failed: {error}")
    else:
        logging.exception(f"Unexpected error: {error}")
```

---

### 5. Test Error Scenarios

```python
import pytest
from unittest.mock import Mock, patch

@pytest.mark.asyncio
async def test_rate_limit_error():
    with patch.object(client.text, 'generate') as mock_generate:
        mock_generate.side_effect = RateLimitError(
            "Rate limited",
            retry_after=60
        )
        
        with pytest.raises(RateLimitError):
            await client.text.generate("Test")

@pytest.mark.asyncio
async def test_timeout_error():
    with patch.object(client.text, 'generate') as mock_generate:
        mock_generate.side_effect = TimeoutError("Request timeout")
        
        # Should handle gracefully
        result = await robust_generate("Test")
        assert result is not None or result == "[Timeout]"
```

---

## See Also

- [Debugging Guide](DEBUGGING.md) - Troubleshooting tips
- [Status Codes](STATUS_CODES.md) - HTTP status meanings
- [Error Handling](ERROR_HANDLING.md) - Handle errors gracefully
- [HTTP Client Guide](HTTP_CLIENT.md) - HTTP-specific errors