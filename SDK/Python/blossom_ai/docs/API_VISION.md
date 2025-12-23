# 👁️ Vision API Reference

> **Complete reference for image analysis and multimodal endpoints in Blossom AI**

---

## Overview

The Vision API provides comprehensive image analysis capabilities through multimodal models that can understand and describe images. It supports local files, URLs, and comparison of multiple images.

## Quick Start

```python
from blossom_ai import BlossomClient, MessageBuilder

async with BlossomClient() as client:
    # Analyze an image from URL
    messages = [
        MessageBuilder.image(
            role="user",
            text="What's in this image?",
            image_url="https://example.com/photo.jpg"
        )
    ]
    description = await client.text.chat(messages, model="openai")
    
    # Analyze a local image
    from pathlib import Path
    image_path = Path("my_photo.jpg")
    
    messages = [
        MessageBuilder.image(
            role="user", 
            text="Describe this photo",
            image_path=image_path
        )
    ]
    description = await client.text.chat(messages)
```

---

## MessageBuilder for Vision

The `MessageBuilder` class provides convenient methods for creating vision messages.

### `MessageBuilder.image()`

Create a message with an image attachment.

```python
MessageBuilder.image(
    role: str,
    text: str,
    image_url: Optional[str] = None,
    image_path: Optional[Union[str, Path]] = None,
    detail: str = "auto"
) -> Dict[str, Any]
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `role` | `str` | **Required** | Message role (`"user"`, `"assistant"`) |
| `text` | `str` | **Required** | Text content of the message |
| `image_url` | `str` | `None` | URL of the image |
| `image_path` | `str/Path` | `None` | Local path to the image file |
| `detail` | `str` | `"auto"` | Detail level (`"low"`, `"high"`, `"auto"`) |

**Returns:**
- `Dict[str, Any]`: Message object ready for chat API

**Examples:**

```python
# From URL
msg1 = MessageBuilder.image(
    role="user",
    text="What's in this image?",
    image_url="https://example.com/photo.jpg",
    detail="high"
)

# From local file
msg2 = MessageBuilder.image(
    role="user",
    text="Analyze this diagram",
    image_path="/path/to/diagram.png"
)

# Multiple images in one message
msg3 = MessageBuilder.image(
    role="user",
    text="Compare these two images",
    image_url="https://example.com/img1.jpg"
)
```

**Note:** You must provide either `image_url` OR `image_path`, not both.

---

## Vision Analysis Patterns

### Single Image Analysis

```python
async def analyze_image(client, image_url, question="What's in this image?"):
    messages = [
        MessageBuilder.image(
            role="user",
            text=question,
            image_url=image_url,
            detail="high"
        )
    ]
    
    response = await client.text.chat(messages, model="openai")
    return response

# Usage
description = await analyze_image(
    client,
    "https://example.com/landscape.jpg",
    "Describe this landscape in detail"
)
```

---

### Local Image Analysis

```python
from pathlib import Path
from blossom_ai.utils.security import validate_image_file

async def analyze_local_image(client, image_path):
    # Validate the image file first
    validated_path = validate_image_file(image_path)
    
    messages = [
        MessageBuilder.image(
            role="user",
            text="Analyze this image",
            image_path=validated_path,
            detail="auto"
        )
    ]
    
    response = await client.text.chat(messages)
    return response

# Usage
image_path = Path("photos/my_photo.jpg")
analysis = await analyze_local_image(client, image_path)
```

---

### Multiple Image Comparison

```python
async def compare_images(client, image_urls, comparison_question):
    messages = []
    
    # Add first image
    messages.append(
        MessageBuilder.image(
            role="user",
            text=f"Here is the first image. {comparison_question}",
            image_url=image_urls[0]
        )
    )
    
    # Add subsequent images
    for i, url in enumerate(image_urls[1:], 1):
        messages.append(
            MessageBuilder.image(
                role="user",
                text=f"Here is image {i+1}:",
                image_url=url
            )
        )
    
    response = await client.text.chat(messages, model="openai")
    return response

# Usage
image_urls = [
    "https://example.com/product1.jpg",
    "https://example.com/product2.jpg",
    "https://example.com/product3.jpg"
]

comparison = await compare_images(
    client,
    image_urls,
    "Compare these products and recommend the best one"
)
```

---

### Batch Image Analysis

```python
async def analyze_images_batch(client, image_data_list):
    """Analyze multiple images concurrently."""
    
    async def analyze_single(data):
        image_url, question = data
        messages = [
            MessageBuilder.image(
                role="user",
                text=question,
                image_url=image_url
            )
        ]
        return await client.text.chat(messages)
    
    # Process all images concurrently
    results = await asyncio.gather(*[
        analyze_single(data) for data in image_data_list
    ])
    
    return results

