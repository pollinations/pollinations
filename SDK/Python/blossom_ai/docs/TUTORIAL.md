# 🎓 Step-by-Step Tutorial

> Complete tutorial for mastering Blossom AI from beginner to advanced

---

## 🎯 Tutorial Overview

This tutorial will take you from complete beginner to Blossom AI expert through hands-on examples and real-world scenarios.

### What You'll Learn

- ✅ Basic setup and first generation
- ✅ Understanding core concepts
- ✅ Working with images and text
- ✅ Building complete applications
- ✅ Advanced features and optimization
- ✅ Production deployment

### Prerequisites

- Python 3.11 or higher
- Basic Python knowledge
- Internet connection

---

## 📚 Part 1: Getting Started

### Lesson 1: Installation and Setup

#### Step 1: Create Project

```bash
# Create project directory
mkdir my-blossom-project
cd my-blossom-project

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Linux/Mac:
source venv/bin/activate
# Windows:
venv\Scripts\activate
```

#### Step 2: Install Blossom AI

```bash
# Install Blossom AI
pip install eclips-blossom-ai

# Verify installation
python -c "import blossom_ai; print('Blossom AI installed successfully!')"
```

#### Step 3: Create First Script

Create `hello_blossom.py`:

```python
# hello_blossom.py
from blossom_ai import ai

# Generate your first text
response = ai.text.generate("Hello, Blossom AI!")
print(f"AI Response: {response.text}")

# Generate your first image
image = ai.image.generate("a beautiful flower")
image.save("flower.png")
print("Image saved as flower.png")
```

Run it:
```bash
python hello_blossom.py
```

**Expected Output:**
```
AI Response: Hello! I'm Blossom AI, ready to help you with text and image generation.
Image saved as flower.png
```

---

### Lesson 2: Understanding the Basics

#### Core Concepts

1. **Simplified API (`ai`)**: Easy-to-use interface for quick tasks
2. **BlossomClient**: Production-ready client with full control
3. **Generators**: Specialized classes for different AI tasks
4. **Configuration**: Customize behavior and performance

#### Simplified vs Production API

```python
# Simplified API (quick tasks)
from blossom_ai import ai

response = ai.text.generate("quick response")
image = ai.image.generate("quick image")

# Production API (full control)
from blossom_ai import BlossomClient, SessionConfig

config = SessionConfig(cache_enabled=True, rate_limit_per_minute=60)

with BlossomClient(config=config) as client:
    response = client.text.generate("production response")
    image = client.image.generate("production image")
```

---

### Lesson 3: Working with Text

#### Basic Text Generation

```python
from blossom_ai import ai

# Simple generation
response = ai.text.generate("write a haiku about spring")
print(response.text)

# Access response details
print(f"Tokens used: {response.total_tokens}")
print(f"Model: {response.model}")
```

#### Chat Conversations

```python
from blossom_ai import MessageBuilder

# Build a conversation
messages = [
    MessageBuilder.system("You are a helpful coding assistant."),
    MessageBuilder.user("what is recursion?"),
    MessageBuilder.assistant("Recursion is when a function calls itself."),
    MessageBuilder.user("can you show me an example in Python?")
]

# Continue the conversation
response = ai.text.chat(messages)
print(response.text)
```

#### Streaming Responses

```python
# Stream for real-time responses
stream = ai.text.generate(
    "write a long story about a robot",
    stream=True
)

# Process chunks as they arrive
for chunk in stream:
    if chunk.text:
        print(chunk.text, end="", flush=True)
```

---

### Lesson 4: Working with Images

#### Basic Image Generation

```python
from blossom_ai import ai

# Generate a simple image
image = ai.image.generate("a red apple on white background")
image.save("apple.png")

# Different sizes
landscape = ai.image.generate(
    "wide mountain landscape",
    width=1536,
    height=1024
)
landscape.save("landscape.png")

# Portrait orientation
portrait = ai.image.generate(
    "tall skyscraper",
    width=1024,
    height=1536
)
portrait.save("skyscraper.png")
```

#### Advanced Image Parameters

