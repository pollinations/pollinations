# 🌐 Web Application Example

> Complete example of a web application using Blossom AI with FastAPI

---

## 🚀 Overview

This example demonstrates how to build a full-featured web application using:
- **FastAPI**: Modern, fast Python web framework
- **Blossom AI**: AI-powered image and text generation
- **Redis**: Distributed caching and session storage
- **PostgreSQL**: User data and analytics storage
- **Vue.js**: Interactive frontend (optional)
- **Docker**: Containerized deployment

### Features

- ✅ User authentication and sessions
- ✅ Image generation with gallery
- ✅ AI chat interface
- ✅ Image analysis upload
- ✅ Usage analytics dashboard
- ✅ Rate limiting and quotas
- ✅ WebSocket support for real-time updates

---

## 📋 Prerequisites

### Install Required Packages

```bash
pip install fastapi uvicorn redis psycopg2-binary sqlalchemy
pip install eclips-blossom-ai python-multipart jinja2
pip install python-jose[cryptography] passlib[bcrypt]
```

### System Requirements

- Python 3.11+
- Redis 6.0+
- PostgreSQL 13+
- Node.js 16+ (for frontend)

---

## 🏗️ Project Structure

```
web_app/
├── app.py                 # Main FastAPI application
├── models.py              # Data models
├── routes/                # API routes
│   ├── auth.py           # Authentication
│   ├── generate.py       # Generation endpoints
│   ├── gallery.py        # Image gallery
│   └── analytics.py      # Usage analytics
├── services/              # Business logic
│   ├── ai_service.py     # AI operations
│   ├── cache_service.py  # Caching
│   └── user_service.py   # User management
├── static/                # Static files
│   ├── css/
│   ├── js/
│   └── images/
├── templates/             # HTML templates
├── docker-compose.yml     # Docker configuration
├── requirements.txt       # Python dependencies
└── .env.example          # Environment variables
```

---

## 🔧 Configuration

### Environment Variables (.env)

```env
# Database
DATABASE_URL=postgresql://user:password@localhost/blossom_app

# Redis
REDIS_URL=redis://localhost:6379

# Blossom AI
BLOSSOM_API_KEY=your_blossom_api_key_here

# Security
SECRET_KEY=your_secret_key_here
JWT_ALGORITHM=HS256
JWT_EXPIRATION_MINUTES=10080

# Rate Limiting
RATE_LIMIT_PER_MINUTE=30
RATE_LIMIT_PER_HOUR=500

# File Uploads
MAX_UPLOAD_SIZE_MB=10
UPLOAD_DIR=./uploads

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
```

### requirements.txt

```txt
eclips-blossom-ai>=0.7.0
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
redis>=5.0.0
sqlalchemy>=2.0.0
psycopg2-binary>=2.9.0
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.0
python-multipart>=0.0.6
jinja2>=3.1.0
python-dotenv>=1.0.0
aioredis>=2.0.1
asyncpg>=0.29.0
```

---

## 🚀 Main Application (app.py)

```python
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException, Depends, status
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from redis import asyncio as aioredis
import logging

from models import Base, engine
from routes import auth, generate, gallery, analytics
from services.cache_service import CacheService
from services.ai_service import AIService
from services.user_service import UserService

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Security
security = HTTPBearer()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan."""
    # Startup
    logger.info("Starting Blossom AI Web Application...")
    
    # Create database tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Initialize services
    app.state.redis = await aioredis.from_url(
        os.getenv("REDIS_URL", "redis://localhost:6379")
    )
    
    app.state.cache_service = CacheService(app.state.redis)
    app.state.ai_service = AIService()
    app.state.user_service = UserService()
    
    logger.info("Application started successfully!")
    yield
    
    # Shutdown
    logger.info("Shutting down application...")
    await app.state.redis.close()

# Create FastAPI app
app = FastAPI(
    title="Blossom AI Web App",
    description="AI-powered image and text generation web application",
    version="1.0.0",
    lifespan=lifespan
)

# Add middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
templates = Jinja2Templates(directory="templates")

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(generate.router, prefix="/api/generate", tags=["Generation"])
app.include_router(gallery.router, prefix="/api/gallery", tags=["Gallery"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])

# Root endpoint
@app.get("/")
async def root(request: Request):
    """Serve the main application page."""
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "blossom-ai-web",
        "version": "1.0.0"
    }

@app.get("/dashboard")
async def dashboard(request: Request):
    """Serve the analytics dashboard."""
    return templates.TemplateResponse("dashboard.html", {"request": request})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
```

