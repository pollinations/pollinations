# 🥬 Celery Integration Guide

> **Process Blossom AI tasks asynchronously with Celery**

---

## Overview

This guide covers integrating Blossom AI with Celery for distributed task processing, including setup, configuration, and production deployment strategies.

---

## Why Celery with Blossom AI?

### Benefits
- **Async Processing**: Long-running AI tasks don't block web requests
- **Scalability**: Distribute tasks across multiple workers
- **Reliability**: Automatic retries and error handling
- **Monitoring**: Track task execution and performance
- **Scheduling**: Schedule tasks to run at specific times

### Use Cases
- Batch processing of large datasets
- Long-running text generation tasks
- Image generation pipelines
- Periodic content generation
- Background processing workflows

---

## Basic Setup

### 1. Celery Configuration

```python
# celery_app.py
from celery import Celery
from blossom_ai import BlossomClient, SessionConfig
import os

# Celery configuration
broker_url = os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/0')
result_backend = os.getenv('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')

# Create Celery app
celery_app = Celery(
    'blossom_tasks',
    broker=broker_url,
    backend=result_backend
)

# Celery configuration
celery_app.conf.update(
    # Task settings
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    
    # Worker settings
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
    
    # Result settings
    result_expires=3600,  # Results expire after 1 hour
    
    # Retry settings
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    
    # Broker settings
    broker_connection_retry_on_startup=True,
    broker_connection_max_retries=10,
    broker_connection_retry_delay=5
)

# Blossom AI configuration
blossom_config = SessionConfig(
    timeout=120.0,  # Longer timeout for Celery tasks
    sync_pool_connections=5,
    sync_pool_maxsize=10,
    rate_limit_per_minute=1000
)
```

---

### 2. Basic Celery Tasks

```python
# tasks.py
from celery_app import celery_app, blossom_config
from blossom_ai import BlossomClient
from celery import Task
import logging

logger = logging.getLogger(__name__)

class BlossomTask(Task):
    """Base task class with Blossom client management."""
    
    def __init__(self):
        self.client = None
    
    def __call__(self, *args, **kwargs):
        """Execute task with Blossom client."""
        
        # Initialize client for each task
        self.client = BlossomClient(config=blossom_config)
        self.client.__enter__()
        
        try:
            return self.run(*args, **kwargs)
        finally:
            # Cleanup client
            if self.client:
                self.client.__exit__(None, None, None)

@celery_app.task(base=BlossomTask, bind=True, max_retries=3)
def generate_text(self, prompt: str, max_tokens: int = 100, temperature: float = 0.7, **kwargs):
    """Generate text asynchronously."""
    
    logger.info(f"Starting text generation for prompt: {prompt[:50]}...")
    
    try:
        result = self.client.text.generate(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            **kwargs
        )
        
        logger.info(f"Text generation completed. Result length: {len(result)}")
        
        return {
            'text': result,
            'prompt': prompt,
            'tokens_used': len(result.split()),
            'status': 'completed'
        }
    
    except Exception as exc:
        logger.error(f"Text generation failed: {exc}")
        
        # Retry with exponential backoff
        retry_count = self.request.retries
        countdown = 2 ** retry_count
        
        raise self.retry(exc=exc, countdown=countdown, max_retries=3)

@celery_app.task(base=BlossomTask, bind=True, max_retries=2)
def generate_image(self, prompt: str, width: int = 1024, height: int = 1024, **kwargs):
    """Generate image asynchronously."""
    
    logger.info(f"Starting image generation: {prompt[:50]}...")
    
    try:
        image_data = self.client.image.generate(
            prompt,
            width=width,
            height=height,
            **kwargs
        )
        
        # Convert to base64 for JSON serialization
        import base64
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        logger.info("Image generation completed")
        
        return {
            'image_base64': image_base64,
            'prompt': prompt,
            'size': f"{width}x{height}",
            'status': 'completed'
        }
    
    except Exception as exc:
        logger.error(f"Image generation failed: {exc}")
        raise self.retry(exc=exc, countdown=30, max_retries=2)

@celery_app.task(base=BlossomTask, bind=True)
def analyze_image(self, image_url: str, analysis_prompt: str = "What's in this image?"):
    """Analyze image using vision capabilities."""
    
    logger.info(f"Starting image analysis: {image_url}")
    
    try:
        from blossom_ai import MessageBuilder
        
        msg = MessageBuilder.image(
            role="user",
            text=analysis_prompt,
            image_url=image_url
        )
        
        result = self.client.vision.analyze(msg)
        
        return {
            'analysis': result,
            'image_url': image_url,
            'prompt': analysis_prompt,
            'status': 'completed'
        }
    
    except Exception as exc:
        logger.error(f"Image analysis failed: {exc}")
        raise
```

