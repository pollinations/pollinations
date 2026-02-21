# 🎨 Image API Reference

> **Complete reference for image generation endpoints in Blossom AI**

---

## Overview

The Image API provides comprehensive image generation capabilities through the `ImageGenerator` class, accessible via `client.image`. It supports multiple models, advanced parameters, and various output formats.

## Quick Start

```python
from blossom_ai import BlossomClient

async with BlossomClient() as client:
    # Simple generation
    image = await client.image.generate("A sunset over mountains")
    
    # With parameters
    image = await client.image.generate(
        "A futuristic city",
        model="flux",
        width=1024,
        height=768,
        quality="hd"
    )
```

---

## Core Methods

### `generate()`

Generate an image from a text prompt.

```python
await client.image.generate(
    prompt: str,
    model: str = "flux",
    width: int = 1024,
    height: int = 1024,
    quality: str = "normal",
    style: Optional[str] = None,
    seed: Optional[int] = None,
    enhance: bool = False,
    private: bool = False,
    nologo: bool = True,
    safe: bool = False,
    transparent: bool = False,
    guidance_scale: Optional[float] = None,
    negative_prompt: Optional[str] = None,
    save_as: Optional[Union[str, Path]] = None
) -> bytes
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | `str` | **Required** | Text description of the image to generate |
| `model` | `str` | `"flux"` | Model to use (`"flux"`, `"turbo"`, `"flux-realism"`, etc.) |
| `width` | `int` | `1024` | Image width in pixels (64-2048) |
| `height` | `int` | `1024` | Image height in pixels (64-2048) |
| `quality` | `str` | `"normal"` | Quality level (`"normal"`, `"hd"`) |
| `style` | `str` | `None` | Style modifier (e.g., `"photorealistic"`, `"anime"`) |
| `seed` | `int` | `None` | Random seed for reproducible results |
| `enhance` | `bool` | `False` | Apply automatic prompt enhancement |
| `private` | `bool` | `False` | Generate without logging |
| `nologo` | `bool` | `True` | Remove watermark/logo |
| `safe` | `bool` | `False` | Enable safety filter |
| `transparent` | `bool` | `False` | Generate with transparent background |
| `guidance_scale` | `float` | `None` | How closely to follow the prompt (1-20) |
| `negative_prompt` | `str` | `None` | What to avoid in the image |
| `save_as` | `str/Path` | `None` | Save directly to file path |

**Returns:**
- `bytes`: Raw image data

**Example:**
```python
# Basic generation
image_data = await client.image.generate("A cat sleeping")

# Advanced generation
image_data = await client.image.generate(
    "A steampunk airship in the clouds",
    model="flux-realism",
    width=1536,
    height=1024,
    quality="hd",
    guidance_scale=7.5,
    negative_prompt="blurry, low quality",
    seed=42
)
```

---

### `generate_url()`

Generate only the URL without making an HTTP request.

```python
client.image.generate_url(
    prompt: str,
    model: str = "flux",
    width: int = 1024,
    height: int = 1024,
    quality: str = "normal",
    **kwargs
) -> str
```

**Returns:**
- `str`: The generated URL

**Example:**
```python
url = client.image.generate_url(
    "A mountain landscape",
    model="turbo",
    width=512,
    height=512
)
print(url)  # https://gen.pollinations.ai/...
```

---

### `save()`

Generate and save an image directly to a file.

```python
await client.image.save(
    prompt: str,
    output_path: Union[str, Path],
    **kwargs
) -> Path
```

**Parameters:**
- `prompt`: Image description
- `output_path`: File path to save the image
- `**kwargs`: Same parameters as `generate()`

**Returns:**
- `Path`: Absolute path to the saved file

**Example:**
```python
from pathlib import Path

