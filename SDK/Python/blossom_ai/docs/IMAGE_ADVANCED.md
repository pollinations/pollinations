# 🌈 Advanced Image Generation Controls

> **Fine-tune your image generation with advanced parameters and techniques**

---

## 📋 Table of Contents

- [Negative Prompts](#negative-prompts)
- [Transparency Support](#transparency-support)
- [Image-to-Image Generation](#image-to-image-generation)
- [Inpainting](#inpainting)
- [ControlNet Integration](#controlnet-integration)
- [Advanced Parameters](#advanced-parameters)
- [Quality Settings](#quality-settings)
- [Style Control](#style-control)

---

## 🚫 Negative Prompts

Negative prompts help you specify what you **don't** want in your generated image.

### Basic Usage

```python
from blossom_ai import BlossomClient

with BlossomClient() as client:
    image = client.image.generate(
        prompt="beautiful portrait of a woman",
        negative_prompt="blurry, low quality, distorted, ugly, deformed"
    )
```

### Advanced Negative Prompting

```python
# Multiple negative concepts
negative_prompt = """
low resolution, blurry, out of focus, 
extra limbs, deformed hands, mutated fingers,
watermarks, text, logos, signatures,
bad anatomy, poorly drawn face,
nsfw, inappropriate content
"""

image = client.image.generate(
    prompt="professional headshot photo",
    negative_prompt=negative_prompt.strip()
)
```

### Common Negative Prompt Patterns

```python
# For portraits
portrait_negatives = [
    "blurry", "low quality", "distorted", "ugly",
    "deformed face", "extra limbs", "mutated hands",
    "cross-eyed", "bad anatomy", "poorly drawn"
]

# For landscapes
landscape_negatives = [
    "oversaturated", "low resolution", "artifacts",
    "watermarks", "text", "people", "cars",
    "urban elements", "pollution"
]

# For product photos
product_negatives = [
    "blurry", "poor lighting", "reflections",
    "background clutter", "other objects",
    "hands", "text", "logos"
]
```

---

## 🏃‍♀️ Transparency Support

Generate images with transparent backgrounds for professional use.

### PNG with Transparency

```python
# Generate with transparent background
image = client.image.generate(
    prompt="a red apple on transparent background",
    transparency=True,  # Enable transparency
    format="png"        # PNG supports transparency
)
```

### Remove Background

```python
# Generate first, then remove background
image = client.image.generate("a person standing")
transparent_image = client.image.remove_background(image)
```

### Layer Composition

```python
# Generate multiple transparent elements
background = client.image.generate(
    "blue sky with clouds",
    transparency=True
)

foreground = client.image.generate(
    "flying bird",
    transparency=True
)

# Composite them
composite = client.image.composite(
    background=background,
    foreground=foreground,
    position=(100, 50)
)
```

---

## 🔄 Image-to-Image Generation

Transform existing images using them as a base for new generations.

### Basic img2img

```python
from PIL import Image

# Load existing image
base_image = Image.open("sketch.png")

# Transform it
transformed = client.image.generate_from_image(
    image=base_image,
    prompt="turn this sketch into a detailed digital painting",
    strength=0.7,  # How much to change (0.0 = no change, 1.0 = full change)
    guidance_scale=7.5
)
```

### Style Transfer

```python
# Use a style reference
style_image = Image.open("van_gogh_starry_night.jpg")
content_image = Image.open("my_photo.jpg")

styled = client.image.style_transfer(
    content_image=content_image,
    style_image=style_image,
    strength=0.8
)
```

### Upscaling

```python
# Upscale low-resolution image
low_res = Image.open("small_image.jpg")

upscaled = client.image.upscale(
    image=low_res,
    scale_factor=4,  # 4x larger
    model="RealESRGAN"  # or "ESRGAN", "SwinIR"
)
```

---

## 🎨 Inpainting

Fill in masked areas of an image with AI-generated content.

### Basic Inpainting

```python
from PIL import Image, ImageDraw

# Load image and create mask
image = Image.open("room.jpg")
mask = Image.new("L", image.size, 0)  # Black mask

# Draw white area where we want to inpaint
draw = ImageDraw.Draw(mask)
draw.rectangle([(100, 100), (300, 200)], fill=255)

# Inpaint the masked area
inpainted = client.image.inpaint(
    image=image,
    mask=mask,
    prompt="add a beautiful painting on the wall"
)
```

### Outpainting

```python
# Expand image beyond its borders
original = Image.open("portrait.jpg")

# Outpaint to create larger canvas
outpainted = client.image.outpaint(
    image=original,
    expand_by=100,  # pixels on each side
    prompt="studio background with professional lighting"
)
```

---

## 🎛️ ControlNet Integration

Precise control over image composition using additional conditioning.

### Pose Control

```python
# Control character pose
pose_image = Image.open("pose_reference.jpg")

image = client.image.generate_with_control(
    prompt="anime character in dynamic action pose",
    control_image=pose_image,
    control_type="pose",  # or "canny", "depth", "normal"
    strength=0.8
)
```

### Edge Detection

```python
# Use edge map for precise control
edge_map = client.image.get_edges(
    image=Image.open("reference.jpg"),
    low_threshold=100,
    high_threshold=200
)

controlled = client.image.generate_with_control(
    prompt="modern architecture building",
    control_image=edge_map,
    control_type="canny",
    guidance_scale=7.0
)
```

### Depth Control

```python
# Generate depth map first
depth_map = client.image.get_depth_map(
    image=Image.open("scene.jpg")
)

# Generate with depth control
image = client.image.generate_with_control(
    prompt="futuristic city at night",
    control_image=depth_map,
    control_type="depth",
    strength=0.6
)
```

---

## ⚙️ Advanced Parameters

Fine-tune generation with precise control parameters.

### Guidance Scale

```python
# Different guidance scales for different purposes
guidance_examples = {
    "creative": 4.0,      # More artistic freedom
    "balanced": 7.5,      # Default, good balance
    "strict": 12.0,       # Follow prompt exactly
    "ultra_strict": 20.0  # Very strict adherence
}

image = client.image.generate(
    prompt="a red rose in a garden",
    guidance_scale=guidance_examples["balanced"]
)
```

### Sampling Methods

```python
# Different sampling algorithms
samplers = {
    "DDIM": {"speed": "fast", "quality": "good"},
    "DPM++": {"speed": "medium", "quality": "excellent"},
    "Euler": {"speed": "fast", "quality": "good"},
    "UniPC": {"speed": "medium", "quality": "excellent"},
    "Euler a": {"speed": "fast", "quality": "creative"}
}

image = client.image.generate(
    prompt="fantasy landscape",
    sampler="DPM++",
    steps=30  # More steps = better quality, slower
)
```

### Seed Control

```python
# Reproducible generation with seeds
image1 = client.image.generate(
    prompt="a cat sleeping",
    seed=12345  # Same seed = same result
)

image2 = client.image.generate(
    prompt="a cat sleeping", 
    seed=12345  # Will be identical to image1
)

# Random seed for variety
import random
random.seed()
image3 = client.image.generate(
    prompt="a cat sleeping",
    seed=random.randint(0, 2**32-1)
)
```

---

## 🎯 Quality Settings

Control the quality and resolution of generated images.

### Quality Presets

```python
quality_presets = {
    "standard": {
        "width": 1024,
        "height": 1024,
        "steps": 20,
        "guidance_scale": 7.5
    },
    "hd": {
        "width": 1536,
        "height": 1024,
        "steps": 40,
        "guidance_scale": 7.0
    },
    "ultra": {
        "width": 2048,
        "height": 2048,
        "steps": 60,
        "guidance_scale": 6.5
    }
}

# Use HD preset
image = client.image.generate(
    prompt="professional product photography",
    quality="hd"
)
```

### Custom Resolution

```python
# Non-standard aspect ratios
resolutions = {
    "widescreen": (1920, 1080),    # 16:9
    "portrait": (1080, 1920),      # 9:16
    "ultrawide": (3440, 1440),     # 21:9
    "square": (1024, 1024),        # 1:1
    "a4": (992, 1403)              # A4 paper
}

image = client.image.generate(
    prompt="landscape photography",
    width=1920,
    height=1080
)
```

---

## 🎨 Style Control

Apply specific artistic styles to your generations.

### Style Presets

```python
style_presets = {
    "photographic": "professional photography, sharp focus",
    "anime": "anime style, manga art, vibrant colors",
    "oil_painting": "oil painting on canvas, classical art",
    "watercolor": "watercolor painting, soft edges",
    "digital_art": "digital art, modern illustration",
    "sketch": "pencil sketch, black and white",
    "cyberpunk": "cyberpunk aesthetic, neon lights"
}

image = client.image.generate(
    prompt="a beautiful sunset",
    style_preset="oil_painting"
)
```

### Custom Style Prompts

```python
# Combine multiple styles
custom_style = """
style of Studio Ghibli and Makoto Shinkai,
soft lighting, dreamy atmosphere,
pastel colors, detailed backgrounds
"""

image = client.image.generate(
    prompt="a girl walking through a field",
    prompt_suffix=custom_style  # Append style to prompt
)
```

### Artist Style References

```python
artist_styles = {
    "van_gogh": "in the style of Vincent van Gogh, post-impressionism",
    "picasso": "in the style of Pablo Picasso, cubism",
    "monet": "in the style of Claude Monet, impressionism",
    "da_vinci": "in the style of Leonardo da Vinci, renaissance",
    "hokusai": "in the style of Katsushika Hokusai, ukiyo-e"
}

image = client.image.generate(
    prompt="mountain landscape",
    prompt_suffix=artist_styles["van_gogh"]
)
```

---

## 💡 Best Practices

### Prompt Engineering

```python
def build_professional_prompt(subject, style="photographic", lighting="natural"):
    """Build well-structured prompts"""
    return f"""
    {subject},
    {style}, {lighting} lighting,
    high resolution, detailed, professional,
    sharp focus, well composed
    """.strip()

prompt = build_professional_prompt(
    subject="a modern office workspace",
    style="architectural photography",
    lighting="soft natural"
)
```

### Batch Generation with Variations

```python
def generate_variations(base_prompt, variations, count=5):
    """Generate multiple variations of an image"""
    images = []
    
    for i in range(count):
        image = client.image.generate(
            prompt=base_prompt,
            negative_prompt=variations.get("negative", ""),
            seed=i * 1000,  # Different seed each time
            guidance_scale=variations.get("guidance", 7.5)
        )
        images.append(image)
    
    return images

# Generate 5 variations
variations = {
    "negative": "blurry, low quality",
    "guidance": 8.0
}
images = generate_variations(
    "a futuristic robot",
    variations,
    count=5
)
```

### Error Handling

```python
import asyncio
from blossom_ai.exceptions import ImageGenerationError

async def safe_generate_image(**kwargs):
    """Safely generate images with error handling"""
    try:
        return await client.image.generate_async(**kwargs)
    except ImageGenerationError as e:
        print(f"Generation failed: {e}")
        # Fallback to simpler prompt
        return await client.image.generate_async(
            prompt="simple illustration"
        )
```

---

## 🎓 Advanced Examples

### Product Photography Setup

```python
def create_product_shot(product_description, background="white"):
    """Generate professional product photography"""
    
    # Generate product with transparent background
    product = client.image.generate(
        prompt=f"{product_description}, professional product photography",
        transparency=True,
        negative_prompt="background, shadows, reflections"
    )
    
    # Generate clean background
    bg = client.image.generate(
        prompt=f"clean {background} background, studio lighting",
        width=product.width,
        height=product.height
    )
    
    # Composite them
    final = client.image.composite(
        background=bg,
        foreground=product,
        position="center"
    )
    
    return final

# Create product shots
watch = create_product_shot("luxury wristwatch", "marble")
phone = create_product_shot("modern smartphone", "gradient")
```

### Character Consistency

```python
class CharacterGenerator:
    """Generate consistent character across multiple images"""
    
    def __init__(self, base_description):
        self.base_description = base_description
        self.character_seed = 42424242  # Fixed seed for consistency
    
    def generate_in_scene(self, scene):
        """Generate character in different scenes"""
        prompt = f"{self.base_description}, {scene}"
        
        return client.image.generate(
            prompt=prompt,
            seed=self.character_seed,
            guidance_scale=7.5
        )
    
    def generate_with_expression(self, expression):
        """Generate character with different expressions"""
        prompt = f"{self.base_description}, {expression}"
        
        return client.image.generate(
            prompt=prompt,
            seed=self.character_seed + hash(expression) % 1000,
            guidance_scale=8.0
        )

# Create consistent character
character = CharacterGenerator(
    base_description="young woman with short brown hair, green eyes, wearing casual clothes"
)

# Generate in different scenarios
portrait = character.generate_in_scene("professional headshot")
action = character.generate_in_scene("running in a park")
happy = character.generate_with_expression("smiling happily")
```

---

## 📚 Further Reading

- [Image Generation Basics](IMAGE_GENERATION.md)
- [Batch Processing](IMAGE_BATCH.md)
- [URL Generation](IMAGE_URLS.md)
- [Performance Optimization](PERFORMANCE.md)