# 👁️ Vision Analysis Guide

> Complete guide to analyzing images with AI vision capabilities

---

## 🚀 Quick Start

### Basic Image Analysis

```python
from blossom_ai import ai

# Analyze image from URL
analysis = ai.vision.analyze(
    image_url="https://example.com/photo.jpg",
    prompt="describe what you see in this image"
)

print(analysis.description)
print(analysis.objects)
```

---

## 📋 Parameters

### Basic Vision Parameters

```python
analysis = ai.vision.analyze(
    # Image input (choose one)
    image_url="https://example.com/image.jpg",
    image_path="/path/to/local/image.png",
    image_bytes=image_bytes,
    
    # Analysis prompt
    prompt="what is happening in this image?",
    
    # Detail level
    detail="auto",  # "low", "high", or "auto"
    
    # Maximum tokens for response
    max_tokens=300,
    
    # Model selection
    model="gpt-4-vision-preview",
    
    # Temperature for response creativity
    temperature=0.3
)
```

---

## 🎯 Detail Levels

### Low Detail

```python
# Fast, cheaper analysis
analysis = ai.vision.analyze(
    image_url="https://example.com/photo.jpg",
    prompt="basic description",
    detail="low"
)

print(analysis.description)  # Brief overview
```

### High Detail

```python
# Detailed, comprehensive analysis
analysis = ai.vision.analyze(
    image_url="https://example.com/photo.jpg",
    prompt="analyze every detail",
    detail="high"
)

print(analysis.description)  # Detailed analysis
print(analysis.objects)      # Detected objects
print(analysis.colors)       # Color analysis
```

### Auto Detail

```python
# Let AI choose appropriate detail level
analysis = ai.vision.analyze(
    image_url="https://example.com/photo.jpg",
    prompt="describe this image",
    detail="auto"  # Default
)
```

---

## 🖼️ Local Images

### Analyzing Local Files

```python
from blossom_ai import ai

# Analyze local image file
analysis = ai.vision.analyze(
    image_path="/path/to/your/image.jpg",
    prompt="describe this image in detail"
)

print(analysis.description)
```

### Working with PIL Images

```python
from PIL import Image
import io

# Open with PIL
pil_image = Image.open("image.jpg")

# Convert to bytes
image_bytes = io.BytesIO()
pil_image.save(image_bytes, format='PNG')
image_bytes = image_bytes.getvalue()

# Analyze
analysis = ai.vision.analyze(
    image_bytes=image_bytes,
    prompt="analyze this image"
)
```

### Multiple Local Images

```python
import os
from pathlib import Path

image_folder = Path("/path/to/images")

for image_file in image_folder.glob("*.jpg"):
    analysis = ai.vision.analyze(
        image_path=str(image_file),
        prompt=f"analyze the contents of {image_file.name}"
    )
    
    print(f"{image_file.name}: {analysis.description}")
```

---

## 🔍 Analysis Types

### 1. Object Detection

```python
analysis = ai.vision.analyze(
    image_url="https://example.com/street.jpg",
    prompt="list all objects you can identify in this image"
)

print(analysis.objects)  # List of detected objects
```

### 2. Scene Description

```python
analysis = ai.vision.analyze(
    image_url="https://example.com/landscape.jpg",
    prompt="describe the scene, atmosphere, and mood"
)

print(analysis.description)
```

### 3. Text Extraction (OCR)

```python
analysis = ai.vision.analyze(
    image_url="https://example.com/document.jpg",
    prompt="extract all text from this image"
)

print(analysis.text)  # Extracted text
```

### 4. Color Analysis

```python
analysis = ai.vision.analyze(
    image_url="https://example.com/art.jpg",
    prompt="analyze the color palette and composition"
)

print(analysis.colors)  # Color information
```

### 5. Style Analysis

```python
analysis = ai.vision.analyze(
    image_url="https://example.com/painting.jpg",
    prompt="analyze the artistic style and technique"
)

print(analysis.style)  # Style information
```

---

## 📊 Multiple Images

### Comparing Images

```python
# Compare two images
analysis = ai.vision.compare(
    image1_url="https://example.com/image1.jpg",
    image2_url="https://example.com/image2.jpg",
    prompt="compare these two images and highlight differences"
)

print(analysis.comparison)
print(analysis.similarity_score)
```

### Batch Analysis

```python
image_urls = [
    "https://example.com/image1.jpg",
    "https://example.com/image2.jpg",
    "https://example.com/image3.jpg"
]

results = []
for url in image_urls:
    analysis = ai.vision.analyze(
        image_url=url,
        prompt="describe this image"
    )
    results.append(analysis.description)

# Process all results
for i, description in enumerate(results):
    print(f"Image {i+1}: {description}")
```

---

## 🎓 Advanced Prompts

### Specific Analysis Tasks

```python
# Count objects
analysis = ai.vision.analyze(
    image_url="https://example.com/crowd.jpg",
    prompt="count the number of people in this image"
)
print(analysis.count)

# Identify emotions
analysis = ai.vision.analyze(
    image_url="https://example.com/faces.jpg",
    prompt="identify the emotions of people in this image"
)
print(analysis.emotions)

# Technical analysis
analysis = ai.vision.analyze(
    image_url="https://example.com/product.jpg",
    prompt="analyze this product image for quality and defects"
)
print(analysis.quality_score)
```

### Structured Output

