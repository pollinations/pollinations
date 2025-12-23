# 📝 Logging Guide

> Complete guide to logging and monitoring with Blossom AI

---

## 🎯 Overview

Blossom AI provides comprehensive logging capabilities:
- **Structured logging** with JSON format
- **Correlation IDs** for request tracking
- **Multiple log levels** for different environments
- **Performance metrics** built-in
- **Security-conscious** (API keys sanitized)

---

## 🔧 Basic Logging

### Simple Logging

```python
import logging

# Configure basic logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

from blossom_ai import ai

# Operations are automatically logged
response = ai.text.generate("test prompt")
# Log: 2024-01-15 10:00:00,000 - blossom_ai.client - INFO - Text generation completed
```

### Log Levels

```python
# Development: Debug level
logging.basicConfig(level=logging.DEBUG)

# Production: Warning level
logging.basicConfig(level=logging.WARNING)

# Testing: Error level
logging.basicConfig(level=logging.ERROR)
```

---

## 🏗️ Structured Logging

### Using StructuredLogger

```python
from blossom_ai.utils.logging import StructuredLogger

# Create logger
logger = StructuredLogger("my_application")

# Log with structured data
logger.info(
    "User requested text generation",
    user_id=12345,
    prompt_length=len(prompt),
    model="gpt-4"
)

# Output: {"timestamp": "2024-01-15T10:00:00Z", "level": "INFO", "message": "User requested text generation", "user_id": 12345, "prompt_length": 50, "model": "gpt-4"}
```

### Log Levels with StructuredLogger

```python
logger.debug("Debug message", debug_info="details")
logger.info("Information message", user_id=123)
logger.warning("Warning message", reason="rate_limit")
logger.error("Error message", error="timeout", user_id=123)
logger.critical("Critical message", system="down")
```

---

## 🔍 Correlation IDs

### Using Correlation IDs

```python
from blossom_ai.utils.logging import set_correlation_id, get_correlation_id

# Set correlation ID for request
set_correlation_id("request-12345")

# All subsequent logs include this ID
logger.info("Processing request")  # Includes correlation_id: "request-12345"

# Get current correlation ID
current_id = get_correlation_id()
```

### With Web Frameworks

```python
from fastapi import FastAPI, Request
from blossom_ai.utils.logging import set_correlation_id
import uuid

app = FastAPI()

@app.middleware("http")
async def correlation_middleware(request: Request, call_next):
    # Generate correlation ID
    correlation_id = str(uuid.uuid4())
    set_correlation_id(correlation_id)
    
    # Process request
    response = await call_next(request)
    
    # Add to response headers
    response.headers["X-Correlation-ID"] = correlation_id
    return response
```

---

## 📊 Performance Logging

### Built-in Performance Metrics

```python
from blossom_ai import BlossomClient, SessionConfig
from blossom_ai.utils.logging import StructuredLogger

logger = StructuredLogger("performance")

config = SessionConfig(log_level="INFO")

with BlossomClient(config=config) as client:
    # Performance is automatically logged
    response = client.text.generate("test prompt")
    # Log: Text generation completed in 1.23s, 150 tokens, model: gpt-4
    
    image = client.image.generate("test image")
    # Log: Image generation completed in 5.67s, size: 1024x1024, quality: standard
```

### Custom Performance Logging

```python
import time
from blossom_ai.utils.logging import StructuredLogger

logger = StructuredLogger("my_app")

def log_performance(func_name, start_time, end_time, **kwargs):
    """Log performance metrics."""
    duration = end_time - start_time
    
    logger.info(
        f"{func_name} completed",
        duration=duration,
        duration_ms=duration * 1000,
        **kwargs
    )

# Usage
start = time.time()
result = some_operation()
end = time.time()

log_performance("some_operation", start, end, user_id=123)
```

---

## 🛡️ Security in Logging

### Sanitizing Sensitive Data

```python
from blossom_ai.utils.logging import StructuredLogger
from blossom_ai.utils.security import sanitize_api_key

logger = StructuredLogger("secure_app")

# API keys are automatically sanitized
config = SessionConfig(api_key="sk-1234567890abcdef")

# Manual sanitization
api_key = "sk-1234567890abcdef"
safe_key = sanitize_api_key(api_key)  # Returns "sk-***...***"

logger.info(
    "API request made",
    api_key=safe_key,  # Safe to log
    endpoint="/generate"
)
```

