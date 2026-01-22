# 🐳 Docker Deployment Guide

> **Deploy Blossom AI applications with Docker containers**

---

## Overview

This guide covers Docker deployment strategies for Blossom AI applications, including multi-stage builds, container optimization, and production deployment patterns.

---

## Why Docker?

### Benefits
- **Consistency**: Same environment across dev, staging, production
- **Isolation**: Dependencies and configuration isolated from host system
- **Scalability**: Easy horizontal scaling with orchestration platforms
- **Portability**: Run anywhere Docker is supported
- **Version Control**: Immutable infrastructure with versioned images

---

## Basic Docker Setup

### 1. Simple Dockerfile

```dockerfile
# Dockerfile.simple
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 8000

# Run application
CMD ["python", "main.py"]
```

```python
# main.py (simple example)
from flask import Flask, request, jsonify
from blossom_ai import BlossomClient, SessionConfig
import os

app = Flask(__name__)

# Configuration from environment
config = SessionConfig(
    timeout=float(os.getenv('BLOSSOM_TIMEOUT', '30.0')),
    sync_pool_connections=int(os.getenv('POOL_CONNECTIONS', '10'))
)

@app.route('/generate', methods=['POST'])
def generate():
    prompt = request.json.get('prompt', '')
    
    with BlossomClient(config=config) as client:
        result = client.text.generate(prompt)
        return jsonify({'text': result})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
```

```yaml
# docker-compose.simple.yml
version: '3.8'

services:
  blossom-app:
    build: .
    ports:
      - "8000:8000"
    environment:
      - BLOSSOM_API_KEY=${BLOSSOM_API_KEY}
      - BLOSSOM_TIMEOUT=30.0
      - POOL_CONNECTIONS=10
    restart: unless-stopped
```

---

### 2. Multi-Stage Build

```dockerfile
# Dockerfile.multistage
# Build stage
FROM python:3.11-slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Production stage
FROM python:3.11-slim as production

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Create non-root user
RUN useradd -m -u 1000 blossom && \
    mkdir -p /app && \
    chown -R blossom:blossom /app

USER blossom
WORKDIR /app

# Copy application
COPY --chown=blossom:blossom . .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health')"

EXPOSE 8000

# Run application
CMD ["python", "main.py"]
```

---

## Advanced Container Patterns

### 3. Microservices Architecture

```dockerfile
# Dockerfile.api
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements-api.txt .
RUN pip install --no-cache-dir -r requirements-api.txt

# Copy API application
COPY api/ ./api/
COPY shared/ ./shared/

# Create user
RUN useradd -m -u 1000 api && \
    chown -R api:api /app

USER api

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```dockerfile
# Dockerfile.worker
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements-worker.txt .
RUN pip install --no-cache-dir -r requirements-worker.txt

# Copy worker application
COPY worker/ ./worker/
COPY shared/ ./shared/

# Create user
RUN useradd -m -u 1000 worker && \
    chown -R worker:worker /app

USER worker

CMD ["python", "-m", "worker.main"]
```

```yaml
# docker-compose.microservices.yml
version: '3.8'

services:
  # Redis for caching and message broker
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # API Gateway
  api-gateway:
    build:
      context: .
      dockerfile: Dockerfile.api
    ports:
      - "8000:8000"
    depends_on:
      redis:
        condition: service_healthy
    environment:
      - REDIS_URL=redis://redis:6379/0
      - BLOSSOM_API_KEY=${BLOSSOM_API_KEY}
    restart: unless-stopped
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 512M

  # Text Generation Worker
  text-worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    depends_on:
      redis:
        condition: service_healthy
    environment:
      - REDIS_URL=redis://redis:6379/0
      - BLOSSOM_API_KEY=${BLOSSOM_API_KEY}
      - WORKER_TYPE=text
    restart: unless-stopped
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 1G

  # Image Generation Worker
  image-worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    depends_on:
      redis:
        condition: service_healthy
    environment:
      - REDIS_URL=redis://redis:6379/0
      - BLOSSOM_API_KEY=${BLOSSOM_API_KEY}
      - WORKER_TYPE=image
    restart: unless-stopped
    deploy:
      replicas: 1
      resources:
        limits:
          memory: 2G

  # Monitoring
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - grafana_data:/var/lib/grafana
    restart: unless-stopped

volumes:
  redis_data:
  grafana_data:
```

---

### 4. Optimized Container Configuration

```dockerfile
# Dockerfile.optimized
FROM python:3.11-slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Production stage with minimal footprint
FROM python:3.11-slim as production

# Install only essential packages
RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy virtual environment
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Create non-root user
RUN useradd -m -u 1000 blossom && \
    mkdir -p /app/logs /app/data && \
    chown -R blossom:blossom /app

USER blossom
WORKDIR /app

# Copy application with proper ownership
COPY --chown=blossom:blossom . .

# Set Python path
ENV PYTHONPATH=/app

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Security: read-only root filesystem
# Add any writable volumes at runtime

EXPOSE 8000

# Use exec form for proper signal handling
CMD ["python", "main.py"]
```

---

## Production Deployment

### 5. Kubernetes Deployment

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: blossom-ai
  labels:
    name: blossom-ai
```

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: blossom-config
  namespace: blossom-ai