---

### 3. Web Application Integration

```python
# web_app.py
from flask import Flask, request, jsonify
from tasks import generate_text, generate_image, analyze_image
from celery.result import AsyncResult
import uuid

app = Flask(__name__)

@app.route('/generate/text', methods=['POST'])
def submit_text_generation():
    """Submit text generation task."""
    
    data = request.get_json()
    prompt = data.get('prompt', '')
    max_tokens = data.get('max_tokens', 100)
    temperature = data.get('temperature', 0.7)
    
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400
    
    # Submit Celery task
    task = generate_text.delay(prompt, max_tokens, temperature)
    
    return jsonify({
        'task_id': task.id,
        'status': 'submitted',
        'message': 'Task submitted for processing'
    })

@app.route('/generate/image', methods=['POST'])
def submit_image_generation():
    """Submit image generation task."""
    
    data = request.get_json()
    prompt = data.get('prompt', '')
    width = data.get('width', 1024)
    height = data.get('height', 1024)
    
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400
    
    # Submit Celery task
    task = generate_image.delay(prompt, width, height)
    
    return jsonify({
        'task_id': task.id,
        'status': 'submitted',
        'message': 'Image generation task submitted'
    })

@app.route('/task/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """Get task status and result."""
    
    task = AsyncResult(task_id)
    
    response = {
        'task_id': task_id,
        'status': task.status,
        'ready': task.ready()
    }
    
    if task.ready():
        if task.successful():
            response['result'] = task.result
        else:
            response['error'] = str(task.result)  # task.result contains the exception
    
    return jsonify(response)

@app.route('/task/<task_id>/revoke', methods=['POST'])
def revoke_task(task_id):
    """Revoke a running task."""
    
    from celery_app import celery_app
    
    celery_app.control.revoke(task_id, terminate=True)
    
    return jsonify({
        'task_id': task_id,
        'status': 'revoked',
        'message': 'Task has been revoked'
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
```

---

## Advanced Patterns

### 4. Batch Processing

```python
# batch_tasks.py
from celery import group, chain, chord
from tasks import generate_text, generate_image
import logging

logger = logging.getLogger(__name__)

@celery_app.task(bind=True)
def process_batch_text(self, prompts: list, **kwargs):
    """Process multiple text prompts in parallel."""
    
    logger.info(f"Starting batch processing of {len(prompts)} prompts")
    
    # Create group of tasks for parallel execution
    job = group(
        generate_text.s(prompt, **kwargs)
        for prompt in prompts
    )
    
    # Execute group and wait for results
    result = job.apply_async()
    
    return {
        'batch_id': self.request.id,
        'total_prompts': len(prompts),
        'task_ids': [task.id for task in result.children],
        'status': 'processing'
    }

@celery_app.task(bind=True)
def process_batch_with_aggregation(self, prompts: list, **kwargs):
    """Process batch and aggregate results."""
    
    # Create chord: group of tasks + callback
    chord_job = chord(
        (generate_text.s(prompt, **kwargs) for prompt in prompts),
        aggregate_results.s()
    )
    
    result = chord_job.apply_async()
    
    return {
        'batch_id': self.request.id,
        'chord_id': result.id,
        'status': 'processing'
    }

@celery_app.task
def aggregate_results(results):
    """Aggregate results from batch processing."""
    
    total_tokens = sum(result.get('tokens_used', 0) for result in results)
    combined_text = ' '.join(result.get('text', '') for result in results)
    
    return {
        'total_results': len(results),
        'total_tokens': total_tokens,
        'combined_text_length': len(combined_text),
        'status': 'completed'
    }

@celery_app.task(bind=True)
def process_pipeline(self, initial_prompt: str):
    """Process a pipeline of AI tasks."""
    
    # Chain multiple tasks
    pipeline = chain(
        generate_text.s(initial_prompt, max_tokens=200),
        process_generated_text.s(),  # Custom processing task
        generate_summary.s(),        # Summarize the processed text
        save_to_database.s()         # Save final result
    )
    
    result = pipeline.apply_async()
    
    return {
        'pipeline_id': self.request.id,
        'chain_id': result.id,
        'status': 'processing'
    }

@celery_app.task
def process_generated_text(previous_result):
    """Process the generated text."""
    
    text = previous_result.get('text', '')
    
    # Custom processing logic
    processed_text = text.upper()  # Example processing
    
    return {
        'original_text': text,
        'processed_text': processed_text,
        'processing_step': 'uppercase_conversion'
    }

@celery_app.task
def generate_summary(previous_result):
    """Generate summary of processed text."""
    
    processed_text = previous_result.get('processed_text', '')
    
    # Generate summary (simplified)
    summary = processed_text[:100] + "..."
    
    return {
        'summary': summary,
        'original_length': len(processed_text),
        'summary_length': len(summary)
    }

@celery_app.task
def save_to_database(previous_result):
    """Save result to database."""
    
    # In production, implement actual database save
    logger.info(f"Saving result: {previous_result}")
    
    return {
        'status': 'saved',
        'result': previous_result
    }
```

