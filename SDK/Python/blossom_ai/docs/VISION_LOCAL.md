# 🖼️ Local Images Guide

> Complete guide to working with local image files in Blossom AI

---

## 🎯 Overview

This guide covers how to:
- ✅ Analyze local image files
- ✅ Work with different image formats
- ✅ Handle file validation and security
- ✅ Process images efficiently
- ✅ Integrate with file systems

---

## 📁 Basic Local Image Analysis

### Analyzing a Local Image File

```python
from blossom_ai import ai

# Analyze local image file
analysis = ai.vision.analyze(
    image_path="/path/to/your/image.jpg",
    prompt="describe this image in detail"
)

print(f"Description: {analysis.description}")
print(f"Objects detected: {analysis.objects}")
print(f"Colors: {analysis.colors}")
```

### Supported Image Formats

| Format | Extension | Supported | Notes |
|--------|-----------|-----------|-------|
| JPEG | .jpg, .jpeg | ✅ | Most common, good compression |
| PNG | .png | ✅ | Lossless, supports transparency |
| GIF | .gif | ✅ | Animated GIFs (first frame only) |
| BMP | .bmp | ✅ | Uncompressed, large files |
| WebP | .webp | ✅ | Modern format, good compression |
| TIFF | .tiff, .tif | ✅ | High quality, large files |

---

## 🔐 Security and Validation

### Safe File Handling

```python
from blossom_ai.utils.security import validate_image_file, ensure_safe_directory
from pathlib import Path

# Validate image file before processing
image_path = Path("user_uploads/photo.jpg")

if validate_image_file(str(image_path)):
    # Safe to process
    analysis = ai.vision.analyze(
        image_path=str(image_path),
        prompt="analyze this image"
    )
else:
    print("Invalid or unsafe image file")
```

### Directory Security

```python
from blossom_ai.utils.security import ensure_safe_directory

# Ensure directory is safe
upload_dir = Path("uploads")
ensure_safe_directory(str(upload_dir))  # Prevents directory traversal

# Now safe to process files in this directory
for image_file in upload_dir.glob("*.jpg"):
    analysis = ai.vision.analyze(image_path=str(image_file))
```

### File Size Validation

```python
import os
from blossom_ai import SessionConfig

config = SessionConfig(max_file_size_mb=10)  # 10MB limit

def validate_file_size(file_path: str, max_size_mb: int = 10) -> bool:
    """Check if file size is within limits."""
    file_size_bytes = os.path.getsize(file_path)
    max_size_bytes = max_size_mb * 1024 * 1024
    
    return file_size_bytes <= max_size_bytes

# Usage
if validate_file_size("image.jpg", max_size_mb=10):
    analysis = ai.vision.analyze(image_path="image.jpg")
else:
    print("File too large")
```

---

## 🔄 Working with PIL Images

### Converting PIL to Bytes

```python
from PIL import Image
import io

# Open image with PIL
pil_image = Image.open("photo.jpg")

# Convert to bytes for AI analysis
image_bytes = io.BytesIO()
pil_image.save(image_bytes, format='PNG')
image_bytes = image_bytes.getvalue()

# Analyze
analysis = ai.vision.analyze(
    image_bytes=image_bytes,
    prompt="analyze this image"
)
```

### Image Preprocessing

```python
from PIL import Image, ImageEnhance, ImageFilter
import io

class ImagePreprocessor:
    def __init__(self):
        pass
    
    def enhance_for_analysis(self, image_path: str) -> bytes:
        """Enhance image before AI analysis."""
        image = Image.open(image_path)
        
        # Enhance contrast
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(1.2)
        
        # Enhance sharpness
        enhancer = ImageEnhance.Sharpness(image)
        image = enhancer.enhance(1.1)
        
        # Convert to bytes
        output = io.BytesIO()
        image.save(output, format='PNG')
        return output.getvalue()
    
    def resize_for_web(self, image_path: str, max_size: tuple = (1024, 1024)) -> bytes:
        """Resize image for web optimization."""
        image = Image.open(image_path)
        image.thumbnail(max_size, Image.Resampling.LANCZOS)
        
        output = io.BytesIO()
        image.save(output, format='JPEG', quality=85, optimize=True)
        return output.getvalue()
    
    def create_thumbnail(self, image_path: str, size: tuple = (256, 256)) -> bytes:
        """Create thumbnail."""
        image = Image.open(image_path)
        image.thumbnail(size, Image.Resampling.LANCZOS)
        
        output = io.BytesIO()
        image.save(output, format='PNG')
        return output.getvalue()

# Usage
preprocessor = ImagePreprocessor()

# Enhance before analysis
enhanced_bytes = preprocessor.enhance_for_analysis("photo.jpg")
analysis = ai.vision.analyze(image_bytes=enhanced_bytes)

# Create thumbnail for gallery
thumbnail_bytes = preprocessor.create_thumbnail("photo.jpg")
```