# Usage
image_analyses = [
    ("https://example.com/img1.jpg", "What object is this?"),
    ("https://example.com/img2.jpg", "What color is dominant?"),
    ("https://example.com/img3.jpg", "Is this indoors or outdoors?")
]

results = await analyze_images_batch(client, image_analyses)
```

---

## Vision Use Cases

### 1. Image Captioning

```python
async def generate_caption(client, image_url, style="concise"):
    """Generate captions for images."""
    
    style_prompts = {
        "concise": "Write a one-sentence caption for this image:",
        "detailed": "Write a detailed description of this image:",
        "social": "Write an engaging social media caption for this image:",
        "alt": "Write alt text for this image (describe for accessibility):"
    }
    
    messages = [
        MessageBuilder.image(
            role="user",
            text=style_prompts[style],
            image_url=image_url
        )
    ]
    
    caption = await client.text.chat(messages)
    return caption

# Usage
caption = await generate_caption(
    client,
    "https://example.com/photo.jpg",
    style="social"
)
```

---

### 2. OCR and Text Extraction

```python
async def extract_text_from_image(client, image_path):
    """Extract text from an image using OCR."""
    
    messages = [
        MessageBuilder.image(
            role="user",
            text="Extract all text visible in this image. Preserve formatting:",
            image_path=image_path,
            detail="high"
        )
    ]
    
    text = await client.text.chat(messages)
    return text

# Usage
extracted_text = await extract_text_from_image(
    client,
    "documents/scanned_page.png"
)
```

---

### 3. Visual Question Answering

```python
async def visual_qa(client, image_url, question):
    """Answer questions about an image."""
    
    messages = [
        MessageBuilder.image(
            role="user",
            text=f"Question: {question}",
            image_url=image_url,
            detail="high"
        )
    ]
    
    answer = await client.text.chat(messages)
    return answer

# Usage
answer = await visual_qa(
    client,
    "https://example.com/chart.jpg",
    "What is the highest value shown in this chart?"
)
```

---

### 4. Image Classification

```python
async def classify_image(client, image_url, categories):
    """Classify image into predefined categories."""
    
    categories_str = ", ".join(categories)
    
    messages = [
        MessageBuilder.image(
            role="user",
            text=f"Classify this image into one of these categories: {categories_str}. Respond with only the category name.",
            image_url=image_url
        )
    ]
    
    classification = await client.text.chat(messages)
    return classification.strip()

# Usage
category = await classify_image(
    client,
    "https://example.com/animal.jpg",
    ["cat", "dog", "bird", "other"]
)
```

---

### 5. Object Detection and Counting

```python
async def count_objects(client, image_url, object_type):
    """Count specific objects in an image."""
    
    messages = [
        MessageBuilder.image(
            role="user",
            text=f"How many {object_type} are in this image? Respond with only a number.",
            image_url=image_url
        )
    ]
    
    count_str = await client.text.chat(messages)
    try:
        return int(count_str.strip())
    except ValueError:
        return None

# Usage
people_count = await count_objects(
    client,
    "https://example.com/crowd.jpg",
    "people"
)
```

---

## Advanced Vision Patterns

### Image Quality Assessment

```python
async def assess_image_quality(client, image_url):
    """Assess the quality of an image."""
    
    aspects = [
        "sharpness",
        "exposure", 
        "color balance",
        "composition",
        "overall quality"
    ]
    
    messages = [
        MessageBuilder.image(
            role="user",
            text=f"Rate this image's {', '.join(aspects)} on a scale of 1-10. Format as JSON.",
            image_url=image_url,
            detail="high"
        )
    ]
    
    assessment = await client.text.chat(messages)
    return assessment
```

---

### Visual Content Moderation

```python
async def moderate_image_content(client, image_path):
    """Check if image content is appropriate."""
    
    messages = [
        MessageBuilder.image(
            role="user",
            text="Is this image safe for work? Answer only 'safe' or 'unsafe'.",
            image_path=image_path
        )
    ]
    
    result = await client.text.chat(messages)
    return result.strip().lower() == "safe"