---

### 5. Scheduled Tasks

```python
# scheduled_tasks.py
from celery import Celery
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)

# Add to celery_app.py
@celery_app.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):
    """Setup periodic tasks."""
    
    # Generate daily content summary
    sender.add_periodic_task(
        crontab(hour=9, minute=0),  # Daily at 9 AM
        generate_daily_summary.s(),
        name='daily-content-summary'
    )
    
    # Clean up old task results every hour
    sender.add_periodic_task(
        crontab(minute=0),  # Every hour
        cleanup_old_results.s(),
        name='cleanup-old-results'
    )
    
    # Health check every 5 minutes
    sender.add_periodic_task(
        timedelta(minutes=5),
        health_check.s(),
        name='health-check'
    )

@celery_app.task
def generate_daily_summary():
    """Generate daily content summary."""
    
    logger.info("Generating daily content summary...")
    
    # In production, fetch yesterday's content and summarize
    summary_prompt = "Generate a summary of yesterday's AI-generated content"
    
    # This would connect to database, fetch content, and summarize
    # For now, just log the action
    logger.info("Daily summary generation completed")
    
    return {
        'status': 'completed',
        'summary_generated': True,
        'timestamp': datetime.now().isoformat()
    }

@celery_app.task
def cleanup_old_results():
    """Clean up old task results."""
    
    from celery.result import ResultSet
    
    logger.info("Cleaning up old task results...")
    
    # Clean up results older than 1 day
    # In production, implement proper cleanup logic
    
    logger.info("Old results cleanup completed")
    
    return {
        'status': 'completed',
        'cleanup_performed': True
    }

@celery_app.task
def health_check():
    """Perform health check on Blossom AI service."""
    
    try:
        config = SessionConfig(timeout=10.0)
        with BlossomClient(config=config) as client:
            result = client.text.generate("Health check", max_tokens=5)
        
        logger.info("Health check passed")
        
        return {
            'status': 'healthy',
            'response_time': '< 10s',
            'timestamp': datetime.now().isoformat()
        }
    
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        
        return {
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }
```

---

## Monitoring and Observability

### 6. Task Monitoring