data:
  BLOSSOM_TIMEOUT: "30.0"
  POOL_CONNECTIONS: "20"
  LOG_LEVEL: "INFO"
  REDIS_URL: "redis://redis:6379/0"
```

```yaml
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: blossom-secrets
  namespace: blossom-ai
type: Opaque
data:
  BLOSSOM_API_KEY: # base64 encoded API key
```

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: blossom-api
  namespace: blossom-ai
  labels:
    app: blossom-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: blossom-api
  template:
    metadata:
      labels:
        app: blossom-api
    spec:
      containers:
      - name: blossom-api
        image: blossom-ai:latest
        ports:
        - containerPort: 8000
        env:
        - name: BLOSSOM_API_KEY
          valueFrom:
            secretKeyRef:
              name: blossom-secrets
              key: BLOSSOM_API_KEY
        envFrom:
        - configMapRef:
            name: blossom-config
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          runAsNonRoot: true
          runAsUser: 1000
          capabilities:
            drop:
            - ALL
        volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: cache
          mountPath: /app/.cache
      volumes:
      - name: tmp
        emptyDir: {}
      - name: cache
        emptyDir: {}
```

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: blossom-api-service
  namespace: blossom-ai
spec:
  selector:
    app: blossom-api
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8000
  type: LoadBalancer
```

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: blossom-api-hpa
  namespace: blossom-ai
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: blossom-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

---

### 6. Security Best Practices

```dockerfile
# Dockerfile.secure
FROM python:3.11-slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Security: scan dependencies
RUN pip install safety && \
    safety check --json

# Production stage
FROM python:3.11-slim as production

# Install security updates
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean

# Copy virtual environment
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Security environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONHASHSEED=random

# Create non-root user
RUN useradd -m -u 1000 blossom && \
    mkdir -p /app/logs /app/data && \
    chown -R blossom:blossom /app