```python
from blossom_ai import ai

# High quality with specific parameters
image = ai.image.generate(
    prompt="a detailed fantasy dragon",
    width=1024,
    height=1024,
    quality="hd",  # High quality
    guidance_scale=8.0,  # Follow prompt closely
    model="dall-e-3",
    style="vivid"  # Vibrant colors
)

image.save("dragon.png")
```

#### Batch Image Generation

```python
from blossom_ai import ai

# Generate multiple images
prompts = [
    "a red car",
    "a blue car",
    "a green car",
    "a yellow car"
]

images = []
for prompt in prompts:
    image = ai.image.generate(prompt)
    images.append(image)

# Save all images
for i, image in enumerate(images):
    image.save(f"car_{i}.png")
```

---

## 🏗️ Part 2: Building Applications

### Lesson 5: Using BlossomClient

#### Why Use BlossomClient?

```python
# Simplified API - good for scripts
from blossom_ai import ai

# BlossomClient - better for applications
from blossom_ai import BlossomClient, SessionConfig

config = SessionConfig(
    cache_enabled=True,        # Save API calls
    rate_limit_per_minute=60,  # Respect limits
    timeout=30.0               # Handle slow responses
)

with BlossomClient(config=config) as client:
    # All operations are automatically managed
    response = client.text.generate("test")
    image = client.image.generate("test")
    # Resources cleaned up automatically
```

#### Building a Simple CLI Tool

Create `ai_cli.py`:

```python
import argparse
import sys
from blossom_ai import BlossomClient, SessionConfig

def main():
    parser = argparse.ArgumentParser(description='Blossom AI CLI Tool')
    parser.add_argument('command', choices=['text', 'image'])
    parser.add_argument('prompt', help='Text prompt for generation')
    parser.add_argument('--output', '-o', help='Output file path')
    
    args = parser.parse_args()
    
    config = SessionConfig(cache_enabled=True)
    
    with BlossomClient(config=config) as client:
        if args.command == 'text':
            response = client.text.generate(args.prompt)
            print(response.text)
        
        elif args.command == 'image':
            image = client.image.generate(args.prompt)
            output_path = args.output or 'generated.png'
            image.save(output_path)
            print(f"Image saved to {output_path}")

if __name__ == '__main__':
    main()
```

Usage:
```bash
# Generate text
python ai_cli.py text "explain quantum computing"

# Generate image
python ai_cli.py image "a cat in space" --output space_cat.png
```

---

### Lesson 6: Error Handling

#### Handling Different Error Types

```python
from blossom_ai import (
    BlossomClient,
    ValidationError,
    AuthenticationError,
    RateLimitError,
    NetworkError,
    TimeoutError
)

async def safe_generate_image(prompt):
    try:
        with BlossomClient() as client:
            image = client.image.generate(prompt)
            return image
    
    except ValidationError as e:
        print(f"Invalid prompt: {e}")
        return None
    
    except AuthenticationError:
        print("Invalid API key. Check your configuration.")
        return None
    
    except RateLimitError as e:
        print(f"Rate limited. Wait {e.retry_after} seconds.")
        await asyncio.sleep(e.retry_after)
        return await safe_generate_image(prompt)  # Retry
    
    except TimeoutError:
        print("Request timed out. Try a simpler prompt.")
        return None
    
    except NetworkError as e:
        print(f"Network error: {e}")
        return None
```

#### Retry Logic

```python
import asyncio
import random
from blossom_ai import RateLimitError, NetworkError

async def generate_with_retry(client, prompt, max_retries=3):
    for attempt in range(max_retries):
        try:
            return await client.image.generate(prompt)
        
        except RateLimitError as e:
            if attempt == max_retries - 1:
                raise
            
            # Exponential backoff with jitter
            delay = (2 ** attempt) + random.uniform(0, 1)
            print(f"Rate limited. Waiting {delay:.1f} seconds...")
            await asyncio.sleep(delay)
        
        except NetworkError as e:
            if attempt == max_retries - 1:
                raise
            
            delay = 2 ** attempt
            print(f"Network error. Retrying in {delay} seconds...")
            await asyncio.sleep(delay)
```

---

### Lesson 7: Building a Web API

#### FastAPI Integration

Create `web_api.py`:

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from blossom_ai import BlossomClient, SessionConfig
import os

app = FastAPI(title="Blossom AI API")

