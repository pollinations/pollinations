# 🔧 Error Handling Guide

> Complete guide to handling errors and exceptions in Blossom AI

---

## 🎯 Overview

Blossom AI provides a comprehensive error handling system with:
- **Specific exception types** for different error scenarios
- **Graceful degradation** when APIs are unavailable
- **Retry mechanisms** with exponential backoff
- **Detailed error information** for debugging

### Error Hierarchy

```
BlossomError (Base Exception)
├── ValidationError
├── ConfigurationError
├── AuthenticationError
├── RateLimitError
├── NetworkError
│   ├── TimeoutError
│   └── ConnectionError
├── APIError
│   ├── StreamError
│   └── EmptyResponseError
├── PaymentError
└── Blossom520Error
```

---

## ❌ Error Types

### BlossomError

Base exception for all Blossom AI errors.

```python
from blossom_ai import BlossomError

try:
    response = ai.text.generate("test")
except BlossomError as e:
    print(f"Blossom AI error: {e}")
    print(f"Error code: {e.code}")
```

**Attributes:**
- `message` (str): Error description
- `code` (str): Error code for categorization

---

### ValidationError

Raised when input validation fails.

```python
from blossom_ai import ValidationError

try:
    # Invalid parameters
    image = ai.image.generate(
        "test",
        width=10000,  # Too large
        height=10000
    )
except ValidationError as e:
    print(f"Invalid input: {e}")
    print(f"Field: {e.field}")  # Which field failed validation
```

**Common Causes:**
- Invalid image sizes
- Exceeding maximum token limits
- Malformed prompts
- Invalid file paths

---

### AuthenticationError

Raised when API key is invalid or missing.

```python
from blossom_ai import AuthenticationError

try:
    with BlossomClient(api_key="invalid-key") as client:
        response = client.text.generate("test")
except AuthenticationError as e:
    print("Invalid API key. Please check your configuration.")
```

**Common Causes:**
- Invalid API key
- Expired API key
- Missing API key
- Insufficient permissions

**Resolution:**
1. Check your API key
2. Verify key permissions
3. Check for typos
4. Ensure key is active

---

### RateLimitError

Raised when rate limit is exceeded.

```python
from blossom_ai import RateLimitError

try:
    # Make many requests quickly
    for i in range(100):
        response = ai.text.generate(f"request {i}")
except RateLimitError as e:
    print(f"Rate limit exceeded. Retry after: {e.retry_after} seconds")
    time.sleep(e.retry_after)  # Wait and retry
```

**Attributes:**
- `retry_after` (int): Seconds to wait before retrying

**Common Causes:**
- Too many requests in short time
- Exceeding daily/monthly quotas
- Concurrent request limits

**Resolution:**
1. Implement exponential backoff
2. Reduce request frequency
3. Use caching to avoid duplicate requests
4. Upgrade plan for higher limits

---

### NetworkError

Raised when network request fails.

```python
from blossom_ai import NetworkError

try:
    response = ai.text.generate("test")
except NetworkError as e:
    print(f"Network error: {e}")
    print(f"Status code: {e.status_code}")
```

**Attributes:**
- `status_code` (int): HTTP status code

**Common Causes:**
- Internet connection issues
- DNS resolution failures
- Firewall blocking requests
- Server downtime

**Subclasses:**
- `TimeoutError`: Request timeout
- `ConnectionError`: Connection failed

---

### TimeoutError

Raised when request times out.

```python
from blossom_ai import TimeoutError

try:
    # Request that takes too long
    response = ai.image.generate(
        "very complex image",
        quality="hd",
        width=2048,
        height=2048
    )
except TimeoutError:
    print("Request timed out. Try with simpler parameters.")
```

**Common Causes:**
- Large image generation
- Complex text generation
- Slow network connection
- Server overload

**Resolution:**
1. Increase timeout in configuration
2. Reduce complexity of requests
3. Retry with exponential backoff
4. Check network connection

---

### APIError

Raised when API returns an error response.

```python
from blossom_ai import APIError

try:
    response = ai.text.generate("test")
except APIError as e:
    print(f"API error: {e}")
    print(f"Status code: {e.status_code}")
    print(f"Response: {e.response}")
```

**Attributes:**
- `status_code` (int): HTTP status code
- `response` (dict): Full API response

**Common Status Codes:**
- `400`: Bad request
- `401`: Unauthorized
- `429`: Rate limited
- `500`: Server error
- `503`: Service unavailable

---

### EmptyResponseError

Raised when API returns empty response.

