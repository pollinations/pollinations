# 🔗 Image URL Generation

> **Generate images and get URLs without downloading large files**

---

## 📋 Overview

Image URL generation allows you to generate images and receive URLs instead of downloading the actual image data. This is useful for:
- Reducing bandwidth usage
- Faster response times
- Storing references instead of files
- Building scalable applications

---

## 🚀 Quick Start

### Basic URL Generation

```python
from blossom_ai import BlossomClient

with BlossomClient() as client:
    # Generate image and get URL
    url = client.image.generate_url(
        prompt="a beautiful sunset over mountains",
        width=1024,
        height=1024
    )
    
    print(f"Image URL: {url}")
```

### URL with Metadata

```python
# Get URL with additional information
result = client.image.generate_url_with_info(
    prompt="professional headshot",
    width=1024,
    height=1024,
    quality="hd"
)

print(f"URL: {result.url}")
print(f"Size: {result.width}x{result.height}")
print(f"Format: {result.format}")
print(f"File size: {result.file_size} bytes")
```

---

## 🎨 URL Generation Options

### Quality Settings

```python
# Different quality options
qualities = {
    "standard": {"cost": 1, "speed": "fast"},
    "hd": {"cost": 2, "speed": "medium"},
    "ultra": {"cost": 4, "speed": "slow"}
}

# Generate HD image URL
url = client.image.generate_url(
    prompt="detailed landscape photography",
    quality="hd",
    width=1536,
    height=1024
)
```

### Format Options

```python
# Different formats
formats = {
    "jpg": {"compression": "lossy", "transparency": False},
    "png": {"compression": "lossless", "transparency": True},
    "webp": {"compression": "lossless", "transparency": True}
}

# Generate PNG with transparency
url = client.image.generate_url(
    prompt="product on transparent background",
    format="png",
    transparency=True
)
```

---

## 💾 Batch URL Generation

### Multiple URLs at Once

```python
# Generate multiple image URLs
prompts = [
    "sunset over ocean",
    "forest in autumn",
    "city skyline at night",
    "mountain landscape",
    "flower garden"
]

# Generate all URLs
urls = await client.image.generate_urls_batch(
    prompts=prompts,
    width=1024,
    height=1024,
    quality="standard"
)

for i, url in enumerate(urls):
    print(f"Image {i+1}: {url}")
```

### Batch with Different Settings

```python
# Batch generation with individual settings
batch_requests = [
    {"prompt": "portrait", "width": 1024, "height": 1536},
    {"prompt": "landscape", "width": 1536, "height": 1024},
    {"prompt": "square", "width": 1024, "height": 1024},
]

urls = await client.image.generate_urls_batch_custom(
    requests=batch_requests,
    quality="hd"
)
```

---

## 🔄 URL Management

### URL Expiration

```python
# Check URL expiration
result = client.image.generate_url_with_info(
    prompt="test image",
    expires_in=86400  # 24 hours in seconds
)

print(f"URL expires at: {result.expires_at}")
print(f"Time remaining: {result.time_remaining} seconds")
```

### URL Validation

```python
# Check if URL is still valid
is_valid = await client.image.validate_url(url)

if is_valid:
    print("URL is accessible")
else:
    print("URL has expired or is invalid")
    # Regenerate if needed
    new_url = await client.image.regenerate_from_url(url)
```

---

## 🌐 CDN Integration

### Custom CDN Prefix

```python
# Use custom CDN
client = BlossomClient(
    cdn_prefix="https://cdn.myapp.com"
)

url = client.image.generate_url(
    prompt="test image",
    use_custom_cdn=True
)
# URL will be: https://cdn.myapp.com/generated/abc123.png
```

### CDN Caching

```python
# Generate with CDN caching headers
url = client.image.generate_url(
    prompt="hero banner image",
    cache_control="public, max-age=31536000",  # 1 year
    etag="unique-identifier"
)
```

---

## 📊 URL Analytics

### Track URL Usage

```python
# Generate URL with tracking
url = client.image.generate_url(
    prompt="marketing banner",
    tracking_id="campaign-summer-2024",
    metadata={
        "campaign": "summer_sale",
        "variant": "A",
        "user_segment": "premium"
    }
)
```

### Get URL Statistics

```python
# Get statistics for tracked URLs
stats = client.image.get_url_stats(
    tracking_id="campaign-summer-2024",
    date_range=("2024-06-01", "2024-08-31")
)

print(f"Total views: {stats.total_views}")
print(f"Unique viewers: {stats.unique_viewers}")
print(f"Average load time: {stats.avg_load_time}ms")
```

---

## 🔒 Security Features

### Signed URLs

```python
# Generate signed URL for security
url = client.image.generate_signed_url(
    prompt="private content",
    signature_ttl=3600,  # 1 hour
    access_key="user-specific-key"
)

# URL format: https://api.blossom-ai.com/image/abc123?sig=signature&exp=timestamp
```

### Access Control

```python
# Generate URL with access restrictions
url = client.image.generate_url(
    prompt="sensitive content",
    allowed_domains=["myapp.com", "cdn.myapp.com"],
    ip_whitelist=["192.168.1.0/24"],
    require_auth=True
)
```

---

## 🚀 Performance Optimization

### URL Preloading

```python
# Preload URLs for better performance
urls_to_preload = [
    "https://api.blossom-ai.com/image/abc123",
    "https://api.blossom-ai.com/image/def456",
    "https://api.blossom-ai.com/image/ghi789"
]

await client.image.preload_urls(urls_to_preload)
```

### URL Compression

```python
# Generate compressed image URLs
url = client.image.generate_url(
    prompt="detailed image",
    compression="auto",  # automatic compression
    quality_preset="web_optimized"
)
```

---

## 💡 Use Cases

### E-commerce Product Images

```python
class ProductImageService:
    def __init__(self, client):
        self.client = client
    
    def generate_product_images(self, product_data):
        """Generate multiple product image URLs"""
        
        images = {}
        
        # Main product image
        images['main'] = self.client.image.generate_url(
            prompt=f"{product_data['name']} product photo, white background",
            width=1024,
            height=1024,
            format="png",
            transparency=False
        )
        
        # Lifestyle image
        images['lifestyle'] = self.client.image.generate_url(
            prompt=f"{product_data['name']} in use, lifestyle setting",
            width=1536,
            height=1024
        )
        
        # Detail shots
        images['details'] = [
            self.client.image.generate_url(
                prompt=f"{product_data['name']} detail shot {i+1}",
                width=1024,
                height=1024
            )
            for i in range(3)
        ]
        
        return images
```

### Social Media Content

```python
class SocialMediaGenerator:
    def __init__(self, client):
        self.client = client
    
    def generate_post_images(self, content_type, topic):
        """Generate images for social media posts"""
        
        platforms = {
            "instagram": {"size": (1080, 1080), "format": "jpg"},
            "twitter": {"size": (1200, 675), "format": "jpg"},
            "linkedin": {"size": (1200, 627), "format": "jpg"}
        }
        
        urls = {}
        
        for platform, specs in platforms.items():
            urls[platform] = self.client.image.generate_url(
                prompt=f"{content_type} about {topic}, social media style",
                width=specs["size"][0],
                height=specs["size"][1],
                format=specs["format"]
            )
        
        return urls
```

---

## 📚 Further Reading

- [Image Generation Basics](IMAGE_GENERATION.md)
- [Advanced Image Controls](IMAGE_ADVANCED.md)
- [Batch Processing](IMAGE_BATCH.md)
- [Performance Optimization](PERFORMANCE.md)