### Sensitive Data Filtering

```python
import re

def sanitize_log_data(data):
    """Remove sensitive information from log data."""
    # Remove API keys
    data = re.sub(r'sk-[a-zA-Z0-9]+', 'sk-***', data)
    
    # Remove passwords
    data = re.sub(r'password[=:]\s*\S+', 'password=***', data, flags=re.IGNORECASE)
    
    # Remove tokens
    data = re.sub(r'token[=:]\s*\S+', 'token=***', data, flags=re.IGNORECASE)
    
    return data

# Custom log filter
class SecurityFilter(logging.Filter):
    def filter(self, record):
        record.msg = sanitize_log_data(str(record.msg))
        return True

# Add filter to logger
logger = logging.getLogger("secure")
logger.addFilter(SecurityFilter())
```

---

## 🌐 Request Tracing

### Full Request Trace Example

```python
import uuid
from blossom_ai.utils.logging import StructuredLogger, set_correlation_id

logger = StructuredLogger("request_trace")

def process_user_request(user_id: int, prompt: str):
    """Process request with full tracing."""
    
    # Set correlation ID
    correlation_id = str(uuid.uuid4())
    set_correlation_id(correlation_id)
    
    # Log request start
    logger.info(
        "Request started",
        user_id=user_id,
        prompt_length=len(prompt),
        correlation_id=correlation_id
    )
    
    try:
        # Process request
        with BlossomClient() as client:
            response = client.text.generate(prompt)
        
        # Log success
        logger.info(
            "Request completed successfully",
            user_id=user_id,
            tokens_used=response.total_tokens,
            response_time=0.5,  # Example
            correlation_id=correlation_id
        )
        
        return response.text
    
    except Exception as e:
        # Log error
        logger.error(
            "Request failed",
            user_id=user_id,
            error=str(e),
            error_type=type(e).__name__,
            correlation_id=correlation_id
        )
        raise
```

---

## 📈 Monitoring and Alerting

### Log Aggregation

```python
# Send logs to ELK stack
import requests
import json

class ELKLogger:
    def __init__(self, elk_endpoint):
        self.endpoint = elk_endpoint
    
    def log(self, level, message, **kwargs):
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": level,
            "message": message,
            **kwargs
        }
        
        try:
            requests.post(
                self.endpoint,
                json=log_entry,
                headers={"Content-Type": "application/json"}
            )
        except Exception as e:
            print(f"Failed to send log to ELK: {e}")

# Usage
elk_logger = ELKLogger("https://elk.example.com/logs")
elk_logger.log("INFO", "Application started", app="blossom_ai", version="1.0.0")
```

### Metrics and Monitoring

```python
from prometheus_client import Counter, Histogram, Gauge, start_http_server

# Metrics
request_count = Counter('blossom_requests_total', 'Total requests', ['method', 'status'])
request_duration = Histogram('blossom_request_duration_seconds', 'Request duration')
active_requests = Gauge('blossom_active_requests', 'Active requests')
error_count = Counter('blossom_errors_total', 'Total errors', ['error_type'])

def instrumented_generation(func):
    """Decorator to instrument AI generation calls."""
    def wrapper(*args, **kwargs):
        active_requests.inc()
        start_time = time.time()
        
        try:
            result = func(*args, **kwargs)
            request_count.labels(method="generate", status="success").inc()
            return result
        except Exception as e:
            request_count.labels(method="generate", status="error").inc()
            error_count.labels(error_type=type(e).__name__).inc()
            raise
        finally:
            duration = time.time() - start_time
            request_duration.observe(duration)
            active_requests.dec()
    
    return wrapper

# Usage
@instrumented_generation
def generate_text(prompt):
    return ai.text.generate(prompt)

# Start metrics server
start_http_server(8000)
```

### Alerting Rules

```yaml
# prometheus-alerts.yml
groups:
  - name: blossom-ai-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(blossom_errors_total[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          
      - alert: SlowResponseTime
        expr: histogram_quantile(0.95, blossom_request_duration_seconds) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "95th percentile response time > 5s"
          
      - alert: HighRateLimitHits
        expr: rate(blossom_rate_limit_hits_total[5m]) > 0.1
        for: 2m
        labels:
          severity: info
        annotations:
          summary: "High rate limit hit rate"
```

