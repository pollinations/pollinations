# 🌶️ Flask Integration Guide

> **Integrate Blossom AI with Flask for traditional web applications**

---

## Overview

This guide covers integrating Blossom AI with Flask, including synchronous patterns, threading, error handling, and production deployment strategies.

---

## Basic Integration

### 1. Simple Flask Application

```python
from flask import Flask, request, jsonify
from flask_cors import CORS
import threading
import queue
import time
from blossom_ai import BlossomClient, SessionConfig

app = Flask(__name__)
CORS(app)

# Global client with thread-safe configuration
client = None
client_lock = threading.Lock()

def init_client():
    """Initialize Blossom client."""
    global client
    if client is None:
        config = SessionConfig(
            timeout=30.0,
            sync_pool_connections=10,
            sync_pool_maxsize=20
        )
        client = BlossomClient(config=config)
        client.__enter__()

# Initialize on first request
@app.before_first_request
def before_first_request():
    """Initialize client before first request."""
    init_client()

@app.route('/generate/text', methods=['POST'])
def generate_text():
    """Generate text using Blossom AI."""
    
    data = request.get_json()
    prompt = data.get('prompt', '')
    max_tokens = data.get('max_tokens', 100)
    temperature = data.get('temperature', 0.7)
    
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400
    
    try:
        with client_lock:
            result = client.text.generate(
                prompt,
                max_tokens=max_tokens,
                temperature=temperature
            )
        
        return jsonify({
            'text': result,
            'model': 'gpt-4',  # or actual model used
            'tokens_used': len(result.split())
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'healthy', 'service': 'blossom-ai-api'})

if __name__ == '__main__':
    try:
        init_client()
        app.run(debug=True, port=5000, threaded=True)
    finally:
        if client:
            client.__exit__(None, None, None)
```

---

### 2. Better Thread-Safe Pattern

```python
from flask import Flask, request, jsonify, g
from flask_cors import CORS
import threading
from contextlib import contextmanager
from blossom_ai import BlossomClient, SessionConfig

app = Flask(__name__)
CORS(app)

class ThreadSafeBlossomClient:
    """Thread-safe wrapper for Blossom client."""
    
    def __init__(self):
        self._local = threading.local()
        self._config = SessionConfig(
            timeout=30.0,
            sync_pool_connections=10,
            sync_pool_maxsize=20
        )
    
    def get_client(self) -> BlossomClient:
        """Get thread-local client instance."""
        if not hasattr(self._local, 'client'):
            self._local.client = BlossomClient(config=self._config)
            self._local.client.__enter__()
        return self._local.client
    
    def cleanup(self):
        """Cleanup all thread-local clients."""
        # Note: In production, implement proper cleanup
        pass

# Global thread-safe client
tsb_client = ThreadSafeBlossomClient()

@app.before_request
def before_request():
    """Setup before each request."""
    g.client = tsb_client.get_client()

@app.teardown_request
def teardown_request(exception=None):
    """Cleanup after each request."""
    # Thread-local cleanup happens automatically
    pass

@app.route('/generate/text', methods=['POST'])
def generate_text():
    """Generate text using thread-safe client."""
    
    data = request.get_json()
    prompt = data.get('prompt', '')
    max_tokens = data.get('max_tokens', 100)
    temperature = data.get('temperature', 0.7)
    
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400
    
    try:
        result = g.client.text.generate(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature
        )
        
        return jsonify({
            'text': result,
            'model': 'gpt-4',
            'tokens_used': len(result.split())
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

---

## Advanced Integration Patterns

### 3. Async-Compatible Flask with Flask-Async

```python
from flask import Flask, request, jsonify
from flask_cors import CORS
import asyncio
from flask_async import AsyncApp
from blossom_ai import BlossomClient, SessionConfig

# Use AsyncApp for better async support
app = AsyncApp(__name__)
CORS(app)