```python
# monitoring.py
from celery import Celery
from celery.events import Event
import time
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

class CeleryMonitor:
    """Monitor Celery task execution."""
    
    def __init__(self, celery_app: Celery):
        self.celery_app = celery_app
        self.task_stats = defaultdict(lambda: {
            'total': 0,
            'succeeded': 0,
            'failed': 0,
            'retried': 0,
            'runtime_sum': 0.0,
            'runtime_count': 0
        })
    
    def start_monitoring(self):
        """Start monitoring Celery events."""
        
        def on_task_sent(event):
            task_name = event['task_name']
            self.task_stats[task_name]['total'] += 1
        
        def on_task_succeeded(event):
            task_name = event['task_name']
            runtime = event.get('runtime', 0)
            
            self.task_stats[task_name]['succeeded'] += 1
            self.task_stats[task_name]['runtime_sum'] += runtime
            self.task_stats[task_name]['runtime_count'] += 1
        
        def on_task_failed(event):
            task_name = event['task_name']
            self.task_stats[task_name]['failed'] += 1
        
        def on_task_retried(event):
            task_name = event['task_name']
            self.task_stats[task_name]['retried'] += 1
        
        # Setup event handlers
        with self.celery_app.connection() as connection:
            recv = self.celery_app.events.Receiver(
                connection,
                handlers={
                    'task-sent': on_task_sent,
                    'task-succeeded': on_task_succeeded,
                    'task-failed': on_task_failed,
                    'task-retried': on_task_retried,
                }
            )
            recv.capture(limit=None, timeout=None, wakeup=True)
    
    def get_stats(self):
        """Get current task statistics."""
        stats = {}
        
        for task_name, task_data in self.task_stats.items():
            avg_runtime = (
                task_data['runtime_sum'] / task_data['runtime_count']
                if task_data['runtime_count'] > 0 else 0
            )
            
            stats[task_name] = {
                'total': task_data['total'],
                'succeeded': task_data['succeeded'],
                'failed': task_data['failed'],
                'retried': task_data['retried'],
                'success_rate': (
                    task_data['succeeded'] / max(task_data['total'], 1) * 100
                ),
                'average_runtime': avg_runtime
            }
        
        return stats

# Task profiling
@celery_app.task(bind=True)
def profile_task_execution(self, task_name: str, *args, **kwargs):
    """Profile task execution time."""
    
    start_time = time.time()
    
    try:
        # Execute the actual task
        if task_name == 'generate_text':
            result = generate_text.apply_async(args=args, kwargs=kwargs)
        elif task_name == 'generate_image':
            result = generate_image.apply_async(args=args, kwargs=kwargs)
        else:
            raise ValueError(f"Unknown task: {task_name}")
        
        # Wait for result
        task_result = result.get()
        
        execution_time = time.time() - start_time
        
        return {
            'task_name': task_name,
            'execution_time': execution_time,
            'status': 'completed',
            'result': task_result
        }
    
    except Exception as e:
        execution_time = time.time() - start_time
        
        return {
            'task_name': task_name,
            'execution_time': execution_time,
            'status': 'failed',
            'error': str(e)
        }
```

---

### 7. Worker Configuration

```python
# worker_config.py
from celery import Celery
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Worker startup configuration
worker_config = {
    # Concurrency settings
    'concurrency': 4,  # Number of worker processes
    'prefetch_multiplier': 1,
    'max_tasks_per_child': 1000,
    
    # Pool settings
    'pool': 'prefork',  # or 'gevent', 'eventlet'
    'autoscale': '4,8',  # Min, max workers
    
    # Logging
    'loglevel': 'INFO',
    'logfile': 'celery_worker.log',
    
    # Monitoring
    'beat': True,  # Enable Celery Beat for scheduled tasks
    'events': True,
    'task_events': True,
    
    # Performance
    'time_limit': 300,  # 5 minutes per task
    'soft_time_limit': 240,  # 4 minutes soft limit
    'max_memory_per_child': 200000,  # 200MB
    
    # Reliability
    'task_acks_late': True,
    'task_reject_on_worker_lost': True,
    'worker_lost_wait': 60.0,
}

# Queue configuration
queue_config = {
    'text_generation': {
        'routing_key': 'text.generate',
        'concurrency': 2,
        'prefetch_multiplier': 1,
    },
    'image_generation': {
        'routing_key': 'image.generate',
        'concurrency': 1,  # Memory intensive
        'prefetch_multiplier': 1,
    },
    'batch_processing': {
        'routing_key': 'batch.*',
        'concurrency': 3,
        'prefetch_multiplier': 1,
    }
}

# Start worker with specific configuration
# celery -A celery_app worker -Q text_generation -c 2 -l INFO
# celery -A celery_app worker -Q image_generation -c 1 -l INFO
# celery -A celery_app worker -Q batch_processing -c 3 -l INFO
# celery -A celery_app beat -l INFO
```

---

## Production Deployment

### 8. Docker Configuration

```dockerfile
# Dockerfile.worker
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    build-essential \\
    redis-tools \\
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create non-root user
RUN useradd -m -u 1000 celery && chown -R celery:celery /app
USER celery

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \\
    CMD celery -A celery_app inspect ping

# Default command
CMD ["celery", "-A", "celery_app", "worker", "-c", "4", "-l", "INFO"]
```