---

## 📂 Batch Processing

### Processing Multiple Images

```python
from pathlib import Path
import asyncio
from typing import List

async def analyze_image_batch(
    image_paths: List[str],
    batch_size: int = 5
) -> List[dict]:
    """Analyze multiple images in batches."""
    
    results = []
    
    # Process in batches
    for i in range(0, len(image_paths), batch_size):
        batch = image_paths[i:i + batch_size]
        
        # Create tasks for current batch
        tasks = []
        for image_path in batch:
            task = ai.vision.analyze(
                image_path=image_path,
                prompt="describe this image"
            )
            tasks.append(task)
        
        # Execute batch
        batch_results = await asyncio.gather(*tasks)
        results.extend(batch_results)
        
        # Small delay between batches
        await asyncio.sleep(1)
    
    return results

# Usage
image_files = [
    "photo1.jpg",
    "photo2.jpg",
    "photo3.jpg",
    # ... more files
]

results = asyncio.run(analyze_image_batch(image_files))
for i, analysis in enumerate(results):
    print(f"Image {i+1}: {analysis.description}")
```

### Directory Scanning

```python
from pathlib import Path
import asyncio

async def analyze_directory(
    directory: str,
    recursive: bool = True,
    extensions: list = [".jpg", ".jpeg", ".png", ".gif"]
) -> dict:
    """Analyze all images in a directory."""
    
    directory_path = Path(directory)
    
    # Find all image files
    if recursive:
        image_files = directory_path.rglob("*")
    else:
        image_files = directory_path.glob("*")
    
    # Filter by extensions
    image_files = [
        str(f) for f in image_files
        if f.suffix.lower() in extensions
    ]
    
    print(f"Found {len(image_files)} images")
    
    # Analyze in batches
    results = await analyze_image_batch(image_files, batch_size=3)
    
    # Create summary
    summary = {
        "total_images": len(results),
        "analyses": []
    }
    
    for image_path, analysis in zip(image_files, results):
        summary["analyses"].append({
            "file": image_path,
            "description": analysis.description,
            "objects": analysis.objects,
            "colors": analysis.colors
        })
    
    return summary

# Usage
summary = asyncio.run(analyze_directory("my_photos", recursive=True))

# Save summary
import json
with open("analysis_summary.json", "w") as f:
    json.dump(summary, f, indent=2)
```

---

## 🎨 Image Manipulation for Analysis

### Cropping and Focusing

```python
from PIL import Image
import io

def crop_for_analysis(image_path: str, focus_area: tuple) -> bytes:
    """
    Crop image to focus on specific area.
    
    focus_area: (left, top, right, bottom) in pixels
    """
    image = Image.open(image_path)
    
    # Crop to focus area
    cropped = image.crop(focus_area)
    
    # Convert to bytes
    output = io.BytesIO()
    cropped.save(output, format='PNG')
    return output.getvalue()

# Usage - focus on a specific object
analysis = ai.vision.analyze(
    image_bytes=crop_for_analysis("photo.jpg", (100, 100, 400, 400)),
    prompt="analyze this specific object"
)
```

### Splitting Large Images

```python
def split_image_for_analysis(image_path: str, grid_size: tuple = (2, 2)) -> List[bytes]:
    """Split large image into smaller sections for detailed analysis."""
    image = Image.open(image_path)
    width, height = image.size
    
    cols, rows = grid_size
    section_width = width // cols
    section_height = height // rows
    
    sections = []
    
    for row in range(rows):
        for col in range(cols):
            # Calculate crop coordinates
            left = col * section_width
            top = row * section_height
            right = left + section_width
            bottom = top + section_height
            
            # Crop and convert to bytes
            section = image.crop((left, top, right, bottom))
            output = io.BytesIO()
            section.save(output, format='PNG')
            sections.append(output.getvalue())
    
    return sections

# Usage
image_sections = split_image_for_analysis("large_photo.jpg", (3, 2))

# Analyze each section
analyses = []
for i, section_bytes in enumerate(image_sections):
    analysis = ai.vision.analyze(
        image_bytes=section_bytes,
        prompt=f"analyze section {i+1} of this image"
    )
    analyses.append(analysis)

# Combine results
full_description = "\n".join([a.description for a in analyses])
print(f"Complete analysis: {full_description}")
```

---

## 🛡️ Error Handling

### Comprehensive Error Handling

