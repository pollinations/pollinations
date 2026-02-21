# 🎨 Image Generation Guide

> Complete guide to generating images with Blossom AI

---

## 🚀 Quick Start

### Basic Image Generation

```python
from blossom_ai import ai

# Generate an image
image = ai.image.generate("a majestic mountain landscape")

# Save to file
image.save("mountain.png")

# Or get as bytes
image_bytes = image.bytes
```

---

## 📋 Parameters

### Basic Parameters

```python
image = ai.image.generate(
    prompt="a futuristic city",
    
    # Image size (default: 1024x1024)
    width=1920,
    height=1080,
    
    # Quality settings
    quality="hd",  # "standard" or "hd"
    
    # Guidance scale (how closely to follow the prompt)
    guidance_scale=7.5,  # Range: 1.0 - 20.0
    
    # Number of images
    n=1,  # Generate multiple images
    
    # Model selection
    model="dall-e-3",  # or "dall-e-2"
    
    # Response format
    response_format="url",  # "url" or "b64_json"
    
    # Style (DALL-E 3 only)
    style="vivid",  # "vivid" or "natural"
)
```

---

## 🎨 Image Sizes

### Supported Sizes by Model

#### DALL-E 3
- `1024x1024` (default)
- `1024x1792` (portrait)
- `1792x1024` (landscape)

#### DALL-E 2
- `256x256`
- `512x512`
- `1024x1024`

### Examples

```python
# Square image (1:1)
image = ai.image.generate(
    "a beautiful flower",
    width=1024,
    height=1024
)

# Landscape (16:9)
image = ai.image.generate(
    "a wide landscape",
    width=1792,
    height=1024
)

# Portrait (9:16)
image = ai.image.generate(
    "a tall building",
    width=1024,
    height=1792
)
```

---

## 🎯 Quality Settings

### Standard vs HD Quality

```python
# Standard quality (faster, cheaper)
image = ai.image.generate(
    "a simple sketch",
    quality="standard"
)

# HD quality (slower, better details)
image = ai.image.generate(
    "a detailed portrait",
    quality="hd"
)
```

### Guidance Scale

Controls how closely the AI follows your prompt:

```python
# Low guidance = more creative freedom
image = ai.image.generate(
    "a fantasy creature",
    guidance_scale=4.0  # More artistic variation
)

# High guidance = strict adherence
image = ai.image.generate(
    "a red apple on white background",
    guidance_scale=15.0  # Follow prompt exactly
)
```

**Guidelines:**
- Creative/artistic: 4.0 - 8.0
- Balanced: 7.5 (default)
- Precise: 10.0 - 20.0

---

## 🔄 Batch Generation

### Generate Multiple Images

```python
# Generate multiple images at once
images = ai.image.generate(
    "a cute cat",
    n=4,  # Generate 4 images
    size="1024x1024"
)

# images is now a list of 4 images
for i, image in enumerate(images):
    image.save(f"cat_{i}.png")
```

### Batch with Different Prompts

```python
prompts = [
    "a red sports car",
    "a blue sports car",
    "a green sports car",
    "a yellow sports car"
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

## 🌟 Advanced Features

### Negative Prompts

Exclude unwanted elements:

```python
image = ai.image.generate(
    "a beautiful landscape",
    negative_prompt="blurry, low quality, distorted"
)
```

### Seed for Reproducibility

```python
image = ai.image.generate(
    "a specific scene",
    seed=12345  # Same seed = same image
)
```

---

## 💾 Saving Images

### Different Formats

```python
image = ai.image.generate("a test image")

# Save as PNG (default)
image.save("image.png")

# Save as JPEG
image.save("image.jpg", format="JPEG")

# Save with specific path
image.save("/path/to/output/folder/image.png")
```

### Get Image Data

```python
# Get as bytes
image_bytes = image.bytes

# Get as PIL Image
pil_image = image.pil_image

# Get as base64
base64_data = image.b64_json

# Get URL (if available)
url = image.url
```

---

## 🏗️ Using BlossomClient

### Advanced Configuration

```python
from blossom_ai import BlossomClient, SessionConfig

config = SessionConfig(
    api_key="your-api-key",
    cache_enabled=True
)

with BlossomClient(config=config) as client:
    image = client.image.generate(
        "a detailed fantasy landscape",
        width=1920,
        height=1080,
        quality="hd",
        guidance_scale=7.5,
        model="dall-e-3",
        style="vivid"
    )
    
    # Save the image
    image.save("fantasy_landscape.png")
```

### Async Usage

```python
import asyncio
from blossom_ai import BlossomClient

async def generate_image():
    async with BlossomClient() as client:
        image = await client.image.generate(
            "an async generated image"
        )
        image.save("async_image.png")

# Run async function
asyncio.run(generate_image())
```

---

## 🎭 Style Examples

### Photorealistic

```python
image = ai.image.generate(
    "a photorealistic image of a golden retriever playing in a sunny field",
    quality="hd",
    style="natural"
)
```

### Artistic

```python
image = ai.image.generate(
    "an oil painting of a mountain lake at sunset, in the style of Bob Ross",
    quality="hd",
    style="vivid"
)
```

### Digital Art

```python
image = ai.image.generate(
    "digital art of a cyberpunk city with neon lights and rain",
    quality="hd",
    guidance_scale=8.0
)
```

### Sketch

```python
image = ai.image.generate(
    "a pencil sketch of a person's portrait",
    quality="standard",
    style="natural"
)
```

---

## 🛠️ Error Handling

```python
from blossom_ai import BlossomError, RateLimitError

try:
    image = ai.image.generate("test image")
except RateLimitError:
    print("Rate limit exceeded. Try again later.")
except BlossomError as e:
    print(f"Error generating image: {e}")
```

---

## 📊 Performance Tips

### 1. Use Appropriate Quality

```python
# For thumbnails/previews
image = ai.image.generate(
    "preview",
    quality="standard",
    size="512x512"
)

# For final production
image = ai.image.generate(
    "final",
    quality="hd",
    size="1024x1024"
)
```

### 2. Enable Caching

```python
from blossom_ai import SessionConfig

config = SessionConfig(cache_enabled=True)

with BlossomClient(config=config) as client:
    # This will be cached
    image1 = client.image.generate("same prompt")
    # This will use cache (instant)
    image2 = client.image.generate("same prompt")
```

### 3. Batch Processing

```python
# Instead of individual calls
images = []
prompts = ["image1", "image2", "image3"]

for prompt in prompts:
    image = ai.image.generate(prompt)
    images.append(image)
```

---

## 🎓 Best Practices

### 1. Descriptive Prompts

```python
# Good ✅
image = ai.image.generate(
    "a photorealistic image of a red apple on a white wooden table, "
    "soft natural lighting, high resolution, professional photography"
)

# Bad ❌
image = ai.image.generate("apple")
```

### 2. Use Context Managers

```python
# Good ✅
with BlossomClient() as client:
    image = client.image.generate("test")
    
# Bad ❌
client = BlossomClient()
image = client.image.generate("test")
# Resources not cleaned up
```

### 3. Handle Errors Gracefully

```python
def generate_image_safe(prompt):
    try:
        return ai.image.generate(prompt)
    except Exception as e:
        print(f"Failed to generate image: {e}")
        return None
```

---

## 🔗 Related Documentation

- [🌈 Advanced Image Controls](IMAGE_ADVANCED.md)
- [🔗 URL Generation](IMAGE_URLS.md)
- [💾 Batch Processing](IMAGE_BATCH.md)
- [🎨 Image API Reference](API_IMAGE.md)