output_path = Path("images/my_artwork.png")
result_path = await client.image.save(
    "A digital artwork of a dragon",
    output_path,
    model="flux",
    width=1024,
    height=1024
)
print(f"Saved to: {result_path}")
```

---

### `generate_sync()`

Synchronous version of `generate()`.

```python
client.image.generate_sync(
    prompt: str,
    **kwargs
) -> bytes
```

**Example:**
```python
# In sync contexts (like scripts)
image_data = client.image.generate_sync("A simple icon")
```

---

### `__call__()`

Alias for `generate_sync()` for quick usage.

```python
client.image(prompt: str, **kwargs) -> bytes
```

**Example:**
```python
# Quick one-liner
image_data = client.image("A quick sketch")
```

---

## Utility Methods

### `models()`

Get available image generation models.

```python
client.image.models() -> List[str]
```

**Returns:**
- `List[str]`: List of available model names

**Example:**
```python
models = client.image.models()
print(models)  # ['flux', 'turbo', 'flux-realism', ...]
```

---

## Advanced Features

### Batch Generation

Generate multiple images efficiently:

```python
prompts = [
    "A red apple",
    "A blue sky",
    "A green forest"
]

# Concurrent generation
tasks = [client.image.generate(prompt) for prompt in prompts]
images = await asyncio.gather(*tasks)
```

### Image-to-Image (img2img)

Use existing images as references:

```python
# Coming soon - will support img2img workflows
```

### Custom Styles

Apply consistent styling across generations:

```python
style_prompts = {
    "portrait": "professional headshot, soft lighting, 85mm lens",
    "landscape": "wide angle, golden hour, cinematic",
    "product": "clean white background, studio lighting"
}

style = style_prompts["portrait"]
image = await client.image.generate(
    f"A person smiling, {style}",
    quality="hd"
)
```

---

## Error Handling

Common errors and solutions:

```python
from blossom_ai import ValidationError, RateLimitError

try:
    image = await client.image.generate("A test image")
except ValidationError as e:
    print(f"Invalid parameters: {e}")
except RateLimitError as e:
    print(f"Rate limited. Retry after: {e.retry_after}s")
except Exception as e:
    print(f"Unexpected error: {e}")
```

---

## Best Practices

### 1. Use Specific Models

```python
# For realism
await client.image.generate("A photo of...", model="flux-realism")

# For speed
await client.image.generate("Quick sketch...", model="turbo")

# For artistic
await client.image.generate("Artistic render...", model="flux")
```

### 2. Optimize Prompts

```python
# Good: specific and detailed
prompt = """A photorealistic image of a golden retriever puppy 
           sitting on a green lawn, bright sunlight, shallow depth of field"""

# Avoid: vague and generic
prompt = "dog picture"
```

### 3. Handle Large Images

```python
# For very large images, consider chunked processing
image_data = await client.image.generate(
    "Large landscape",
    width=2048,
    height=2048,
    quality="normal"  # Use normal quality for faster generation
)
```

### 4. Caching Strategy

```python
# Repeated generations benefit from caching
config = SessionConfig(cache_enabled=True, cache_ttl=3600)

async with BlossomClient(config=config) as client:
    # First call hits API
    image1 = await client.image.generate("A cat")
    
    # Second call hits cache (much faster)
    image2 = await client.image.generate("A cat")  # Cached result
```

---

## Performance Tips

| Technique | Impact | Description |
|-----------|--------|-------------|
| **Use `turbo` model** | High | 2-3x faster generation |
| **Lower resolution** | High | 512x512 vs 1024x1024 = 4x faster |
| **Enable caching** | Medium | Instant repeated generations |
| **Batch requests** | Medium | Better throughput |
| **Normal quality** | Low | Slight speed improvement |

---

## See Also

- [Image Generation Guide](IMAGE_GENERATION.md) - Basic usage examples
- [Advanced Image Controls](IMAGE_ADVANCED.md) - Detailed parameter explanations
- [Image URLs](IMAGE_URLS.md) - Working with image URLs only
- [Batch Processing](IMAGE_BATCH.md) - Large-scale image generation
- [Error Types](ERROR_TYPES.md) - Complete error reference