# ⚡ Quick Start Guide

> Get started with Blossom AI in 2 minutes

---

## 🎯 Your First Generation

### 1. Simplest Usage (No API Key Required)

```python
from blossom_ai import ai

# Generate an image
image = ai.image.generate("a beautiful sunset")

# Generate text
response = ai.text.generate("write a short poem about spring")

print(response.text)
```

That's it! No API key needed for basic usage.

---

## 🚀 Using BlossomClient

For more control and production features:

```python
from blossom_ai import BlossomClient

# Using context manager (recommended)
with BlossomClient() as client:
    # Generate image
    image = client.image.generate(
        "epic fantasy landscape",
        width=1920,
        height=1080,
        quality="hd"
    )
    
    # Generate text
    response = client.text.generate(
        "explain quantum computing",
        max_tokens=500
    )
    
    print(response.text)
```

---

## 🎨 Generate Your First Image

```python
from blossom_ai import ai

# Basic image generation
image = ai.image.generate("a cat wearing a space helmet")

# Save to file
image.save("space_cat.png")

# Or get as bytes
image_bytes = image.bytes
```

---

## 💬 Generate Your First Text

```python
from blossom_ai import ai

# Simple text generation
response = ai.text.generate("write a haiku about coding")
print(response.text)

# Chat-style conversation
messages = [
    {"role": "user", "content": "what is machine learning?"}
]

response = ai.text.chat(messages)
print(response.text)
```

---

## 👁️ Analyze an Image

```python
from blossom_ai import ai

# Analyze image from URL
analysis = ai.vision.analyze(
    image_url="https://example.com/photo.jpg",
    prompt="what's in this image?"
)

print(analysis.description)
```

---

## 🔊 Generate Audio (Text-to-Speech)

```python
from blossom_ai import ai

# Generate speech
audio = ai.audio.generate(
    text="Hello, welcome to Blossom AI!",
    voice="alloy"  # Choose from: alloy, echo, fable, onyx, nova, shimmer
)

# Save audio file
audio.save("welcome.mp3")
```

---

## ⚙️ Configuration

### Using Environment Variables

Create a `.env` file:
```env
BLOSSOM_API_KEY=your_api_key_here
BLOSSOM_RATE_LIMIT=60
BLOSSOM_CACHE_ENABLED=true
```

### Using SessionConfig

```python
from blossom_ai import BlossomClient, SessionConfig

config = SessionConfig(
    api_key="your-api-key",
    rate_limit_per_minute=120,
    cache_enabled=True,
    timeout=30.0
)

with BlossomClient(config=config) as client:
    response = client.text.generate("test")
```

---

## 🧪 Testing Your Setup

```python
# test_blossom.py
from blossom_ai import ai

def test_basic_functionality():
    """Test basic Blossom AI functionality."""
    
    # Test image generation
    image = ai.image.generate("a red apple")
    assert image is not None
    print("✅ Image generation works!")
    
    # Test text generation
    response = ai.text.generate("say hello")
    assert response.text is not None
    print("✅ Text generation works!")
    
    print("\n🎉 All tests passed! You're ready to go.")

if __name__ == "__main__":
    test_basic_functionality()
```

Run the test:
```bash
python test_blossom.py
```

---

## 📚 Next Steps

Now that you have Blossom AI working, explore:

1. [🎓 Tutorial](TUTORIAL.md) — Step-by-step guide
2. [🎨 Image Generation](IMAGE_GENERATION.md) — Advanced image features
3. [💬 Text Generation](TEXT_GENERATION.md) — Advanced text features
4. [🏗️ Architecture](ARCHITECTURE.md) — Understanding the internals

---

## 💡 Tips

### 1. Use Context Managers

Always use `with` statement for automatic cleanup:

```python
# Good ✅
with BlossomClient() as client:
    result = client.text.generate("test")

# Bad ❌
client = BlossomClient()
result = client.text.generate("test")
# Resources not cleaned up!
```

### 2. Handle Errors

```python
from blossom_ai import BlossomError

try:
    response = ai.text.generate("test")
except BlossomError as e:
    print(f"Error: {e}")
```

### 3. Use Caching

Enable caching to save API calls:

```python
config = SessionConfig(cache_enabled=True)
with BlossomClient(config=config) as client:
    # This will be cached
    result1 = client.text.generate("test")
    # This will use cache
    result2 = client.text.generate("test")
```

### 4. Batch Processing

Generate multiple images efficiently:

```python
prompts = [
    "a red car",
    "a blue car", 
    "a green car"
]

images = []
for prompt in prompts:
    image = ai.image.generate(prompt)
    images.append(image)
```

---

## 🆘 Need Help?

- 📖 [Full Documentation](INDEX.md)
- 🐛 [Report Issues](https://github.com/PrimeevolutionZ/blossom-ai/issues)
- 💬 [Discussions](https://github.com/PrimeevolutionZ/blossom-ai/discussions)
- 📧 Email: develop@eclips-team.ru