```

---

### Image Similarity

```python
async def compare_image_similarity(client, image1_url, image2_url):
    """Compare similarity between two images."""
    
    messages = [
        MessageBuilder.image(
            role="user",
            text="How similar are these two images? Rate from 0-100.",
            image_url=image1_url
        ),
        MessageBuilder.image(
            role="user",
            text="Here is the second image:",
            image_url=image2_url
        )
    ]
    
    similarity = await client.text.chat(messages)
    return similarity
```

---

## Error Handling

```python
from blossom_ai import ValidationError, FileTooLargeError

try:
    messages = [
        MessageBuilder.image(
            role="user",
            text="Analyze this",
            image_path="invalid_path.jpg"
        )
    ]
    result = await client.text.chat(messages)
except ValidationError as e:
    print(f"Invalid image or parameters: {e}")
except FileTooLargeError as e:
    print(f"Image too large: {e}")
except Exception as e:
    print(f"Analysis failed: {e}")
```

---

## Best Practices

### 1. Choose Appropriate Detail Level

```python
# For simple recognition - use low detail (faster, cheaper)
msg = MessageBuilder.image(
    role="user",
    text="What is this object?",
    image_url=url,
    detail="low"
)

# For detailed analysis - use high detail
msg = MessageBuilder.image(
    role="user",
    text="Analyze every detail of this image",
    image_url=url,
    detail="high"
)
```

### 2. Handle Large Images

```python
from blossom_ai.utils.security import validate_image_file

async def analyze_large_image(client, image_path):
    # Validate first
    validated = validate_image_file(image_path)
    
    # Check file size
    size_mb = validated.stat().st_size / (1024 * 1024)
    if size_mb > 10:  # 10MB limit
        print("Image too large, consider resizing")
        return None
    
    # Proceed with analysis
    messages = [MessageBuilder.image(role="user", text="Analyze:", image_path=validated)]
    return await client.text.chat(messages)
```

### 3. Batch Processing

```python
async def process_images_batch(client, image_paths, batch_size=5):
    """Process images in batches to avoid overwhelming the API."""
    
    results = []
    for i in range(0, len(image_paths), batch_size):
        batch = image_paths[i:i + batch_size]
        
        batch_tasks = [
            analyze_local_image(client, path) 
            for path in batch
        ]
        
        batch_results = await asyncio.gather(*batch_tasks)
        results.extend(batch_results)
        
        # Rate limiting between batches
        await asyncio.sleep(1)
    
    return results
```

### 4. Caching Vision Results

```python
from blossom_ai import CacheManager, CacheConfig

# Set up caching
config = CacheConfig(ttl=86400)  # 24 hour cache
cache = CacheManager(config)

async def cached_image_analysis(client, image_url, question):
    # Create cache key
    cache_key = f"vision:{image_url}:{hash(question)}"
    
    # Try cache first
    cached = await cache.aget(cache_key)
    if cached:
        return cached
    
    # Generate new analysis
    messages = [MessageBuilder.image(role="user", text=question, image_url=image_url)]
    result = await client.text.chat(messages)
    
    # Cache result
    await cache.aset(cache_key, result)
    return result
```

---

## Supported Image Formats

| Format | Extension | Max Size | Notes |
|--------|-----------|----------|-------|
| JPEG | `.jpg`, `.jpeg` | 10MB | Best for photos |
| PNG | `.png` | 10MB | Best for graphics, supports transparency |
| WebP | `.webp` | 10MB | Good compression |
| GIF | `.gif` | 10MB | Animated GIFs supported |
| BMP | `.bmp` | 10MB | Uncompressed |

---

## Performance Tips

| Technique | Impact | Description |
|-----------|--------|-------------|
| **Use `detail="low"`** | High | 2-3x faster for simple tasks |
| **Resize large images** | High | Reduce upload time |
| **Batch requests** | Medium | Better throughput |
| **Cache results** | High | Avoid re-analyzing |
| **Use efficient formats** | Low | WebP smaller than PNG |

---

## Rate Limits

Vision API requests count against your text generation rate limits:

- **Standard**: 60 requests/minute (default)
- **With API key**: Up to 100,000 requests/minute
- **Image size**: Up to 10MB per image

---

## See Also

- [Vision Analysis Guide](VISION.md) - Basic vision usage
- [Local Images](VISION_LOCAL.md) - Working with local files
- [Multiple Images](VISION_MULTI.md) - Comparing and analyzing multiple images
- [Multimodal Apps](MULTIMODAL_APPS.md) - Building vision-powered applications
- [MessageBuilder API](API_TEXT.md) - Text API reference