---

## 👤 Models (models.py)

```python
from sqlalchemy import Column, Integer, String, DateTime, Float, Text, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

# Database configuration
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://user:password@localhost/blossom_app"
)

# Create async engine
engine = create_async_engine(DATABASE_URL, echo=False)
async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Base class for models
Base = declarative_base()

class User(Base):
    """User model for authentication."""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    api_key = Column(String(255), nullable=True)
    credits = Column(Integer, default=100)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Generation(Base):
    """AI generation history."""
    __tablename__ = "generations"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    generation_type = Column(String(20), nullable=False)  # 'text' or 'image'
    prompt = Column(Text, nullable=False)
    result = Column(Text, nullable=True)
    parameters = Column(Text, nullable=True)
    credits_used = Column(Integer, default=1)
    status = Column(String(20), default='completed')  # 'pending', 'completed', 'failed'
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

class ImageGallery(Base):
    """User's image gallery."""
    __tablename__ = "image_gallery"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    generation_id = Column(Integer, nullable=False)
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=True)
    file_size = Column(Integer, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    is_public = Column(Boolean, default=False)
    tags = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class UsageStats(Base):
    """Usage analytics."""
    __tablename__ = "usage_stats"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    date = Column(DateTime, nullable=False)
    text_generations = Column(Integer, default=0)
    image_generations = Column(Integer, default=0)
    image_analyses = Column(Integer, default=0)
    credits_spent = Column(Integer, default=0)
    api_calls = Column(Integer, default=0)
    cache_hits = Column(Integer, default=0)
    average_response_time = Column(Float, default=0.0)

# Dependency for database sessions
async def get_db():
    async with async_session_maker() as session:
        yield session
```

---

## 🤖 AI Service (services/ai_service.py)

