# 📊 Status Codes Reference

> **Complete reference for HTTP status codes in Blossom AI**

---

## Overview

This reference documents all HTTP status codes you may encounter when using Blossom AI, their meanings, and recommended actions.

---

## Success Codes (2xx)

### 200 OK

**Description:** Request succeeded.

**When used:**
- Successful text generation
- Successful image generation
- Successful API calls

**Example:**
```python
# Successful text generation
response = await client.text.generate("Hello world")
# Status: 200 OK
```

**Action:** None required.

---

### 201 Created

**Description:** Resource created successfully.

**When used:**
- Batch job creation
- Resource uploads

**Action:** None required.

---

## Client Error Codes (4xx)

### 400 Bad Request

**Description:** Invalid request parameters.

**Common causes:**
- Invalid prompt format
- Missing required parameters
- Malformed JSON
- Invalid image format

**Example:**
```python
try:
    # Invalid parameter
    image = await client.image.generate(
        "Test",
        width=-100  # Invalid negative width
    )
except ValidationError as e:
    # Will result in 400 Bad Request
    print(f"Bad request: {e}")
```

**Solutions:**
```python
# Validate parameters before sending
if width < 64 or width > 2048:
    raise ValueError("Width must be between 64 and 2048")

# Check prompt format
if not prompt or prompt.isspace():
    raise ValueError("Prompt cannot be empty")
```

---

### 401 Unauthorized

**Description:** Authentication required or failed.

**Common causes:**
- Missing API key
- Invalid API key
- Expired API key

**Example:**
```python
try:
    client = BlossomClient()  # No API key
    result = await client.text.generate("Test")
except AuthenticationError as e:
    # Will result in 401 Unauthorized
    print(f"Authentication failed: {e}")
```

**Solutions:**
```python
# Option 1: Set environment variable
import os
os.environ["POLLINATIONS_API_KEY"] = "your-key"

# Option 2: Pass API key explicitly
config = SessionConfig(api_key="your-key")
client = BlossomClient(config=config)

# Option 3: Check key format
if not api_key.startswith(("pk_", "sk_")):
    print("Warning: API key may be invalid format")
```

---

### 403 Forbidden

**Description:** Access denied.

**Common causes:**
- Insufficient permissions
- Rate limit exceeded
- Geographic restrictions
- Content policy violation

**Example:**
```python
try:
    # Requesting blocked content
    result = await client.text.generate("Generate malicious code")
except BlossomError as e:
    # May result in 403 Forbidden
    print(f"Access denied: {e}")
```

**Solutions:**
```python
# Check API key permissions
if not api_key.startswith("sk_"):
    print("Warning: Limited permissions with publishable key")

# Respect rate limits
config = SessionConfig(rate_limit_per_minute=60)

# Follow content policies
safe_prompt = filter_unsafe_content(prompt)
```

---

### 404 Not Found

**Description:** Resource not found.

**Common causes:**
- Invalid model name
- Deleted resource
- Wrong endpoint

**Example:**
```python
try:
    # Invalid model
    result = await client.text.generate(
        "Test",
        model="invalid-model-123"
    )
except ValidationError as e:
    # May result in 404 Not Found
    print(f"Resource not found: {e}")
```

**Solutions:**
```python
# Check available models
models = client.text.models()
print(f"Available models: {models}")

# Validate model before use
valid_models = ["openai", "gemini", "claude", "mistral"]
if model not in valid_models:
    raise ValueError(f"Invalid model: {model}")
```

---

### 408 Request Timeout

**Description:** Server timeout waiting for request.

**Common causes:**
- Slow network connection
- Large upload taking too long
- Server overloaded

**Example:**
```python
try:
    # Uploading very large image
    with open("huge_image.jpg", "rb") as f:
        image_data = f.read()  # Very large file
    
    result = await client.image.generate(
        "Process this image",
        image_data=image_data
    )
except TimeoutError as e:
    # May result in 408 Request Timeout
    print(f"Request timeout: {e}")
```

**Solutions:**
```python
# Increase timeout
config = SessionConfig(timeout=120.0)

# Compress large images
from PIL import Image

def compress_image(image_path, max_size_mb=5):
    img = Image.open(image_path)
    
    # Reduce quality to fit size limit
    quality = 95
    while True:
        img.save("temp.jpg", quality=quality, optimize=True)
        size_mb = os.path.getsize("temp.jpg") / (1024 * 1024)
        
        if size_mb <= max_size_mb or quality <= 50:
            break
        
        quality -= 5
    
    return "temp.jpg"

# Use chunked uploads (if supported)
async def upload_large_file(client, file_path):
    chunk_size = 1024 * 1024  # 1MB chunks
    
    with open(file_path, "rb") as f:
        while chunk := f.read(chunk_size):
            # Upload chunk
            await upload_chunk(chunk)
```

---

### 413 Payload Too Large