```python
from blossom_ai import EmptyResponseError

try:
    response = ai.text.generate("test")
except EmptyResponseError:
    print("Received empty response from API")
    # Handle gracefully with default value
```

**Common Causes:**
- API bugs
- Network interruptions
- Invalid response format

---

### PaymentError

Raised when payment is required or fails.

```python
from blossom_ai import PaymentError

try:
    response = ai.text.generate("test")
except PaymentError as e:
    print("Payment required. Please check your account balance.")
```

**Common Causes:**
- Insufficient credits
- Expired payment method
- Billing issues
- Plan limitations

---

### Blossom520Error

Raised for unknown errors (HTTP 520).

```python
from blossom_ai import Blossom520Error

try:
    response = ai.text.generate("test")
except Blossom520Error:
    print("Unknown error occurred. This is likely a temporary issue.")
    # Retry after some time
```

**Common Causes:**
- Server-side issues
- Temporary outages
- Unexpected errors

---

## 🔄 Retry Strategies

### Exponential Backoff

```python
import time
import random
from blossom_ai import RateLimitError, NetworkError

async def generate_with_retry(prompt, max_retries=3):
    for attempt in range(max_retries):
        try:
            return ai.text.generate(prompt)
        except RateLimitError as e:
            if attempt == max_retries - 1:
                raise
            
            # Exponential backoff with jitter
            delay = (2 ** attempt) + random.uniform(0, 1)
            print(f"Rate limited. Waiting {delay:.1f} seconds...")
            time.sleep(delay)
            
        except NetworkError as e:
            if attempt == max_retries - 1:
                raise
            
            # Shorter backoff for network errors
            delay = 2 ** attempt
            print(f"Network error. Retrying in {delay} seconds...")
            time.sleep(delay)
```

### Circuit Breaker Pattern

```python
class CircuitBreaker:
    def __init__(self, failure_threshold=5, timeout=60):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.failure_count = 0
        self.last_failure_time = None
        self.state = "CLOSED"  # CLOSED, OPEN, HALF_OPEN
    
    def __call__(self, func):
        def wrapper(*args, **kwargs):
            if self.state == "OPEN":
                if time.time() - self.last_failure_time > self.timeout:
                    self.state = "HALF_OPEN"
                else:
                    raise Exception("Circuit breaker is OPEN")
            
            try:
                result = func(*args, **kwargs)
                if self.state == "HALF_OPEN":
                    self.state = "CLOSED"
                    self.failure_count = 0
                return result
            except Exception as e:
                self.failure_count += 1
                self.last_failure_time = time.time()
                
                if self.failure_count >= self.failure_threshold:
                    self.state = "OPEN"
                
                raise
        
        return wrapper

# Usage
breaker = CircuitBreaker()

@breaker
def generate_text(prompt):
    return ai.text.generate(prompt)
```

---

## 🛡️ Defensive Programming

### Graceful Degradation

```python
from blossom_ai import BlossomError, AuthenticationError

def generate_text_safe(prompt, fallback="Service temporarily unavailable"):
    try:
        response = ai.text.generate(prompt)
        return response.text
    except AuthenticationError:
        # Can't recover from auth errors
        return "Authentication failed. Please contact support."
    except BlossomError:
        # Return fallback for other errors
        return fallback

# Usage
result = generate_text_safe("test prompt")
```

### Fallback Providers

```python
import asyncio
from blossom_ai import BlossomClient, NetworkError

async def generate_with_fallback(prompt):
    providers = ["primary", "secondary", "tertiary"]
    
    for provider in providers:
        try:
            config = SessionConfig(api_key=f"key_for_{provider}")
            async with BlossomClient(config=config) as client:
                return await client.text.generate(prompt)
        except NetworkError:
            if provider == providers[-1]:
                raise
            continue  # Try next provider

# Usage
result = await generate_with_fallback("test")
```

---

## 🧪 Testing Error Handling

### Mock Errors

```python
from unittest.mock import Mock, AsyncMock, patch
from blossom_ai import RateLimitError, NetworkError

# Test rate limit handling
@patch('blossom_ai.ai.text.generate')
def test_rate_limit_retry(mock_generate):
    # First call raises RateLimitError
    # Second call succeeds
    mock_generate.side_effect = [
        RateLimitError("Rate limited"),
        Mock(text="Success")
    ]
    
    result = generate_with_retry("test")
    assert result.text == "Success"
    assert mock_generate.call_count == 2

# Test network error handling
@patch('blossom_ai.ai.text.generate')
def test_network_error_retry(mock_generate):
    mock_generate.side_effect = NetworkError("Connection failed")
    
    with pytest.raises(NetworkError):
        generate_with_retry("test", max_retries=2)
    
    assert mock_generate.call_count == 2
```