```python
import os
import asyncio
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
from blossom_ai import (
    BlossomClient,
    SessionConfig,
    ValidationError,
    RateLimitError,
    AuthenticationError,
    NetworkError
)
from blossom_ai.utils.cache import CacheManager, CacheConfig

logger = logging.getLogger(__name__)

class AIService:
    """Service for AI operations with caching and rate limiting."""
    
    def __init__(self):
        self.config = SessionConfig(
            api_key=os.getenv("BLOSSOM_API_KEY"),
            cache_enabled=True,
            cache_backend="redis",
            rate_limit_per_minute=120,
            timeout=60.0
        )
        
        # Initialize cache
        cache_config = CacheConfig(
            backend="redis",
            host="localhost",
            port=6379,
            ttl=3600
        )
        self.cache = CacheManager(cache_config)
    
    async def generate_text(
        self,
        prompt: str,
        user_id: int,
        model: str = "gpt-4",
        max_tokens: int = 1000,
        temperature: float = 0.7,
        **kwargs
    ) -> Dict[str, Any]:
        """Generate text with caching and error handling."""
        
        # Create cache key
        cache_key = f"text:{user_id}:{hash(prompt + model + str(max_tokens))}"
        
        # Check cache first
        cached_result = self.cache.get(cache_key)
        if cached_result:
            logger.info(f"Cache hit for user {user_id}")
            return cached_result
        
        try:
            async with BlossomClient(config=self.config) as client:
                start_time = datetime.utcnow()
                
                response = await client.text.generate(
                    prompt=prompt,
                    model=model,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    **kwargs
                )
                
                end_time = datetime.utcnow()
                response_time = (end_time - start_time).total_seconds()
                
                result = {
                    "text": response.text,
                    "tokens_used": response.total_tokens,
                    "model": response.model,
                    "response_time": response_time,
                    "cached": False
                }
                
                # Cache the result
                self.cache.set(cache_key, result, ttl=3600)
                
                logger.info(
                    f"Text generated for user {user_id}: "
                    f"{response.total_tokens} tokens in {response_time:.2f}s"
                )
                
                return result
        
        except RateLimitError as e:
            logger.warning(f"Rate limit exceeded for user {user_id}")
            raise
        except NetworkError as e:
            logger.error(f"Network error for user {user_id}: {e}")
            raise
        except Exception as e:
            logger.error(f"Error generating text for user {user_id}: {e}")
            raise
    
    async def generate_image(
        self,
        prompt: str,
        user_id: int,
        width: int = 1024,
        height: int = 1024,
        quality: str = "standard",
        **kwargs
    ) -> Dict[str, Any]:
        """Generate image with progress tracking."""
        
        cache_key = f"image:{user_id}:{hash(prompt + str(width) + str(height) + quality)}"
        
        # Check cache
        cached_result = self.cache.get(cache_key)
        if cached_result:
            logger.info(f"Cache hit for image generation user {user_id}")
            return cached_result
        
        try:
            async with BlossomClient(config=self.config) as client:
                start_time = datetime.utcnow()
                
                image = await client.image.generate(
                    prompt=prompt,
                    width=width,
                    height=height,
                    quality=quality,
                    model="dall-e-3",
                    **kwargs
                )
                
                end_time = datetime.utcnow()
                response_time = (end_time - start_time).total_seconds()
                
                # Save image temporarily
                temp_path = f"/tmp/img_{user_id}_{datetime.utcnow().timestamp()}.png"
                image.save(temp_path)
                
                result = {
                    "image_path": temp_path,
                    "revised_prompt": image.revised_prompt,
                    "size": f"{width}x{height}",
                    "quality": quality,
                    "response_time": response_time,
                    "cached": False
                }
                
                # Cache metadata (not the image itself)
                metadata = result.copy()
                metadata.pop("image_path")  # Don't cache file path
                self.cache.set(cache_key, metadata, ttl=7200)
                
                logger.info(
                    f"Image generated for user {user_id}: "
                    f"{width}x{height} {quality} in {response_time:.2f}s"
                )
                
                return result
        
        except Exception as e:
            logger.error(f"Error generating image for user {user_id}: {e}")
            raise
    
    async def analyze_image(
        self,
        image_bytes: bytes,
        user_id: int,
        prompt: str = "analyze this image",
        **kwargs
    ) -> Dict[str, Any]:
        """Analyze image with detailed results."""
        
        cache_key = f"analysis:{user_id}:{hash(image_bytes + prompt.encode())}"
        
        # Check cache
        cached_result = self.cache.get(cache_key)
        if cached_result:
            logger.info(f"Cache hit for image analysis user {user_id}")
            return cached_result
        
        try:
            async with BlossomClient(config=self.config) as client:
                start_time = datetime.utcnow()
                
                analysis = await client.vision.analyze(
                    image_bytes=image_bytes,
                    prompt=prompt,
                    detail="high",
                    max_tokens=500,
                    **kwargs
                )
                
                end_time = datetime.utcnow()
                response_time = (end_time - start_time).total_seconds()
                
                result = {
                    "description": analysis.description,
                    "objects": analysis.objects or [],
                    "colors": analysis.colors or [],
                    "text": getattr(analysis, 'text', ''),
                    "response_time": response_time,
                    "cached": False
                }
                
                # Cache result
                self.cache.set(cache_key, result, ttl=86400)
                
                logger.info(
                    f"Image analyzed for user {user_id} in {response_time:.2f}s"
                )
                
                return result
        
        except Exception as e:
            logger.error(f"Error analyzing image for user {user_id}: {e}")
            raise
    
    async def batch_generate(
        self,
        requests: List[Dict[str, Any]],
        user_id: int
    ) -> List[Dict[str, Any]]:
        """Generate multiple items in batch."""
        
        results = []
        
        # Process in batches of 5
        batch_size = 5
        
        async with BlossomClient(config=self.config) as client:
            for i in range(0, len(requests), batch_size):
                batch = requests[i:i + batch_size]
                
                # Create tasks
                tasks = []
                for request in batch:
                    if request["type"] == "text":
                        task = client.text.generate(
                            request["prompt"],
                            **request.get("params", {})
                        )
                    elif request["type"] == "image":
                        task = client.image.generate(
                            request["prompt"],
                            **request.get("params", {})
                        )
                    tasks.append(task)
                
                # Execute batch
                batch_results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # Process results
                for j, result in enumerate(batch_results):
                    if isinstance(result, Exception):
                        results.append({
                            "error": str(result),
                            "request": batch[j]
                        })
                    else:
                        results.append({
                            "result": result,
                            "request": batch[j]
                        })
                
                # Small delay between batches
                await asyncio.sleep(0.5)
        
        return results

# Singleton instance
ai_service = AIService()
```