**Description:** Request body too large.

**Common causes:**
- Image file exceeds size limit
- Request JSON too large
- Batch size too large

**Limits:**
- Image files: 10MB maximum
- Text prompts: 5000 characters maximum
- Batch requests: 100 items maximum

**Example:**
```python
try:
    # Large image file
    with open("huge_image.jpg", "rb") as f:
        image_data = f.read()  # > 10MB
    
    result = await client.image.generate("Test", image_data=image_data)
except FileTooLargeError as e:
    # Will result in 413 Payload Too Large
    print(f"File too large: {e}")
```

**Solutions:**
```python
from PIL import Image
import os

def resize_image(image_path, max_size_mb=5):
    """Resize image to fit under size limit."""
    
    # Get current size
    size_mb = os.path.getsize(image_path) / (1024 * 1024)
    
    if size_mb <= max_size_mb:
        return image_path  # Already small enough
    
    # Open and resize
    img = Image.open(image_path)
    
    # Calculate new dimensions
    ratio = (max_size_mb / size_mb) ** 0.5  # Square root for area
    new_width = int(img.width * ratio)
    new_height = int(img.height * ratio)
    
    # Resize
    img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    # Save with compression
    output_path = "resized_image.jpg"
    img.save(output_path, quality=85, optimize=True)
    
    return output_path

# Use for large images
image_path = resize_image("huge_image.jpg")
result = await client.image.generate("Test", image_path=image_path)
```

---

### 429 Too Many Requests

**Description:** Rate limit exceeded.

**Common causes:**
- Too many requests in short time
- Burst traffic
- Inefficient polling

**Example:**
```python
try:
    # Rapid requests
    for i in range(100):
        result = await client.text.generate(f"Request {i}")
except RateLimitError as e:
    # Will result in 429 Too Many Requests
    print(f"Rate limited: {e}")
    print(f"Retry after: {e.retry_after} seconds")
```

**Solutions:**
```python
import asyncio
from blossom_ai import RateLimitError

# Option 1: Add delays
async def with_delays():
    for i in range(100):
        result = await client.text.generate(f"Request {i}")
        await asyncio.sleep(1)  # 1 second delay

# Option 2: Use rate limiting
config = SessionConfig(rate_limit_per_minute=60)

# Option 3: Implement exponential backoff
async def with_backoff():
    retry_count = 0
    max_retries = 5
    
    while retry_count < max_retries:
        try:
            result = await client.text.generate("Test")
            return result
        except RateLimitError as e:
            wait_time = (2 ** retry_count) + (e.retry_after or 60)
            print(f"Rate limited, waiting {wait_time}s...")
            await asyncio.sleep(wait_time)
            retry_count += 1
    
    raise Exception("Max retries exceeded")

# Option 4: Batch requests
async def batch_requests():
    batch_size = 10
    delay_between_batches = 10  # seconds
    
    for batch_start in range(0, 100, batch_size):
        batch = range(batch_start, batch_start + batch_size)
        
        tasks = [
            client.text.generate(f"Request {i}")
            for i in batch
        ]
        
        results = await asyncio.gather(*tasks)
        
        # Wait between batches
        await asyncio.sleep(delay_between_batches)
```

---

## Server Error Codes (5xx)

### 500 Internal Server Error

**Description:** Server encountered unexpected error.

**Common causes:**
- Server bug
- Database error
- Unexpected condition

**Solutions:**
```python
import asyncio
from blossom_ai import BlossomError

async def handle_server_errors():
    retry_count = 0
    max_retries = 3
    
    while retry_count < max_retries:
        try:
            result = await client.text.generate("Test")
            return result
        except BlossomError as e:
            if e.context and e.context.status_code == 500:
                print(f"Server error, retrying... ({retry_count + 1}/{max_retries})")
                await asyncio.sleep(2 ** retry_count)  # Exponential backoff
                retry_count += 1
            else:
                raise
    
    # Fallback to different model
    print("Primary model failed, trying backup...")
    return await client.text.generate("Test", model="gemini")
```

---

### 502 Bad Gateway

**Description:** Invalid response from upstream server.

**Common causes:**
- API gateway error
- Upstream server down
- Network issue between servers

**Solutions:**
```python
# Usually temporary - retry with backoff
async def handle_bad_gateway():
    for attempt in range(3):
        try:
            return await client.text.generate("Test")
        except BlossomError as e:
            if e.context and e.context.status_code == 502:
                wait_time = 2 ** attempt
                print(f"Bad gateway, waiting {wait_time}s...")
                await asyncio.sleep(wait_time)
            else:
                raise
```

---

### 503 Service Unavailable

**Description:** Server temporarily unavailable.

**Common causes:**
- Server maintenance
- Overload
- Temporary outage

**Headers:**
- `Retry-After`: Seconds to wait before retrying