```python
from blossom_ai import (
    ValidationError,
    NetworkError,
    AuthenticationError,
    RateLimitError
)
import os
from pathlib import Path

async def safe_analyze_image(image_path: str, **kwargs) -> dict:
    """Safely analyze image with comprehensive error handling."""
    
    result = {
        "success": False,
        "analysis": None,
        "error": None,
        "file_info": {}
    }
    
    try:
        # Validate file exists
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image file not found: {image_path}")
        
        # Get file info
        file_stat = os.stat(image_path)
        result["file_info"] = {
            "path": image_path,
            "size_bytes": file_stat.st_size,
            "size_mb": file_stat.st_size / (1024 * 1024),
            "modified": file_stat.st_mtime
        }
        
        # Validate file size
        if file_stat.st_size > 10 * 1024 * 1024:  # 10MB
            raise ValueError(f"File too large: {file_stat.st_size / (1024 * 1024):.1f} MB")
        
        # Validate image format
        valid_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff']
        file_extension = Path(image_path).suffix.lower()
        if file_extension not in valid_extensions:
            raise ValidationError(f"Unsupported image format: {file_extension}")
        
        # Perform analysis
        analysis = ai.vision.analyze(image_path=image_path, **kwargs)
        
        result["success"] = True
        result["analysis"] = {
            "description": analysis.description,
            "objects": analysis.objects,
            "colors": analysis.colors,
            "text": getattr(analysis, 'text', None)
        }
        
    except FileNotFoundError as e:
        result["error"] = {"type": "file_not_found", "message": str(e)}
    except ValidationError as e:
        result["error"] = {"type": "validation", "message": str(e)}
    except NetworkError as e:
        result["error"] = {"type": "network", "message": str(e)}
    except AuthenticationError as e:
        result["error"] = {"type": "authentication", "message": str(e)}
    except RateLimitError as e:
        result["error"] = {"type": "rate_limit", "message": str(e)}
    except Exception as e:
        result["error"] = {"type": "unknown", "message": str(e)}
    
    return result

# Usage
result = asyncio.run(safe_analyze_image("photo.jpg"))

if result["success"]:
    print(f"Analysis: {result['analysis']['description']}")
else:
    print(f"Error: {result['error']['message']}")
```

---

## 📊 Metadata Extraction

### Extracting Image Metadata

```python
from PIL import Image
from PIL.ExifTags import TAGS
import json

def extract_image_metadata(image_path: str) -> dict:
    """Extract metadata from image file."""
    image = Image.open(image_path)
    
    metadata = {
        "format": image.format,
        "mode": image.mode,
        "size": image.size,
        "info": image.info
    }
    
    # Extract EXIF data if available
    if hasattr(image, '_getexif') and image._getexif():
        exif_data = {}
        for tag_id, value in image._getexif().items():
            tag = TAGS.get(tag_id, tag_id)
            exif_data[tag] = value
        metadata["exif"] = exif_data
    
    return metadata

# Usage
metadata = extract_image_metadata("photo.jpg")
print(json.dumps(metadata, indent=2, default=str))

# Use metadata in analysis
analysis = ai.vision.analyze(
    image_path="photo.jpg",
    prompt=f"""
    Analyze this image. Technical info: {json.dumps(metadata, default=str)}
    
    Focus on the visual content and composition.
    """
)
```

---

## 🚀 Optimization Tips

### Efficient File Handling

```python
import mmap
from contextlib import contextmanager

@contextmanager
def memory_map_file(filename):
    """Memory-map file for efficient reading."""
    with open(filename, 'rb') as f:
        with mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as mm:
            yield mm

# Usage for large files
with memory_map_file("large_image.jpg") as mm:
    # Process memory-mapped file
    # This is more memory-efficient for large files
    pass
```

### Parallel Processing

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor

def process_image_file(image_path: str):
    """Process single image file."""
    try:
        analysis = ai.vision.analyze(image_path=image_path)
        return {"path": image_path, "analysis": analysis}
    except Exception as e:
        return {"path": image_path, "error": str(e)}

async def parallel_process_images(image_paths: List[str], max_workers: int = 4):
    """Process images in parallel using thread pool."""
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        loop = asyncio.get_event_loop()
        
        # Submit tasks
        tasks = [
            loop.run_in_executor(executor, process_image_file, path)
            for path in image_paths
        ]
        
        # Gather results
        results = await asyncio.gather(*tasks)
        return results

# Usage
image_files = ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"]
results = asyncio.run(parallel_process_images(image_files, max_workers=2))
```

---

## 📚 Related Documentation

- [👁️ Vision Analysis](VISION.md)
- [🔗 URL Generation](IMAGE_URLS.md)
- [💾 Batch Processing](IMAGE_BATCH.md)
- [🔒 Security Guide](../../SECURITY.md)
- [⚙️ Configuration System](CONFIGURATION.md)