---

## 🌐 API Routes

### Generation Routes (routes/generate.py)

```python
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
import os

from models import get_db, Generation, ImageGallery
from services.ai_service import ai_service
from services.cache_service import cache_service
from services.user_service import get_current_user

router = APIRouter()

@router.post("/text")
async def generate_text(
    request: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generate text from prompt."""
    
    try:
        # Check user credits
        if current_user["credits"] < 1:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Insufficient credits"
            )
        
        # Generate text
        result = await ai_service.generate_text(
            prompt=request["prompt"],
            user_id=current_user["id"],
            model=request.get("model", "gpt-4"),
            max_tokens=request.get("max_tokens", 1000),
            temperature=request.get("temperature", 0.7)
        )
        
        # Log generation
        generation = Generation(
            user_id=current_user["id"],
            generation_type="text",
            prompt=request["prompt"],
            result=result["text"],
            parameters=str(request),
            credits_used=1
        )
        db.add(generation)
        await db.commit()
        
        # Update user credits
        # ... credit deduction logic ...
        
        return {
            "success": True,
            "data": {
                "text": result["text"],
                "tokens_used": result["tokens_used"],
                "model": result["model"],
                "response_time": result["response_time"],
                "cached": result["cached"]
            }
        }
    
    except Exception as e:
        logger.error(f"Text generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/image")
async def generate_image(
    request: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generate image from prompt."""
    
    try:
        # Check user credits (images cost more)
        if current_user["credits"] < 5:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Insufficient credits"
            )
        
        # Generate image
        result = await ai_service.generate_image(
            prompt=request["prompt"],
            user_id=current_user["id"],
            width=request.get("width", 1024),
            height=request.get("height", 1024),
            quality=request.get("quality", "standard")
        )
        
        # Save to gallery
        gallery_item = ImageGallery(
            user_id=current_user["id"],
            generation_id=0,  # Will be updated
            filename=os.path.basename(result["image_path"]),
            width=result["width"],
            height=result["height"],
            is_public=request.get("is_public", False),
            tags=request.get("tags", "")
        )
        db.add(gallery_item)
        await db.commit()
        
        return {
            "success": True,
            "data": {
                "image_url": f"/api/gallery/image/{gallery_item.id}",
                "revised_prompt": result["revised_prompt"],
                "size": result["size"],
                "quality": result["quality"],
                "response_time": result["response_time"]
            }
        }
    
    except Exception as e:
        logger.error(f"Image generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/batch")
async def batch_generate(
    requests: List[dict],
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generate multiple items in batch."""
    
    try:
        # Check credits
        total_cost = sum(1 if req["type"] == "text" else 5 for req in requests)
        if current_user["credits"] < total_cost:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Insufficient credits for batch operation"
            )
        
        # Process batch
        results = await ai_service.batch_generate(requests, current_user["id"])
        
        return {
            "success": True,
            "data": {
                "results": results,
                "total_processed": len(results),
                "errors": sum(1 for r in results if "error" in r)
            }
        }
    
    except Exception as e:
        logger.error(f"Batch generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/analyze")
async def analyze_image(
    file: UploadFile = File(...),
    prompt: Optional[str] = "analyze this image",
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Analyze uploaded image."""
    
    try:
        # Check user credits
        if current_user["credits"] < 2:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Insufficient credits"
            )
        
        # Validate file
        if not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be an image"
            )
        
        # Read image
        image_bytes = await file.read()
        
        if len(image_bytes) > 10 * 1024 * 1024:  # 10MB limit
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Image too large"
            )
        
        # Analyze image
        result = await ai_service.analyze_image(
            image_bytes=image_bytes,
            user_id=current_user["id"],
            prompt=prompt
        )
        
        return {
            "success": True,
            "data": {
                "description": result["description"],
                "objects": result["objects"],
                "colors": result["colors"],
                "text": result["text"],
                "response_time": result["response_time"],
                "cached": result["cached"]
            }
        }
    
    except Exception as e:
        logger.error(f"Image analysis failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
```