---

## 🔧 Log Configuration

### JSON Logging

```python
import json
import logging

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        
        # Add extra fields
        if hasattr(record, "user_id"):
            log_entry["user_id"] = record.user_id
        if hasattr(record, "correlation_id"):
            log_entry["correlation_id"] = record.correlation_id
        
        return json.dumps(log_entry)

# Configure JSON logging
handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())

logger = logging.getLogger("json_logger")
logger.addHandler(handler)
logger.setLevel(logging.INFO)
```

### File Logging

```python
import logging.handlers
import os

# Create logs directory
os.makedirs("logs", exist_ok=True)

# Configure file logging with rotation
file_handler = logging.handlers.RotatingFileHandler(
    "logs/blossom_ai.log",
    maxBytes=10*1024*1024,  # 10MB
    backupCount=5
)

# Console handler
console_handler = logging.StreamHandler()

# Formatters
file_formatter = logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
console_formatter = logging.Formatter(
    '%(levelname)s: %(message)s'
)

file_handler.setFormatter(file_formatter)
console_handler.setFormatter(console_formatter)

# Configure logger
logger = logging.getLogger("blossom_ai")
logger.addHandler(file_handler)
logger.addHandler(console_handler)
logger.setLevel(logging.INFO)
```

### Environment-Specific Configuration

```python
import os
import logging.config

def configure_logging():
    """Configure logging based on environment."""
    env = os.getenv("ENVIRONMENT", "development")
    
    if env == "production":
        logging_config = {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "json": {
                    "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
                    "format": "%(timestamp)s %(level)s %(name)s %(message)s"
                }
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "json",
                    "level": "INFO"
                },
                "file": {
                    "class": "logging.handlers.RotatingFileHandler",
                    "filename": "logs/app.log",
                    "formatter": "json",
                    "maxBytes": 10485760,
                    "backupCount": 5,
                    "level": "WARNING"
                }
            },
            "loggers": {
                "blossom_ai": {
                    "handlers": ["console", "file"],
                    "level": "INFO"
                }
            }
        }
    else:
        # Development configuration
        logging_config = {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "detailed": {
                    "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
                }
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "detailed",
                    "level": "DEBUG"
                }
            },
            "loggers": {
                "blossom_ai": {
                    "handlers": ["console"],
                    "level": "DEBUG"
                }
            }
        }
    
    logging.config.dictConfig(logging_config)

# Configure on import
configure_logging()
```

---

## 🎓 Best Practices

### 1. Use Appropriate Log Levels

```python
# Good: Use correct log levels
logger.debug("Detailed debug information")
logger.info("General information")
logger.warning("Something unexpected happened")
logger.error("Error occurred but app continues")
logger.critical("Critical error, app may exit")

# Bad: Everything at same level
logger.info("Debug info")  # Should be debug
logger.info("Error occurred")  # Should be error
```

### 2. Include Context

```python
# Good: Include relevant context
logger.info(
    "Image generated",
    user_id=user_id,
    image_size=f"{width}x{height}",
    quality=quality,
    response_time=1.23
)

# Bad: No context
logger.info("Image generated")  # No context
```

### 3. Don't Log Sensitive Data

```python
# Good: Sanitize sensitive data
from blossom_ai.utils.security import sanitize_api_key

logger.info(
    "API request made",
    api_key=sanitize_api_key(api_key),  # sk-***
    endpoint="/generate"
)

# Bad: Logging sensitive data
logger.info(f"API request with key {api_key}")  # Never do this!
```

### 4. Use Structured Logging

```python
# Good: Structured logging
logger.info(
    "User action",
    action="text_generation",
    user_id=12345,
    prompt_length=50,
    success=True
)

# Bad: String concatenation
logger.info(f"User {12345} generated text with prompt length {50}")  # Hard to parse
```

---

## 📚 Related Documentation

- [⚙️ Configuration System](CONFIGURATION.md)
- [🔒 Security Guide](../../SECURITY.md)
- [📊 Monitoring Guide](MONITORING.md)
- [🧪 Testing Guide](TESTING.md)
- [🚀 Deployment Guide](DEPLOYMENT.md)