**Solutions:**
```python
from blossom_ai import BlossomError

async def handle_service_unavailable():
    try:
        return await client.text.generate("Test")
    except BlossomError as e:
        if e.context and e.context.status_code == 503:
            retry_after = e.retry_after or 60
            print(f"Service unavailable, waiting {retry_after}s...")
            await asyncio.sleep(retry_after)
            
            # Retry
            return await client.text.generate("Test")
        else:
            raise
```

---

### 504 Gateway Timeout

**Description:** Gateway timeout waiting for upstream.

**Common causes:**
- Upstream server slow
- Network timeout
- Processing taking too long

**Solutions:**
```python
# Increase timeout or use streaming
config = SessionConfig(timeout=120.0)

# Use streaming for long operations
async def handle_gateway_timeout():
    try:
        result = ""
        async for chunk in await client.text.generate(
            "Long request...",
            stream=True
        ):
            result += chunk
        return result
    except Exception as e:
        # Retry or handle error
        return await client.text.generate("Shorter request...")
```

---

### 520 Unknown Error (Cloudflare)

**Description:** Cloudflare unknown error.

**Common causes:**
- Cloudflare configuration issue
- Origin server returning empty response
- Unexpected Cloudflare behavior

**Solutions:**
```python
from blossom_ai import Blossom520Error

async def handle_cloudflare_errors():
    try:
        return await client.text.generate("Test")
    except Blossom520Error:
        print("Cloudflare error - usually temporary")
        
        # Wait and retry
        await asyncio.sleep(10)
        return await client.text.generate("Test")
```

---

## Status Code Summary

| Code | Name | Meaning | Action |
|------|------|---------|--------|
| 200 | OK | Success | None |
| 201 | Created | Resource created | None |
| 400 | Bad Request | Invalid parameters | Fix request |
| 401 | Unauthorized | Authentication needed | Add API key |
| 403 | Forbidden | Access denied | Check permissions |
| 404 | Not Found | Resource missing | Check model/name |
| 408 | Request Timeout | Upload too slow | Increase timeout |
| 413 | Payload Too Large | File too big | Compress/resize |
| 429 | Too Many Requests | Rate limited | Wait and slow down |
| 500 | Internal Server Error | Server bug | Retry later |
| 502 | Bad Gateway | Upstream error | Retry with backoff |
| 503 | Service Unavailable | Maintenance | Wait and retry |
| 504 | Gateway Timeout | Upstream slow | Increase timeout |
| 520 | Unknown Error | Cloudflare issue | Wait and retry |

---

## Best Practices

### 1. Handle All Status Codes

```python
from blossom_ai import (
    AuthenticationError, RateLimitError, ValidationError,
    TimeoutError, NetworkError, BlossomError
)

async def handle_all_errors():
    try:
        result = await client.text.generate("Test")
        return result
    except AuthenticationError:
        # 401
        print("Fix API key")
    except RateLimitError:
        # 429
        print("Slow down requests")
    except ValidationError:
        # 400
        print("Fix parameters")
    except TimeoutError:
        # 408, 504
        print("Increase timeout")
    except NetworkError:
        # Connection issues
        print("Check network")
    except BlossomError as e:
        # All other errors
        if hasattr(e.context, 'status_code'):
            print(f"Status {e.context.status_code}: {e}")
```

---

### 2. Implement Retry Logic

```python
import asyncio
from functools import wraps

def retry_on_server_errors(max_retries=3):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except BlossomError as e:
                    if (hasattr(e.context, 'status_code') and 
                        e.context.status_code in [500, 502, 503, 504]):
                        
                        if attempt < max_retries - 1:
                            wait_time = 2 ** attempt
                            print(f"Server error, retrying in {wait_time}s...")
                            await asyncio.sleep(wait_time)
                        else:
                            raise
                    else:
                        raise
        return wrapper
    return decorator

@retry_on_server_errors(max_retries=3)
async def reliable_request():
    return await client.text.generate("Test")
```

---

### 3. Monitor Status Codes

```python
class StatusCodeMonitor:
    def __init__(self):
        self.counts = {}
    
    def record(self, status_code):
        self.counts[status_code] = self.counts.get(status_code, 0) + 1
    
    def report(self):
        print("Status Code Summary:")
        for code, count in sorted(self.counts.items()):
            print(f"  {code}: {count} requests")

# Usage
monitor = StatusCodeMonitor()

async def monitored_request():
    try:
        result = await client.text.generate("Test")
        monitor.record(200)
        return result
    except BlossomError as e:
        if hasattr(e.context, 'status_code'):
            monitor.record(e.context.status_code)
        raise
```

---

## See Also

- [Error Types](ERROR_TYPES.md) - Complete error reference
- [Debugging Guide](DEBUGGING.md) - Troubleshooting tips
- [Error Handling](ERROR_HANDLING.md) - Handle errors gracefully
- [Performance Tuning](PERFORMANCE.md) - Optimization strategies