```yaml
# docker-compose.celery.yml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  celery-worker-text:
    build:
      context: .
      dockerfile: Dockerfile.worker
    command: celery -A celery_app worker -Q text_generation -c 2 -l INFO
    depends_on:
      redis:
        condition: service_healthy
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0
      - BLOSSOM_API_KEY=${BLOSSOM_API_KEY}
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M

  celery-worker-image:
    build:
      context: .
      dockerfile: Dockerfile.worker
    command: celery -A celery_app worker -Q image_generation -c 1 -l INFO
    depends_on:
      redis:
        condition: service_healthy
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0
      - BLOSSOM_API_KEY=${BLOSSOM_API_KEY}
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 1G

  celery-beat:
    build:
      context: .
      dockerfile: Dockerfile.worker
    command: celery -A celery_app beat -l INFO
    depends_on:
      redis:
        condition: service_healthy
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped

  flower:
    build:
      context: .
      dockerfile: Dockerfile.worker
    command: celery -A celery_app flower --port=5555
    ports:
      - "5555:5555"
    depends_on:
      - redis
      - celery-worker-text
      - celery-worker-image
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0
    restart: unless-stopped

volumes:
  redis_data:
```

---

### 9. Monitoring and Alerting

```python
# monitoring_api.py
from flask import Flask, jsonify
from celery import Celery
from celery.events import Event
import psutil
import time

app = Flask(__name__)

@app.route('/metrics')
def metrics():
    """Prometheus-style metrics endpoint."""
    
    # Get Celery stats
    from celery_app import celery_app
    
    inspector = celery_app.control.inspect()
    
    # Get active tasks
    active_tasks = inspector.active()
    scheduled_tasks = inspector.scheduled()
    reserved_tasks = inspector.reserved()
    
    # Get worker stats
    worker_stats = inspector.stats()
    
    # System metrics
    cpu_percent = psutil.cpu_percent()
    memory_percent = psutil.virtual_memory().percent
    
    metrics_data = f"""
# HELP blossom_tasks_active Number of active tasks
# TYPE blossom_tasks_active gauge
blossom_tasks_active {len(active_tasks or {})}

# HELP blossom_tasks_scheduled Number of scheduled tasks
# TYPE blossom_tasks_scheduled gauge
blossom_tasks_scheduled {len(scheduled_tasks or {})}

# HELP blossom_workers_total Total number of workers
# TYPE blossom_workers_total gauge
blossom_workers_total {len(worker_stats or {})}

# HELP system_cpu_percent CPU usage percentage
# TYPE system_cpu_percent gauge
system_cpu_percent {cpu_percent}

# HELP system_memory_percent Memory usage percentage
# TYPE system_memory_percent gauge
system_memory_percent {memory_percent}
"""
    
    return metrics_data, 200, {'Content-Type': 'text/plain; version=0.0.4'}

@app.route('/health')
def health_check():
    """Health check endpoint."""
    
    from celery_app import celery_app
    
    # Check Celery connectivity
    try:
        inspector = celery_app.control.inspect()
        active_workers = inspector.active()
        
        if not active_workers:
            return jsonify({
                'status': 'unhealthy',
                'reason': 'No active Celery workers'
            }), 503
        
        return jsonify({
            'status': 'healthy',
            'workers': len(active_workers),
            'timestamp': time.time()
        })
    
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'reason': str(e)
        }), 503

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
```

---

## Testing

### 10. Celery Testing