### Test Error Recovery

```python
import pytest
from blossom_ai import BlossomError

def test_error_recovery():
    """Test that system recovers from errors."""
    
    # Simulate error
    with patch('blossom_ai.ai.text.generate', side_effect=BlossomError("Test error")):
        result = generate_text_safe("test", fallback="Recovered")
        assert result == "Recovered"
    
    # Simulate success after recovery
    with patch('blossom_ai.ai.text.generate', return_value=Mock(text="Success")):
        result = generate_text_safe("test")
        assert result == "Success"
```

---

## 📊 Error Monitoring

### Structured Error Logging

```python
import logging
from blossom_ai import StructuredLogger, BlossomError

logger = StructuredLogger("my_app")

def log_error(error: BlossomError, context: dict):
    """Log errors with context for debugging."""
    logger.error(
        "Blossom AI error occurred",
        error_type=type(error).__name__,
        error_message=str(error),
        error_code=getattr(error, 'code', None),
        **context
    )

# Usage
try:
    response = ai.text.generate("test")
except BlossomError as e:
    log_error(e, {"prompt": "test", "user_id": "123"})
```

### Error Metrics

```python
import time
from collections import defaultdict

class ErrorMetrics:
    def __init__(self):
        self.error_counts = defaultdict(int)
        self.error_timestamps = []
    
    def record_error(self, error_type: str):
        self.error_counts[error_type] += 1
        self.error_timestamps.append(time.time())
    
    def get_error_rate(self, window_seconds=300) -> float:
        """Get error rate in last 5 minutes."""
        cutoff = time.time() - window_seconds
        recent_errors = [t for t in self.error_timestamps if t > cutoff]
        return len(recent_errors) / window_seconds

# Usage
metrics = ErrorMetrics()

try:
    response = ai.text.generate("test")
except BlossomError as e:
    metrics.record_error(type(e).__name__)
    
    if metrics.get_error_rate() > 0.1:  # 10% error rate
        logger.warning("High error rate detected")
```

---

## 🎓 Best Practices

### 1. Always Catch Specific Exceptions

```python
# Good ✅
try:
    response = ai.text.generate("test")
except RateLimitError as e:
    handle_rate_limit(e)
except AuthenticationError:
    handle_auth_error()
except NetworkError as e:
    handle_network_error(e)

# Bad ❌
try:
    response = ai.text.generate("test")
except Exception as e:
    # Too generic, can't handle specifically
    print(f"Error: {e}")
```

### 2. Use Context Managers

```python
# Good ✅
with BlossomClient() as client:
    try:
        response = client.text.generate("test")
    except BlossomError as e:
        handle_error(e)
    # Resources automatically cleaned up

# Bad ❌
client = BlossomClient()
try:
    response = client.text.generate("test")
except BlossomError as e:
    handle_error(e)
finally:
    await client.close()  # Manual cleanup required
```

### 3. Implement Proper Backoff

```python
# Good ✅ - Exponential backoff with jitter
import random

def backoff_delay(attempt: int) -> float:
    base_delay = 2 ** attempt
    jitter = random.uniform(0, 1)
    return base_delay + jitter

# Bad ❌ - Fixed delay
def bad_backoff(attempt: int) -> float:
    return 1.0  # Same delay every time
```

### 4. Log Errors with Context

```python
# Good ✅ - Include context for debugging
logger.error(
    "Text generation failed",
    prompt=prompt,
    user_id=user_id,
    error=str(e),
    error_type=type(e).__name__
)

# Bad ❌ - No context
logger.error(f"Error: {e}")
```

### 5. Have Fallback Strategies

```python
# Good ✅ - Multiple fallback levels
def generate_with_fallbacks(prompt):
    try:
        return ai.text.generate(prompt)  # Primary
    except RateLimitError:
        try:
            return secondary_provider.generate(prompt)  # Secondary
        except Exception:
            return cached_response(prompt)  # Tertiary

# Bad ❌ - No fallback
def generate_no_fallback(prompt):
    return ai.text.generate(prompt)  # Fails completely
```

---

## 🔗 Related Documentation

- [🧪 Testing Guide](TESTING.md)
- [📊 Monitoring Guide](MONITORING.md)
- [⚙️ Configuration System](CONFIGURATION.md)
- [🎓 Best Practices](BEST_PRACTICES.md)