---

## 🐳 Docker Deployment

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql+asyncpg://postgres:password@db:5432/blossom_app
      - REDIS_URL=redis://redis:6379
      - BLOSSOM_API_KEY=${BLOSSOM_API_KEY}
      - SECRET_KEY=${SECRET_KEY}
      - ENVIRONMENT=production
    depends_on:
      - db
      - redis
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=blossom_app
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

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

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
      - ./static:/app/static
      - ./uploads:/app/uploads
    depends_on:
      - app
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:

networks:
  default:
    driver: bridge
```

### Dockerfile

```dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create necessary directories
RUN mkdir -p uploads logs

# Expose port
EXPOSE 8000

# Run application
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 📊 Monitoring and Scaling

### 1. Add Prometheus Metrics

```python
from prometheus_client import Counter, Histogram, Gauge, generate_latest
from fastapi import Response

# Metrics
request_count = Counter('http_requests_total', 'Total HTTP requests', ['method', 'endpoint'])
request_duration = Histogram('http_request_duration_seconds', 'HTTP request duration')
active_users = Gauge('active_users', 'Number of active users')
ai_requests = Counter('ai_requests_total', 'AI requests', ['type', 'status'])

def record_ai_request(request_type: str, status: str):
    ai_requests.labels(type=request_type, status=status).inc()

@app.middleware("http")
async def prometheus_middleware(request: Request, call_next):
    start_time = time.time()
    
    # Count requests
    request_count.labels(
        method=request.method,
        endpoint=request.url.path
    ).inc()
    
    # Process request
    response = await call_next(request)
    
    # Record duration
    duration = time.time() - start_time
    request_duration.observe(duration)
    
    return response

@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return Response(generate_latest(), media_type="text/plain")
```

### 2. Auto-scaling Configuration

```yaml
# kubernetes/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: blossom-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: blossom-app
  minReplicas: 2
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

## 🎓 Best Practices

### 1. Security

```python
# Use proper authentication
from fastapi.security import HTTPBearer

security = HTTPBearer()

async def get_current_user(token: str = Depends(security)):
    """Validate JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials"
            )
        return {"id": user_id}
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )

# Rate limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@app.post("/generate/text")
@limiter.limit("10/minute")
async def generate_text(...):
    pass
```

### 2. Error Handling

```python
class AIError(Exception):
    """Base exception for AI errors."""
    pass

class RateLimitError(AIError):
    """Rate limit exceeded."""
    pass

class InsufficientCreditsError(AIError):
    """Not enough credits."""
    pass

# Global exception handler
@app.exception_handler(AIError)
async def ai_exception_handler(request: Request, exc: AIError):
    if isinstance(exc, RateLimitError):
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded"}
        )
    elif isinstance(exc, InsufficientCreditsError):
        return JSONResponse(
            status_code=402,
            content={"detail": "Insufficient credits"}
        )
    
    return JSONResponse(
        status_code=500,
        content={"detail": "AI service error"}
    )
```

### 3. Performance

```python
# Use connection pooling
from sqlalchemy.pool import AsyncAdaptedQueuePool

engine = create_async_engine(
    DATABASE_URL,
    poolclass=AsyncAdaptedQueuePool,
    pool_size=20,
    max_overflow=0,
    pool_pre_ping=True,
    pool_recycle=300
)

# Cache frequently accessed data
from functools import lru_cache

@lru_cache(maxsize=1000)
def get_user_quota(user_id: int) -> int:
    """Get user quota with caching."""
    # Database query here
    pass
```

---

## 🚀 Deployment Commands

```bash
# Build and start with docker-compose
docker-compose up --build

# Scale the application
docker-compose up --scale app=3

# View logs
docker-compose logs -f app

# Stop services
docker-compose down

# Update containers
docker-compose pull
docker-compose up -d
```

---

## 📚 Related Documentation

- [🚀 FastAPI Documentation](https://fastapi.tiangolo.com/)
- [🔄 Async SQLAlchemy](https://docs.sqlalchemy.org/en/14/orm/extensions/asyncio.html)
- [💾 Redis Python Client](https://redis-py.readthedocs.io/)
- [🐳 Docker Compose](https://docs.docker.com/compose/)
- [🎓 Performance Tuning](PERFORMANCE.md)