# Async client management
class AsyncClientManager:
    """Manage async Blossom client for Flask."""
    
    def __init__(self):
        self.config = SessionConfig(
            timeout=30.0,
            sync_pool_connections=10,
            async_limit_total=50
        )
        self.client = None
    
    async def get_client(self) -> BlossomClient:
        """Get or create async client."""
        if self.client is None:
            self.client = BlossomClient(config=self.config)
            await self.client.__aenter__()
        return self.client
    
    async def cleanup(self):
        """Cleanup client."""
        if self.client:
            await self.client.__aexit__(None, None, None)
            self.client = None

# Global manager
client_manager = AsyncClientManager()

@app.before_first_request
async def before_first_request():
    """Initialize async client."""
    await client_manager.get_client()

@app.route('/generate/text', methods=['POST'])
async def generate_text_async():
    """Async text generation endpoint."""
    
    data = request.get_json()
    prompt = data.get('prompt', '')
    max_tokens = data.get('max_tokens', 100)
    temperature = data.get('temperature', 0.7)
    
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400
    
    try:
        client = await client_manager.get_client()
        result = await client.text.generate(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature
        )
        
        return jsonify({
            'text': result,
            'model': 'gpt-4',
            'tokens_used': len(result.split())
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

---

### 4. Background Task Processing

```python
from flask import Flask, request, jsonify
from flask_cors import CORS
import threading
import queue
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from blossom_ai import BlossomClient, SessionConfig

app = Flask(__name__)
CORS(app)

class BackgroundTaskProcessor:
    """Process Blossom AI requests in background."""
    
    def __init__(self, max_workers: int = 5):
        self.max_workers = max_workers
        self.task_queue = queue.Queue()
        self.results = {}
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.config = SessionConfig(
            timeout=60.0,
            sync_pool_connections=max_workers
        )
        
        # Start worker threads
        for _ in range(max_workers):
            threading.Thread(target=self._worker, daemon=True).start()
    
    def _worker(self):
        """Worker thread to process tasks."""
        
        # Each worker has its own client
        client = BlossomClient(config=self.config)
        client.__enter__()
        
        try:
            while True:
                try:
                    task = self.task_queue.get(timeout=1)
                    task_id = task['id']
                    prompt = task['prompt']
                    kwargs = task.get('kwargs', {})
                    
                    # Process task
                    result = client.text.generate(prompt, **kwargs)
                    
                    # Store result
                    self.results[task_id] = {
                        'status': 'completed',
                        'result': result,
                        'timestamp': time.time()
                    }
                    
                except queue.Empty:
                    continue
                except Exception as e:
                    if 'task_id' in locals():
                        self.results[task_id] = {
                            'status': 'failed',
                            'error': str(e),
                            'timestamp': time.time()
                        }
        
        finally:
            client.__exit__(None, None, None)
    
    def submit_task(self, prompt: str, **kwargs) -> str:
        """Submit task for background processing."""
        
        task_id = str(uuid.uuid4())
        
        self.task_queue.put({
            'id': task_id,
            'prompt': prompt,
            'kwargs': kwargs
        })
        
        # Initialize result as pending
        self.results[task_id] = {
            'status': 'pending',
            'timestamp': time.time()
        }
        
        return task_id
    
    def get_result(self, task_id: str) -> dict:
        """Get task result."""
        
        if task_id not in self.results:
            return {'error': 'Task not found'}
        
        result = self.results[task_id].copy()
        
        # Clean up completed tasks older than 1 hour
        current_time = time.time()
        expired_tasks = [
            tid for tid, res in self.results.items()
            if res.get('status') in ['completed', 'failed'] and
            current_time - res.get('timestamp', 0) > 3600
        ]
        
        for tid in expired_tasks:
            del self.results[tid]
        
        return result
    
    def get_stats(self) -> dict:
        """Get processor statistics."""
        pending = sum(1 for r in self.results.values() if r.get('status') == 'pending')
        completed = sum(1 for r in self.results.values() if r.get('status') == 'completed')
        failed = sum(1 for r in self.results.values() if r.get('status') == 'failed')
        
        return {
            'pending': pending,
            'completed': completed,
            'failed': failed,
            'queue_size': self.task_queue.qsize(),
            'max_workers': self.max_workers
        }

# Global processor
processor = BackgroundTaskProcessor(max_workers=5)

@app.route('/generate/async', methods=['POST'])
def submit_async_generation():
    """Submit async generation task."""
    
    data = request.get_json()
    prompt = data.get('prompt', '')
    max_tokens = data.get('max_tokens', 100)
    temperature = data.get('temperature', 0.7)
    
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400
    
    task_id = processor.submit_task(
        prompt,
        max_tokens=max_tokens,
        temperature=temperature
    )
    
    return jsonify({
        'task_id': task_id,
        'status': 'submitted'
    })

@app.route('/generate/result/<task_id>', methods=['GET'])
def get_async_result(task_id):
    """Get async generation result."""
    
    result = processor.get_result(task_id)
    return jsonify(result)

@app.route('/processor/stats', methods=['GET'])
def get_processor_stats():
    """Get processor statistics."""
    
    return jsonify(processor.get_stats())
```

---

## Request Queue Management

### 5. Rate Limiting and Queuing

```python
from flask import Flask, request, jsonify
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import time
from collections import defaultdict
from functools import wraps
from blossom_ai import BlossomClient, SessionConfig

app = Flask(__name__)

# Rate limiting
limiter = Limiter(
    app,
    key_func=get_remote_address,
    default_limits=["100 per minute"]
)

class RateLimitedGenerator:
    """Rate-limited text generator."""
    
    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self.request_times = defaultdict(list)
        self.lock = threading.Lock()
        self.config = SessionConfig(
            timeout=30.0,
            sync_pool_connections=5
        )
        self.client = BlossomClient(config=self.config)
        self.client.__enter__()
    
    def can_make_request(self, identifier: str = "default") -> bool:
        """Check if request can be made."""
        
        current_time = time.time()
        minute_ago = current_time - 60
        
        # Remove old requests
        self.request_times[identifier] = [
            req_time for req_time in self.request_times[identifier]
            if req_time > minute_ago
        ]
        
        return len(self.request_times[identifier]) < self.requests_per_minute
    
    def wait_for_slot(self, identifier: str = "default"):
        """Wait for available request slot."""
        
        while not self.can_make_request(identifier):
            time.sleep(0.1)  # Wait 100ms and check again
        
        # Record request
        self.request_times[identifier].append(time.time())
    
    def generate(self, prompt: str, **kwargs) -> str:
        """Generate text with rate limiting."""
        
        with self.lock:
            self.wait_for_slot()
            
            try:
                return self.client.text.generate(prompt, **kwargs)
            except Exception as e:
                # Remove failed request from count
                self.request_times["default"].pop()
                raise e
    
    def cleanup(self):
        """Cleanup client."""
        if self.client:
            self.client.__exit__(None, None, None)

# Global rate-limited generator
generator = RateLimitedGenerator(requests_per_minute=30)

def rate_limit_decorator(requests_per_minute: int):
    """Decorator for rate limiting."""
    
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if not generator.can_make_request():
                return jsonify({'error': 'Rate limit exceeded'}), 429
            
            return f(*args, **kwargs)
        
        return wrapper
    return decorator

@app.route('/generate/rate-limited', methods=['POST'])
@limiter.limit("10 per minute")
def generate_text_rate_limited():
    """Generate text with rate limiting."""
    
    data = request.get_json()
    prompt = data.get('prompt', '')
    max_tokens = data.get('max_tokens', 100)
    temperature = data.get('temperature', 0.7)
    
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400
    
    try:
        result = generator.generate(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature
        )
        
        return jsonify({
            'text': result,
            'model': 'gpt-4',
            'tokens_used': len(result.split())
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/rate-limit/status', methods=['GET'])
def get_rate_limit_status():
    """Get rate limit status."""
    
    can_request = generator.can_make_request()
    recent_requests = len(generator.request_times["default"])
    
    return jsonify({
        'can_make_request': can_request,
        'recent_requests': recent_requests,
        'limit': generator.requests_per_minute,
        'remaining': max(0, generator.requests_per_minute - recent_requests)
    })
```

---

## Caching and Performance

### 6. Response Caching

```python
from flask import Flask, request, jsonify
from functools import lru_cache
import hashlib
import json
import time
from blossom_ai import BlossomClient, SessionConfig

app = Flask(__name__)

class ResponseCache:
    """LRU cache for Blossom AI responses."""
    
    def __init__(self, maxsize: int = 128, ttl: int = 3600):
        self.maxsize = maxsize
        self.ttl = ttl
        self.cache = {}
        self.timestamps = {}
        self.config = SessionConfig(
            timeout=30.0,
            sync_pool_connections=10
        )
        self.client = BlossomClient(config=self.config)
        self.client.__enter__()
    
    def _generate_key(self, prompt: str, **kwargs) -> str:
        """Generate cache key."""
        cache_data = {
            "prompt": prompt,
            "kwargs": sorted(kwargs.items())
        }
        key_string = json.dumps(cache_data, sort_keys=True)
        return hashlib.sha256(key_string.encode()).hexdigest()
    
    def get(self, prompt: str, **kwargs) -> tuple:
        """Get cached response and cache hit status."""
        
        key = self._generate_key(prompt, **kwargs)
        current_time = time.time()
        
        if key in self.cache:
            # Check if still valid
            if current_time - self.timestamps[key] < self.ttl:
                return self.cache[key], True
            else:
                # Expired, remove from cache
                del self.cache[key]
                del self.timestamps[key]
        
        return None, False
    
    def set(self, prompt: str, response: str, **kwargs):
        """Cache response."""
        
        key = self._generate_key(prompt, **kwargs)
        
        # Check cache size
        if len(self.cache) >= self.maxsize:
            # Remove oldest entry
            oldest_key = min(self.timestamps, key=self.timestamps.get)
            del self.cache[oldest_key]
            del self.timestamps[oldest_key]
        
        # Add new entry
        self.cache[key] = response
        self.timestamps[key] = time.time()
    
    def clear(self):
        """Clear cache."""
        self.cache.clear()
        self.timestamps.clear()
    
    def get_stats(self) -> dict:
        """Get cache statistics."""
        return {
            'size': len(self.cache),
            'maxsize': self.maxsize,
            'ttl': self.ttl,
            'hit_rate': len(self.cache) / max(len(self.timestamps), 1)
        }
    
    def generate_with_cache(self, prompt: str, **kwargs) -> tuple:
        """Generate text with caching."""
        
        # Check cache
        cached_result, is_hit = self.get(prompt, **kwargs)
        
        if is_hit:
            return cached_result, True
        
        # Generate new response
        result = self.client.text.generate(prompt, **kwargs)
        
        # Cache result
        self.set(prompt, result, **kwargs)
        
        return result, False

# Global cache
cache = ResponseCache(maxsize=256, ttl=1800)

@app.route('/generate/cached', methods=['POST'])
def generate_text_cached():
    """Generate text with caching."""
    
    data = request.get_json()
    prompt = data.get('prompt', '')
    max_tokens = data.get('max_tokens', 100)
    temperature = data.get('temperature', 0.7)
    
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400
    
    try:
        result, is_cached = cache.generate_with_cache(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature
        )
        
        return jsonify({
            'text': result,
            'cached': is_cached,
            'model': 'gpt-4',
            'tokens_used': len(result.split())
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/cache/stats', methods=['GET'])
def get_cache_stats():
    """Get cache statistics."""
    
    return jsonify(cache.get_stats())

@app.route('/cache/clear', methods=['DELETE'])
def clear_cache():
    """Clear cache."""
    
    cache.clear()
    return jsonify({'message': 'Cache cleared'})
```

---

## Production Deployment

### 7. Gunicorn Configuration

```python
# gunicorn_config.py
import multiprocessing
import os

# Server socket
bind = "0.0.0.0:5000"
backlog = 2048

# Worker processes
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "sync"  # or "gevent" for better async support
worker_connections = 1000
max_requests = 1000
max_requests_jitter = 50

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"

# Process naming
proc_name = "blossom-flask"

# Server mechanics
daemon = False
pidfile = "/tmp/gunicorn.pid"
user = None
group = None
tmp_upload_dir = None

# SSL (configure for production)
# keyfile = "/path/to/keyfile"
# certfile = "/path/to/certfile"
```

```bash
# Run with Gunicorn
gunicorn -c gunicorn_config.py main:app
```

---

### 8. Production Docker Setup

```dockerfile
# Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    build-essential \\
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create non-root user
RUN useradd -m -u 1000 blossom && chown -R blossom:blossom /app
USER blossom

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
    CMD python -c "import requests; requests.get('http://localhost:5000/health')"

# Run application
CMD ["gunicorn", "-c", "gunicorn_config.py", "main:app"]
```

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  blossom-flask:
    build: .
    ports:
      - "5000:5000"
    environment:
      - BLOSSOM_API_KEY=${BLOSSOM_API_KEY}
      - FLASK_ENV=production
      - LOG_LEVEL=INFO
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
```

---

### 9. Error Handling and Monitoring

```python
from flask import Flask, request, jsonify
import logging
import sys
from logging.handlers import RotatingFileHandler
import traceback
from blossom_ai import BlossomClient, SessionConfig

app = Flask(__name__)

# Configure logging
if not app.debug:
    file_handler = RotatingFileHandler('blossom_api.log', maxBytes=10240, backupCount=10)
    file_handler.setFormatter(logging.Formatter(
        '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
    ))
    file_handler.setLevel(logging.INFO)
    app.logger.addHandler(file_handler)
    
    app.logger.setLevel(logging.INFO)
    app.logger.info('Blossom API startup')

# Error handlers
@app.errorhandler(404)
def not_found_error(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    app.logger.error('Server error: %s', traceback.format_exc())
    return jsonify({'error': 'Internal server error'}), 500

@app.errorhandler(Exception)
def handle_exception(error):
    app.logger.error('Unhandled exception: %s', traceback.format_exc())
    return jsonify({'error': 'An unexpected error occurred'}), 500

# Request logging
@app.before_request
def before_request():
    app.logger.info('Request: %s %s', request.method, request.path)

@app.after_request
def after_request(response):
    app.logger.info('Response: %s %s - %s', 
                   request.method, request.path, response.status_code)
    return response

# Health check with detailed status
@app.route('/health', methods=['GET'])
def detailed_health_check():
    """Detailed health check endpoint."""
    
    health_status = {
        'status': 'healthy',
        'timestamp': time.time(),
        'version': '1.0.0',
        'dependencies': {}
    }
    
    try:
        # Test Blossom AI connectivity
        config = SessionConfig(timeout=5.0)
        with BlossomClient(config=config) as test_client:
            result = test_client.text.generate("Health check", max_tokens=5)
        
        health_status['dependencies']['blossom_ai'] = {
            'status': 'healthy',
            'response_time': '< 5s'
        }
    
    except Exception as e:
        health_status['status'] = 'unhealthy'
        health_status['dependencies']['blossom_ai'] = {
            'status': 'unhealthy',
            'error': str(e)
        }
    
    status_code = 200 if health_status['status'] == 'healthy' else 503
    return jsonify(health_status), status_code

# Metrics endpoint
@app.route('/metrics', methods=['GET'])
def metrics():
    """Prometheus-style metrics endpoint."""
    
    # In production, implement proper metrics collection
    metrics_data = f"""
# HELP blossom_requests_total Total number of requests
# TYPE blossom_requests_total counter
blossom_requests_total {get_request_count()}

# HELP blossom_request_duration_seconds Request duration in seconds
# TYPE blossom_request_duration_seconds histogram
blossom_request_duration_seconds_sum {get_request_duration_sum()}
blossom_request_duration_seconds_count {get_request_count()}
"""
    
    return metrics_data, 200, {'Content-Type': 'text/plain; version=0.0.4'}

def get_request_count():
    """Get total request count (implement proper tracking in production)."""
    return 0  # Placeholder

def get_request_duration_sum():
    """Get total request duration (implement proper tracking in production)."""
    return 0.0  # Placeholder
```

---

## Testing

### 10. Flask Testing

```python
import pytest
import json
from main import app

@pytest.fixture
def client():
    """Create test client."""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_generate_text(client):
    """Test text generation endpoint."""
    
    response = client.post('/generate/text', json={
        'prompt': 'Hello world',
        'max_tokens': 50,
        'temperature': 0.7
    })
    
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'text' in data
    assert len(data['text']) > 0

def test_missing_prompt(client):
    """Test missing prompt error."""
    
    response = client.post('/generate/text', json={
        'max_tokens': 50,
        'temperature': 0.7
    })
    
    assert response.status_code == 400
    data = json.loads(response.data)
    assert 'error' in data

def test_health_check(client):
    """Test health check endpoint."""
    
    response = client.get('/health')
    
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'status' in data

def test_async_task_flow(client):
    """Test async task submission and retrieval."""
    
    # Submit task
    response = client.post('/generate/async', json={
        'prompt': 'Test async generation',
        'max_tokens': 50
    })
    
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'task_id' in data
    
    task_id = data['task_id']
    
    # Check result (may need multiple attempts)
    for _ in range(10):
        result_response = client.get(f'/generate/result/{task_id}')
        result_data = json.loads(result_response.data)
        
        if result_data.get('status') == 'completed':
            assert 'result' in result_data
            break
        
        time.sleep(0.5)
    else:
        pytest.fail("Task did not complete in time")

def test_rate_limiting(client):
    """Test rate limiting behavior."""
    
    # Make multiple requests quickly
    responses = []
    for i in range(15):
        response = client.post('/generate/rate-limited', json={
            'prompt': f'Request {i}',
            'max_tokens': 10
        })
        responses.append(response.status_code)
    
    # Check that some requests were rate limited
    rate_limited_count = sum(1 for status in responses if status == 429)
    assert rate_limited_count > 0
```

---

## Summary

Key Flask integration patterns for Blossom AI:

1. **Thread Safety**: Use thread-local storage or proper synchronization
2. **Connection Management**: Reuse clients across requests when possible
3. **Background Processing**: Use ThreadPoolExecutor for async-like behavior
4. **Rate Limiting**: Implement request rate limiting and queuing
5. **Caching**: Add response caching for improved performance
6. **Error Handling**: Comprehensive error handling with proper logging
7. **Production Setup**: Use Gunicorn with proper worker configuration
8. **Monitoring**: Health checks and metrics for production deployment
9. **Testing**: Comprehensive test coverage for all endpoints
10. **Logging**: Structured logging for debugging and monitoring

---

## See Also

- [FastAPI Integration](FASTAPI.md) - FastAPI framework integration
- [Async Patterns](ASYNC_PATTERNS.md) - Async/await best practices
- [Performance Guide](PERFORMANCE.md) - Performance optimization techniques
- [Connection Pooling](CONNECTION_POOLING.md) - HTTP connection optimization
- [Error Handling](ERROR_TYPES.md) - Comprehensive error handling
- [Docker Guide](DOCKER.md) - Container deployment strategies