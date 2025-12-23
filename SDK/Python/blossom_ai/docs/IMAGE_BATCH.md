# 💾 Batch Image Processing

> **Generate and process multiple images efficiently**

---

## 📋 Table of Contents

- [Batch Generation](#batch-generation)
- [Batch Processing Patterns](#batch-processing-patterns)
- [Parallel Processing](#parallel-processing)
- [Batch Utilities](#batch-utilities)
- [Performance Optimization](#performance-optimization)

---

## 🚀 Quick Start

### Simple Batch Generation

```python
from blossom_ai import BlossomClient

with BlossomClient() as client:
    # Generate multiple images at once
    prompts = [
        "sunset over mountains",
        "forest in autumn",
        "ocean waves",
        "city skyline at night"
    ]
    
    images = client.image.generate_batch(prompts)
    
    for i, image in enumerate(images):
        image.save(f"batch_image_{i}.png")
```

### Batch with Progress Tracking

```python
import asyncio

async def generate_with_progress(prompts):
    """Generate batch with progress tracking"""
    
    completed = 0
    total = len(prompts)
    
    def on_progress(current, total):
        print(f"Progress: {current}/{total} ({current/total*100:.1f}%)")
    
    images = await client.image.generate_batch_async(
        prompts=prompts,
        progress_callback=on_progress
    )
    
    return images

# Use with async
prompts = [f"landscape {i}" for i in range(10)]
images = await generate_with_progress(prompts)
```

---

## 🎨 Batch Generation Options

### Different Sizes

```python
# Batch with different sizes
batch_requests = [
    {"prompt": "portrait", "width": 1024, "height": 1536},
    {"prompt": "landscape", "width": 1536, "height": 1024},
    {"prompt": "square", "width": 1024, "height": 1024},
]

images = client.image.generate_batch_custom(batch_requests)
```

### Batch with Quality Settings

```python
# High-quality batch
images = client.image.generate_batch(
    prompts=prompts,
    quality="hd",
    guidance_scale=7.5,
    steps=30
)
```

### Batch with Negative Prompts

```python
# Batch with shared negative prompt
negative_prompt = "blurry, low quality, distorted"

images = client.image.generate_batch(
    prompts=prompts,
    negative_prompt=negative_prompt
)
```

---

## 🔄 Batch Processing Patterns

### Template-Based Generation

```python
class BatchTemplate:
    """Generate images from templates"""
    
    def __init__(self, client):
        self.client = client
    
    def generate_product_variants(self, base_product, styles):
        """Generate product images in different styles"""
        
        prompts = [
            f"{base_product}, {style} style"
            for style in styles
        ]
        
        return self.client.image.generate_batch(
            prompts=prompts,
            width=1024,
            height=1024,
            quality="hd"
        )
    
    def generate_character_poses(self, character, poses):
        """Generate character in different poses"""
        
        prompts = [
            f"{character}, {pose} pose"
            for pose in poses
        ]
        
        return self.client.image.generate_batch(
            prompts=prompts,
            seed=42424242  # Consistent character
        )

# Usage
template = BatchTemplate(client)

# Product variants
products = template.generate_product_variants(
    base_product="modern chair",
    styles=["minimalist", "industrial", "scandinavian", "art deco"]
)

# Character poses
character_images = template.generate_character_poses(
    character="anime girl with blue hair",
    poses=["standing", "sitting", "running", "jumping"]
)
```

### Data-Driven Generation

```python
import pandas as pd

def generate_from_dataframe(df, client):
    """Generate images from a pandas DataFrame"""
    
    results = []
    
    for _, row in df.iterrows():
        image = client.image.generate(
            prompt=row['prompt'],
            width=row.get('width', 1024),
            height=row.get('height', 1024),
            style_preset=row.get('style', 'photographic')
        )
        
        results.append({
            'id': row['id'],
            'prompt': row['prompt'],
            'image': image
        })
    
    return results

# Example DataFrame
df = pd.DataFrame({
    'id': [1, 2, 3, 4],
    'prompt': [
        'sunset beach',
        'mountain peak',
        'forest path',
        'city lights'
    ],
    'style': ['photographic', 'artistic', 'natural', 'urban']
})

results = generate_from_dataframe(df, client)
```

---

## ⚡ Parallel Processing

### Async Batch Processing

```python
import asyncio
import aiohttp
from concurrent.futures import ThreadPoolExecutor

class AsyncBatchProcessor:
    def __init__(self, client, max_concurrent=5):
        self.client = client
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.executor = ThreadPoolExecutor(max_workers=max_concurrent)
    
    async def process_single(self, prompt, **kwargs):
        """Process single image with concurrency control"""
        async with self.semaphore:
            return await self.client.image.generate_async(
                prompt=prompt,
                **kwargs
            )
    
    async def process_batch(self, prompts, **kwargs):
        """Process entire batch asynchronously"""
        tasks = [
            self.process_single(prompt, **kwargs)
            for prompt in prompts
        ]
        
        return await asyncio.gather(*tasks)

# Usage
processor = AsyncBatchProcessor(client, max_concurrent=3)

prompts = [f"artistic image {i}" for i in range(20)]
images = await processor.process_batch(
    prompts=prompts,
    quality="hd",
    width=1024,
    height=1024
)
```

### Thread Pool Processing

```python
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

def process_batch_threaded(prompts, client, max_workers=4):
    """Process batch using thread pool"""
    
    results = [None] * len(prompts)
    lock = threading.Lock()
    
    def process_single(index_prompt):
        index, prompt = index_prompt
        
        try:
            image = client.image.generate(prompt)
            
            with lock:
                results[index] = image
                
            return f"Completed: {prompt}"
        except Exception as e:
            return f"Failed: {prompt} - {e}"
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(process_single, (i, p))
            for i, p in enumerate(prompts)
        ]
        
        for future in as_completed(futures):
            print(future.result())
    
    return results

# Usage
prompts = [f"threaded image {i}" for i in range(10)]
images = process_batch_threaded(prompts, client, max_workers=4)
```

---

## 🛠️ Batch Utilities

### Batch Resizing

```python
def batch_resize(images, target_size=(512, 512)):
    """Resize multiple images"""
    resized = []
    
    for image in images:
        resized.append(
            image.resize(target_size, Image.Resampling.LANCZOS)
        )
    
    return resized

# Resize all generated images
resized_images = batch_resize(images, (256, 256))
```

### Batch Format Conversion

```python
def batch_convert_format(images, format="JPEG", quality=85):
    """Convert multiple images to specified format"""
    converted = []
    
    for image in images:
        buffer = io.BytesIO()
        image.save(buffer, format=format, quality=quality)
        buffer.seek(0)
        
        converted_image = Image.open(buffer)
        converted.append(converted_image)
    
    return converted

# Convert to JPEG
jpeg_images = batch_convert_format(images, "JPEG", quality=90)
```

### Batch Watermarking

```python
def add_watermark_batch(images, watermark_text):
    """Add watermark to multiple images"""
    watermarked = []
    
    for image in images:
        # Create watermark
        draw = ImageDraw.Draw(image)
        
        # Get text size
        bbox = draw.textbbox((0, 0), watermark_text)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        # Position at bottom right
        x = image.width - text_width - 10
        y = image.height - text_height - 10
        
        # Add semi-transparent background
        overlay = Image.new('RGBA', image.size, (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        overlay_draw.rectangle(
            [(x-5, y-5), (x+text_width+5, y+text_height+5)],
            fill=(0, 0, 0, 128)
        )
        
        # Composite overlay
        image = Image.alpha_composite(
            image.convert('RGBA'),
            overlay
        ).convert('RGB')
        
        # Add text
        draw = ImageDraw.Draw(image)
        draw.text((x, y), watermark_text, fill=(255, 255, 255))
        
        watermarked.append(image)
    
    return watermarked

# Add watermarks
watermarked = add_watermark_batch(images, "© My Company")
```

---

## 📊 Batch Processing with Progress

### Progress Bar

```python
from tqdm import tqdm
import time

class BatchProcessorWithProgress:
    def __init__(self, client):
        self.client = client
        self.processed = 0
        self.failed = 0
    
    def process_with_progress(self, prompts, **kwargs):
        """Process batch with progress bar"""
        
        results = []
        
        with tqdm(total=len(prompts), desc="Generating images") as pbar:
            for prompt in prompts:
                try:
                    image = self.client.image.generate(prompt, **kwargs)
                    results.append({"success": True, "image": image})
                    self.processed += 1
                except Exception as e:
                    results.append({"success": False, "error": str(e)})
                    self.failed += 1
                
                pbar.update(1)
                pbar.set_postfix(
                    processed=self.processed,
                    failed=self.failed
                )
        
        return results

# Usage
processor = BatchProcessorWithProgress(client)
prompts = [f"progress image {i}" for i in range(50)]

results = processor.process_with_progress(
    prompts=prompts,
    quality="hd",
    width=1024,
    height=1024
)
```

### Real-time Monitoring

```python
import asyncio
from dataclasses import dataclass
from typing import List, Callable

@dataclass
class BatchProgress:
    total: int
    completed: int
    failed: int
    current_prompt: str = ""
    
    @property
    def success_rate(self) -> float:
        if self.completed == 0:
            return 0.0
        return (self.completed - self.failed) / self.completed * 100

class MonitoredBatchProcessor:
    def __init__(self, client):
        self.client = client
        self.progress_callbacks: List[Callable] = []
    
    def add_progress_callback(self, callback: Callable):
        """Add callback for progress updates"""
        self.progress_callbacks.append(callback)
    
    async def notify_progress(self, progress: BatchProgress):
        """Notify all callbacks"""
        for callback in self.progress_callbacks:
            await callback(progress)
    
    async def process_monitored(self, prompts, **kwargs):
        """Process with real-time monitoring"""
        
        progress = BatchProgress(
            total=len(prompts),
            completed=0,
            failed=0
        )
        
        results = []
        
        for i, prompt in enumerate(prompts):
            progress.current_prompt = prompt
            await self.notify_progress(progress)
            
            try:
                image = await self.client.image.generate_async(
                    prompt=prompt,
                    **kwargs
                )
                results.append({"success": True, "image": image})
                progress.completed += 1
            except Exception as e:
                results.append({"success": False, "error": str(e)})
                progress.completed += 1
                progress.failed += 1
            
            await self.notify_progress(progress)
        
        return results

# Usage
async def progress_handler(progress: BatchProgress):
    print(f"Progress: {progress.completed}/{progress.total} "
          f"({progress.success_rate:.1f}% success)")

processor = MonitoredBatchProcessor(client)
processor.add_progress_callback(progress_handler)

prompts = [f"monitored image {i}" for i in range(20)]
results = await processor.process_monitored(prompts)
```

---

## 🎯 Performance Optimization

### Connection Pooling

```python
import httpx
from blossom_ai import BlossomClient

# Use custom HTTP client with connection pooling
http_client = httpx.AsyncClient(
    limits=httpx.Limits(
        max_keepalive_connections=20,
        max_connections=100,
        keepalive_expiry=30.0
    )
)

client = BlossomClient(http_client=http_client)

# Now batch operations will reuse connections
images = await client.image.generate_batch_async(prompts)

# Close when done
await http_client.aclose()
```

### Caching

```python
from blossom_ai.utils.cache import CacheManager, CacheConfig

# Set up cache for batch operations
cache = CacheManager(CacheConfig(
    backend="memory",
    ttl=3600,
    max_size=1000
))

client = BlossomClient(cache=cache)

# First batch - will cache results
images1 = client.image.generate_batch(prompts)

# Second batch with same prompts - will use cache
images2 = client.image.generate_batch(prompts)  # Much faster!
```

### Rate Limiting

```python
from blossom_ai.utils.rate_limiter import RateLimiter

# Rate limiter for batch operations
rate_limiter = RateLimiter(
    requests_per_minute=60,
    burst_limit=10
)

async def rate_limited_batch(prompts, client):
    """Process batch with rate limiting"""
    
    results = []
    
    for prompt in prompts:
        await rate_limiter.acquire()
        
        image = await client.image.generate_async(prompt)
        results.append(image)
    
    return results

# Process 100 prompts with rate limiting
prompts = [f"rate limited {i}" for i in range(100)]
images = await rate_limited_batch(prompts, client)
```

---

## 📚 Further Reading

- [Image Generation Basics](IMAGE_GENERATION.md)
- [Advanced Image Controls](IMAGE_ADVANCED.md)
- [URL Generation](IMAGE_URLS.md)
- [Performance Optimization](PERFORMANCE.md)
- [Async Patterns](ASYNC_PATTERNS.md)