# Configuration
config = SessionConfig(
    api_key=os.getenv("BLOSSOM_API_KEY", ""),
    cache_enabled=True,
    rate_limit_per_minute=60
)

# Request models
class TextRequest(BaseModel):
    prompt: str
    max_tokens: int = 1000
    temperature: float = 0.7

class ImageRequest(BaseModel):
    prompt: str
    width: int = 1024
    height: int = 1024
    quality: str = "standard"

# Routes
@app.post("/generate/text")
async def generate_text(request: TextRequest):
    try:
        with BlossomClient(config=config) as client:
            response = client.text.generate(
                prompt=request.prompt,
                max_tokens=request.max_tokens,
                temperature=request.temperature
            )
            return {
                "text": response.text,
                "tokens_used": response.total_tokens,
                "model": response.model
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate/image")
async def generate_image(request: ImageRequest):
    try:
        with BlossomClient(config=config) as client:
            image = client.image.generate(
                prompt=request.prompt,
                width=request.width,
                height=request.height,
                quality=request.quality
            )
            
            # Return base64 encoded image
            return {
                "image_b64": image.b64_json,
                "revised_prompt": image.revised_prompt,
                "size": f"{request.width}x{request.height}"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Health check
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "blossom-ai-api"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

Run the API:
```bash
pip install fastapi uvicorn
python web_api.py
```

Test the API:
```bash
curl -X POST http://localhost:8000/generate/text \
  -H "Content-Type: application/json" \
  -d '{"prompt": "explain AI"}'
```

---

## 🚀 Part 3: Advanced Features

### Lesson 8: Caching and Performance

#### Understanding Caching

```python
from blossom_ai import BlossomClient, SessionConfig

# Enable caching
config = SessionConfig(
    cache_enabled=True,
    cache_backend="memory",  # or "file", "redis"
    cache_ttl=3600  # 1 hour
)

with BlossomClient(config=config) as client:
    # First call - makes API request
    response1 = client.text.generate("test prompt")
    
    # Second call - uses cache (instant)
    response2 = client.text.generate("test prompt")
    
    # Different prompt - makes new API request
    response3 = client.text.generate("different prompt")
```

#### Custom Cache Configuration

```python
from blossom_ai.utils.cache import CacheManager, CacheConfig

# Memory cache (fast, limited size)
memory_config = CacheConfig(
    backend="memory",
    max_size=1000,
    ttl=3600
)

# File cache (persistent, larger)
file_config = CacheConfig(
    backend="file",
    cache_dir="./cache",
    max_size_mb=100,
    ttl=86400
)

# Redis cache (distributed, production)
redis_config = CacheConfig(
    backend="redis",
    host="localhost",
    port=6379,
    ttl=7200
)

cache = CacheManager(memory_config)

with BlossomClient(cache=cache) as client:
    response = client.text.generate("test")
```

#### Monitoring Cache Performance

```python
import time
from blossom_ai import BlossomClient

with BlossomClient(cache_enabled=True) as client:
    # First call - cache miss
    start = time.time()
    response1 = client.text.generate("test prompt")
    miss_time = time.time() - start
    
    # Second call - cache hit
    start = time.time()
    response2 = client.text.generate("test prompt")
    hit_time = time.time() - start
    
    print(f"Cache miss: {miss_time:.3f}s")
    print(f"Cache hit: {hit_time:.3f}s")
    print(f"Speedup: {miss_time/hit_time:.1f}x")
    
    # Check cache statistics
    stats = client.get_stats()
    print(f"Hit rate: {stats['cache']['hit_rate']:.2%}")
```

---

### Lesson 9: Vision and Multimodal AI

#### Analyzing Images

```python
from blossom_ai import ai

# Analyze from URL
analysis = ai.vision.analyze(
    image_url="https://example.com/photo.jpg",
    prompt="what do you see in this image?"
)

print(f"Description: {analysis.description}")
print(f"Objects: {analysis.objects}")
print(f"Colors: {analysis.colors}")
```

#### Analyzing Local Images

```python
from blossom_ai import ai

# Analyze local file
analysis = ai.vision.analyze(
    image_path="/path/to/your/photo.jpg",
    prompt="analyze this image in detail"
)

print(analysis.description)
```

#### Comparing Images

```python
from blossom_ai import ai

# Compare two images
comparison = ai.vision.compare(
    image1_url="https://example.com/image1.jpg",
    image2_url="https://example.com/image2.jpg",
    prompt="find the differences between these images"
)

print(comparison.comparison)
print(f"Similarity: {comparison.similarity_score}")
```

---

### Lesson 10: Production Deployment

#### Environment-Specific Configuration

```python
import os
from blossom_ai import SessionConfig

# Detect environment
environment = os.getenv("ENVIRONMENT", "development")

if environment == "production":
    config = SessionConfig(
        api_key=os.getenv("BLOSSOM_API_KEY"),
        cache_enabled=True,
        cache_backend="redis",
        rate_limit_per_minute=120,
        timeout=60.0
    )
elif environment == "staging":
    config = SessionConfig(
        cache_enabled=True,
        cache_backend="file",
        rate_limit_per_minute=60
    )
else:  # development
    config = SessionConfig(
        cache_enabled=True,
        cache_backend="memory",
        rate_limit_per_minute=30
    )
```

#### Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 8000

# Run application
CMD ["python", "app.py"]
```

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    environment:
      - ENVIRONMENT=production
      - BLOSSOM_API_KEY=${BLOSSOM_API_KEY}
      - REDIS_URL=redis://redis:6379
    ports:
      - "8000:8000"
    depends_on:
      - redis
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

---

## 🎓 Best Practices Summary

### 1. Always Use Context Managers

```python
# Good ✅
with BlossomClient() as client:
    response = client.text.generate("test")

# Bad ❌
client = BlossomClient()
response = client.text.generate("test")
# Resources not cleaned up!
```

### 2. Handle Errors Gracefully

```python
# Good ✅
try:
    response = ai.text.generate("test")
except BlossomError as e:
    logger.error(f"Generation failed: {e}")
    return fallback_response()

# Bad ❌
response = ai.text.generate("test")  # May crash!
```

### 3. Use Caching in Production

```python
# Good ✅
config = SessionConfig(cache_enabled=True)

# Bad ❌
config = SessionConfig()  # No caching = wasted API calls
```

### 4. Monitor Performance

```python
# Good ✅
stats = client.get_stats()
logger.info(f"Cache hit rate: {stats['cache']['hit_rate']:.2%}")

# Bad ❌
# No monitoring = no insight
```

### 5. Respect Rate Limits

```python
# Good ✅
config = SessionConfig(rate_limit_per_minute=60)

# Bad ❌
# No rate limiting = banned API key
```

---

## 🏆 Next Steps

Congratulations! You've completed the Blossom AI tutorial. Here's what to explore next:

### Advanced Topics

1. [🏗️ Architecture Deep Dive](ARCHITECTURE.md)
2. [⚙️ Dependency Injection](DEPENDENCY_INJECTION.md)
3. [🎨 Advanced Image Controls](IMAGE_ADVANCED.md)
4. [🛠️ Function Calling](FUNCTION_CALLING.md)
5. [📊 Performance Tuning](PERFORMANCE.md)

### Real-World Examples

1. [🤖 Discord Bot](DISCORD_BOT.md)
2. [📱 Telegram Bot](TELEGRAM_BOT.md)
3. [🌐 Web Application](WEB_APP.md)
4. [📊 Data Pipeline](DATA_PIPELINE.md)

### Contributing

- [📝 Contributing Guide](CONTRIBUTING.md)
- [🎨 Code Style Guide](CODE_STYLE.md)
- [🧪 Testing Guide](TESTING.md)

---

## 💡 Quick Reference

### Common Patterns

```python
# Text generation
response = ai.text.generate("prompt", max_tokens=500, temperature=0.7)

# Chat
messages = [
    {"role": "user", "content": "hello"}
]
response = ai.text.chat(messages)

# Image generation
image = ai.image.generate("prompt", width=1024, height=1024, quality="hd")
image.save("output.png")

# Vision analysis
analysis = ai.vision.analyze(image_url="url", prompt="describe this")

# With client
with BlossomClient(config=config) as client:
    response = client.text.generate("prompt")
```

Happy coding with Blossom AI! 🌸