```python
# test_tasks.py
import pytest
from unittest.mock import patch, MagicMock
from celery.result import AsyncResult
from tasks import generate_text, generate_image
import json

@pytest.fixture
def mock_blossom_client():
    """Mock Blossom client for testing."""
    
    with patch('tasks.BlossomClient') as mock_client_class:
        mock_client = MagicMock()
        mock_client_class.return_value.__enter__.return_value = mock_client
        
        # Mock text generation
        mock_client.text.generate.return_value = "Mocked generated text"
        
        # Mock image generation
        mock_image_data = b"fake_image_data"
        mock_client.image.generate.return_value = mock_image_data
        
        yield mock_client

@pytest.mark.celery
class TestCeleryTasks:
    
    def test_generate_text_task(self, mock_blossom_client):
        """Test text generation task."""
        
        # Execute task
        result = generate_text.apply(args=["Test prompt"]).get()
        
        # Assertions
        assert result['status'] == 'completed'
        assert result['text'] == "Mocked generated text"
        assert result['prompt'] == "Test prompt"
        assert result['tokens_used'] > 0
    
    def test_generate_image_task(self, mock_blossom_client):
        """Test image generation task."""
        
        # Execute task
        result = generate_image.apply(args=["Test image prompt"]).get()
        
        # Assertions
        assert result['status'] == 'completed'
        assert 'image_base64' in result
        assert result['prompt'] == "Test image prompt"
        assert result['size'] == "1024x1024"
    
    def test_task_retry_on_failure(self, mock_blossom_client):
        """Test task retry on failure."""
        
        # Make the mock fail
        mock_blossom_client.text.generate.side_effect = Exception("Generation failed")
        
        # Execute task with retry
        task = generate_text.apply_async(args=["Test prompt"])
        
        # Wait for task to complete (should fail after retries)
        with pytest.raises(Exception):
            task.get()
        
        # Verify retries were attempted
        assert mock_blossom_client.text.generate.call_count > 1

@pytest.fixture
def celery_app():
    """Configure Celery app for testing."""
    
    from celery_app import celery_app as app
    
    # Use in-memory broker for testing
    app.conf.update(
        broker_url='memory://',
        result_backend='cache+memory://',
        task_always_eager=True,  # Execute tasks immediately
        task_eager_propagates=True,
    )
    
    return app

def test_batch_processing(celery_app, mock_blossom_client):
    """Test batch processing."""
    
    from batch_tasks import process_batch_text
    
    prompts = ["Prompt 1", "Prompt 2", "Prompt 3"]
    
    # Execute batch task
    result = process_batch_text.apply(args=[prompts]).get()
    
    # Assertions
    assert result['total_prompts'] == len(prompts)
    assert 'batch_id' in result
    assert result['status'] == 'processing'
```

---

## Best Practices

### 11. Production Best Practices

```python
# production_config.py
from celery import Celery
import logging

# Production configuration
celery_app.conf.update(
    # Broker settings
    broker_url=os.getenv('CELERY_BROKER_URL', 'redis://redis:6379/0'),
    result_backend=os.getenv('CELERY_RESULT_BACKEND', 'redis://redis:6379/0'),
    
    # Task settings
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    
    # Security
    security_key=os.getenv('CELERY_SECURITY_KEY'),
    security_certificate=os.getenv('CELERY_SECURITY_CERT'),
    
    # Performance
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
    result_expires=3600,
    
    # Reliability
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    
    # Monitoring
    worker_send_task_events=True,
    task_send_sent_event=True,
    
    # Dead letter queue
    task_routes={
        'tasks.generate_text': {
            'queue': 'text_generation',
            'routing_key': 'text.generate',
        },
        'tasks.generate_image': {
            'queue': 'image_generation',
            'routing_key': 'image.generate',
        },
    },
)

# Error handling
celery_app.conf.update(
    # Retry configuration
    task_annotations={
        'tasks.generate_text': {
            'rate_limit': '100/m',
            'max_retries': 3,
            'default_retry_delay': 60,
        },
        'tasks.generate_image': {
            'rate_limit': '20/m',
            'max_retries': 2,
            'default_retry_delay': 120,
        },
    },
)
```

---

## Summary

Key Celery integration patterns for Blossom AI:

1. **Task Design**: Create focused, single-purpose tasks
2. **Error Handling**: Implement proper retry logic and error handling
3. **Monitoring**: Track task execution and performance
4. **Scalability**: Use multiple queues and workers for different task types
5. **Reliability**: Configure dead letter queues and proper acknowledgment
6. **Performance**: Optimize worker concurrency and prefetch settings
7. **Security**: Use secure broker connections and task serialization
8. **Testing**: Test tasks in isolation and as part of workflows
9. **Deployment**: Use Docker for consistent deployment
10. **Monitoring**: Implement comprehensive monitoring and alerting

---

## See Also

- [Async Patterns](ASYNC_PATTERNS.md) - Async/await best practices
- [Performance Guide](PERFORMANCE.md) - Performance optimization techniques
- [Connection Pooling](CONNECTION_POOLING.md) - HTTP connection optimization
- [FastAPI Integration](FASTAPI.md) - FastAPI framework integration
- [Flask Integration](FLASK.md) - Flask framework integration
- [Docker Guide](DOCKER.md) - Container deployment strategies