```python
analysis = ai.vision.analyze(
    image_url="https://example.com/scene.jpg",
    prompt="analyze this image and provide: 1) main objects, 2) scene type, 3) colors, 4) mood"
)

# Structured response
print(analysis.structured_output)
```

---

## 🏗️ Using BlossomClient

### Vision with Client

```python
from blossom_ai import BlossomClient

with BlossomClient() as client:
    # Analyze single image
    analysis = client.vision.analyze(
        image_url="https://example.com/photo.jpg",
        prompt="describe this image",
        detail="high"
    )
    
    print(analysis.description)
    
    # Compare multiple images
    comparison = client.vision.compare(
        image1_url="https://example.com/img1.jpg",
        image2_url="https://example.com/img2.jpg",
        prompt="find similarities"
    )
    
    print(comparison.similarity_score)
```

### Async Vision

```python
import asyncio
from blossom_ai import BlossomClient

async def analyze_async():
    async with BlossomClient() as client:
        analysis = await client.vision.analyze(
            image_url="https://example.com/photo.jpg",
            prompt="async analysis"
        )
        return analysis.description

# Run async analysis
description = asyncio.run(analyze_async())
print(description)
```

---

## 🎭 Use Cases

### 1. Content Moderation

```python
def moderate_image(image_url):
    """Check if image is appropriate."""
    analysis = ai.vision.analyze(
        image_url=image_url,
        prompt="check this image for inappropriate content, violence, or nudity"
    )
    
    return analysis.is_appropriate

# Moderate user uploaded content
if moderate_image(user_image_url):
    print("✅ Image is appropriate")
else:
    print("❌ Image contains inappropriate content")
```

### 2. Product Catalog Analysis

```python
def analyze_product_image(image_path):
    """Analyze product image for catalog."""
    analysis = ai.vision.analyze(
        image_path=image_path,
        prompt="describe this product, its color, material, and condition"
    )
    
    return {
        "description": analysis.description,
        "color": analysis.colors,
        "category": analysis.category
    }

# Analyze product
product_info = analyze_product_image("product.jpg")
```

### 3. Document Processing

```python
def process_document(image_path):
    """Extract information from document image."""
    analysis = ai.vision.analyze(
        image_path=image_path,
        prompt="extract all text and identify document type"
    )
    
    return {
        "text": analysis.text,
        "type": analysis.document_type,
        "fields": analysis.extracted_fields
    }
```

### 4. Social Media Analysis

```python
def analyze_social_image(image_url):
    """Analyze image for social media insights."""
    analysis = ai.vision.analyze(
        image_url=image_url,
        prompt="analyze this image for engagement potential, mood, and content type"
    )
    
    return {
        "engagement_score": analysis.engagement_score,
        "mood": analysis.mood,
        "content_type": analysis.content_type
    }
```

---

## 🔒 Security Considerations

### Safe Image Handling

```python
from blossom_ai.utils.security import validate_image_file

# Validate image before processing
image_path = "user_upload.jpg"

if validate_image_file(image_path):
    # Safe to process
    analysis = ai.vision.analyze(
        image_path=image_path,
        prompt="analyze image"
    )
else:
    print("Invalid or unsafe image file")
```

### URL Validation

```python
from urllib.parse import urlparse

def validate_image_url(url):
    """Validate image URL."""
    parsed = urlparse(url)
    
    # Check if HTTPS
    if parsed.scheme != "https":
        return False
    
    # Check domain whitelist
    allowed_domains = ["example.com", "cdn.example.com"]
    if parsed.netloc not in allowed_domains:
        return False
    
    return True

# Validate before analysis
if validate_image_url(image_url):
    analysis = ai.vision.analyze(image_url=image_url)
```

---

## 🛠️ Error Handling

```python
from blossom_ai import BlossomError, VisionError

try:
    analysis = ai.vision.analyze(
        image_url="https://example.com/image.jpg",
        prompt="describe this image"
    )
except VisionError as e:
    print(f"Vision analysis failed: {e}")
except BlossomError as e:
    print(f"General error: {e}")
```

---

## 📊 Performance Tips

### 1. Choose Appropriate Detail Level

```python
# For quick analysis
analysis = ai.vision.analyze(
    image_url=url,
    prompt="quick overview",
    detail="low"  # Faster, cheaper
)

# For detailed analysis
analysis = ai.vision.analyze(
    image_url=url,
    prompt="detailed analysis",
    detail="high"  # Slower, more detailed
)
```

### 2. Use Caching

```python
from blossom_ai import SessionConfig

config = SessionConfig(cache_enabled=True)

with BlossomClient(config=config) as client:
    # This will be cached
    analysis1 = client.vision.analyze(image_url=url)
    # This will use cache
    analysis2 = client.vision.analyze(image_url=url)
```

### 3. Batch Processing

```python
# Process multiple images efficiently
image_urls = [url1, url2, url3, url4]

analyses = []
for url in image_urls:
    analysis = ai.vision.analyze(
        image_url=url,
        detail="low"  # Faster for batch processing
    )
    analyses.append(analysis)
```

---

## 🔗 Related Documentation

- [🖼️ Local Images](VISION_LOCAL.md)
- [📊 Multiple Images](VISION_MULTI.md)
- [🎭 Multimodal Apps](MULTIMODAL_APPS.md)
- [👁️ Vision API Reference](API_VISION.md)