# Security: set file permissions
RUN chmod -R 755 /app && \
    chmod -R 644 /app/*.py

USER blossom
WORKDIR /app

# Copy application
COPY --chown=blossom:blossom . .

# Security: remove unnecessary files
RUN rm -rf tests/ docs/ .git/

# Set resource limits
ENV MEMORY_LIMIT=512M
ENV CPU_LIMIT=1.0

EXPOSE 8000

# Security: use exec form
CMD ["python", "main.py"]
```

```yaml
# docker-compose.security.yml
version: '3.8'

services:
  blossom-app:
    build:
      context: .
      dockerfile: Dockerfile.secure
    ports:
      - "8000:8000"
    environment:
      - BLOSSOM_API_KEY=${BLOSSOM_API_KEY}
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - SETGID
      - SETUID
    read_only: true
    tmpfs:
      - /tmp:size=100M,noexec,nosuid,nodev
      - /var/tmp:size=50M,noexec,nosuid,nodev
    volumes:
      - logs:/app/logs
      - data:/app/data
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
        reservations:
          memory: 256M
          cpus: '0.5'

volumes:
  logs:
  data:
```

---

### 7. Performance Optimization

```dockerfile
# Dockerfile.performance
FROM python:3.11-slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install optimized dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Compile Python to bytecode
RUN python -m compileall /opt/venv

# Production stage
FROM python:3.11-slim as production

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Performance optimizations
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONOPTIMIZE=2
ENV PYTHONHASHSEED=random

# Create non-root user
RUN useradd -m -u 1000 blossom && \
    mkdir -p /app && \
    chown -R blossom:blossom /app

USER blossom
WORKDIR /app

# Copy pre-compiled application
COPY --chown=blossom:blossom . .

# Pre-compile application
RUN python -m compileall .

# Optimize imports
RUN python -O -m compileall .

EXPOSE 8000

# Use optimized Python interpreter
CMD ["python", "-O", "main.py"]
```

---

## Monitoring and Logging

### 8. Structured Logging

```python
# logging_config.py
import logging
import json
import os
from datetime import datetime

class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging."""
    
    def format(self, record):
        log_entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'line': record.lineno,
            'function': record.funcName,
        }
        
        if hasattr(record, 'request_id'):
            log_entry['request_id'] = record.request_id
        
        if record.exc_info:
            log_entry['exception'] = self.formatException(record.exc_info)
        
        return json.dumps(log_entry)

# Configure logging
logging_config = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'json': {
            '()': JSONFormatter,
        },
        'standard': {
            'format': '%(asctime)s [%(levelname)s] %(name)s: %(message)s'
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'level': 'INFO',
            'formatter': 'standard',
            'stream': 'ext://sys.stdout',
        },
        'file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'level': 'DEBUG',
            'formatter': 'json',
            'filename': '/app/logs/blossom.log',
            'maxBytes': 10485760,  # 10MB
            'backupCount': 5,
        },
    },
    'loggers': {
        '': {
            'handlers': ['console', 'file'],
            'level': 'DEBUG',
            'propagate': True,
        },
        'blossom_ai': {
            'handlers': ['console', 'file'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
}

# Apply logging configuration
import logging.config
logging.config.dictConfig(logging_config)
```

---

### 9. Health Monitoring

```python
# health_monitor.py
import asyncio
import psutil
import time
import logging
from blossom_ai import BlossomClient, SessionConfig

logger = logging.getLogger(__name__)

class HealthMonitor:
    """Monitor application and dependency health."""
    
    def __init__(self):
        self.start_time = time.time()
        self.config = SessionConfig(timeout=10.0)
    
    async def check_blossom_ai(self) -> dict:
        """Check Blossom AI connectivity."""
        
        try:
            start_time = time.time()
            
            async with BlossomClient(config=self.config) as client:
                result = await client.text.generate("Health check", max_tokens=5)
            
            response_time = time.time() - start_time
            
            return {
                'status': 'healthy',
                'response_time': f"{response_time:.2f}s",
                'timestamp': time.time()
            }
        
        except Exception as e:
            return {
                'status': 'unhealthy',
                'error': str(e),
                'timestamp': time.time()
            }
    
    def check_system_resources(self) -> dict:
        """Check system resource usage."""
        
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        return {
            'cpu_usage': f"{cpu_percent}%",
            'memory_usage': f"{memory.percent}%",
            'memory_available': f"{memory.available / (1024**3):.1f}GB",
            'disk_usage': f"{disk.percent}%",
            'disk_free': f"{disk.free / (1024**3):.1f}GB",
            'uptime': f"{time.time() - self.start_time:.0f}s"
        }
    
    async def get_health_status(self) -> dict:
        """Get comprehensive health status."""
        
        blossom_health = await self.check_blossom_ai()
        system_health = self.check_system_resources()
        
        overall_healthy = (
            blossom_health['status'] == 'healthy' and
            psutil.cpu_percent() < 90 and
            psutil.virtual_memory().percent < 90
        )
        
        return {
            'overall_status': 'healthy' if overall_healthy else 'unhealthy',
            'blossom_ai': blossom_health,
            'system': system_health,
            'timestamp': time.time()
        }

# FastAPI health endpoint example
from fastapi import FastAPI, HTTPException

app = FastAPI()
health_monitor = HealthMonitor()

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    
    health_status = await health_monitor.get_health_status()
    
    if health_status['overall_status'] == 'healthy':
        return health_status
    else:
        raise HTTPException(status_code=503, detail=health_status)
```

---

## Troubleshooting

### 10. Common Issues and Solutions

```python
# debug_container.py
import logging
import sys
import traceback
from blossom_ai import BlossomClient, SessionConfig

def debug_container_issues():
    """Debug common container issues."""
    
    logger = logging.getLogger(__name__)
    
    # Check environment variables
    required_vars = ['BLOSSOM_API_KEY']
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        logger.error(f"Missing required environment variables: {missing_vars}")
        return False
    
    # Test network connectivity
    try:
        import requests
        response = requests.get('https://api.blossom-ai.com/health', timeout=5)
        logger.info(f"API connectivity: {response.status_code}")
    except Exception as e:
        logger.error(f"Network connectivity issue: {e}")
        return False
    
    # Test Blossom client
    try:
        config = SessionConfig(timeout=10.0)
        with BlossomClient(config=config) as client:
            result = client.text.generate("Debug test", max_tokens=5)
        logger.info("Blossom client test successful")
    except Exception as e:
        logger.error(f"Blossom client error: {e}")
        traceback.print_exc()
        return False
    
    return True

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    success = debug_container_issues()
    sys.exit(0 if success else 1)
```

---

### 11. Performance Tuning

```yaml
# docker-compose.performance.yml
version: '3.8'

services:
  blossom-app:
    build:
      context: .
      dockerfile: Dockerfile.performance
    ports:
      - "8000:8000"
    environment:
      - BLOSSOM_API_KEY=${BLOSSOM_API_KEY}
      - PYTHONOPTIMIZE=2
      - PYTHONUNBUFFERED=1
    ulimits:
      nofile:
        soft: 65536
        hard: 65536
    sysctls:
      - net.core.somaxconn=1024
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '2.0'
        reservations:
          memory: 512M
          cpus: '1.0'
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s
```

---

## Summary

Key Docker deployment strategies for Blossom AI:

1. **Multi-stage builds**: Smaller, more secure images
2. **Security hardening**: Non-root users, minimal base images
3. **Resource optimization**: Proper memory and CPU limits
4. **Health checks**: Container and application health monitoring
5. **Configuration management**: Environment variables and secrets
6. **Networking**: Proper port exposure and service discovery
7. **Persistence**: Volume management for data and logs
8. **Monitoring**: Structured logging and metrics collection
9. **Orchestration**: Kubernetes deployment patterns
10. **Performance**: Optimized container startup and runtime

---

## See Also

- [Performance Guide](PERFORMANCE.md) - Performance optimization techniques
- [Security Guide](SECURITY.md) - Security best practices
- [Kubernetes Guide](KUBERNETES.md) - Kubernetes deployment patterns
- [Monitoring Guide](MONITORING.md) - Monitoring and observability
- [CI/CD Guide](CICD.md) - Continuous integration and deployment