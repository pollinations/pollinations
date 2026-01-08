# 👁️ Vision Application Guide

> **Build computer vision applications with Blossom AI's image analysis capabilities**

---

## Overview

This guide covers building vision applications using Blossom AI's multimodal capabilities, including image analysis, object detection, and visual content processing.

---

## Basic Vision Setup

### 1. Simple Image Analysis

```python
import asyncio
from typing import Dict, Any, Optional
from blossom_ai import BlossomClient, SessionConfig, MessageBuilder
import base64
import requests
from PIL import Image
import io

class VisionAnalyzer:
    """Basic vision analysis using Blossom AI."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=60.0,
            sync_pool_connections=10,
            async_limit_total=50
        )
    
    async def analyze_image_url(
        self,
        image_url: str,
        prompt: str = "What's in this image?"
    ) -> Dict[str, Any]:
        """Analyze image from URL."""
        
        async with BlossomClient(config=self.config) as client:
            # Build vision message
            message = MessageBuilder.image(
                role="user",
                text=prompt,
                image_url=image_url
            )
            
            # Analyze image
            result = await client.vision.analyze(message)
            
            return {
                'image_url': image_url,
                'prompt': prompt,
                'analysis': result,
                'timestamp': time.time()
            }
    
    async def analyze_image_base64(
        self,
        image_base64: str,
        prompt: str = "What's in this image?",
        image_format: str = "jpeg"
    ) -> Dict[str, Any]:
        """Analyze image from base64 string."""
        
        async with BlossomClient(config=self.config) as client:
            # Build vision message with base64 image
            message = MessageBuilder.image(
                role="user",
                text=prompt,
                image_base64=image_base64,
                image_format=image_format
            )
            
            result = await client.vision.analyze(message)
            
            return {
                'image_format': image_format,
                'prompt': prompt,
                'analysis': result,
                'timestamp': time.time()
            }
    
    async def analyze_local_image(
        self,
        image_path: str,
        prompt: str = "What's in this image?"
    ) -> Dict[str, Any]:
        """Analyze local image file."""
        
        # Read and encode image
        with open(image_path, 'rb') as f:
            image_data = f.read()
        
        # Convert to base64
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        # Determine format
        image_format = image_path.split('.')[-1].lower()
        if image_format == 'jpg':
            image_format = 'jpeg'
        
        return await self.analyze_image_base64(
            image_base64,
            prompt,
            image_format
        )
    
    async def batch_analyze(
        self,
        images: List[Dict[str, Any]],
        prompt_template: str = "Analyze this image: {description}"
    ) -> List[Dict[str, Any]]:
        """Analyze multiple images in batch."""
        
        tasks = []
        
        for image_info in images:
            prompt = prompt_template.format(**image_info)
            
            if 'url' in image_info:
                task = self.analyze_image_url(image_info['url'], prompt)
            elif 'base64' in image_info:
                task = self.analyze_image_base64(
                    image_info['base64'],
                    prompt,
                    image_info.get('format', 'jpeg')
                )
            elif 'path' in image_info:
                task = self.analyze_local_image(image_info['path'], prompt)
            else:
                raise ValueError("Image must have url, base64, or path")
            
            tasks.append(task)
        
        return await asyncio.gather(*tasks)

# Usage
async def basic_vision_analysis():
    """Run basic vision analysis."""
    
    analyzer = VisionAnalyzer()
    
    # Analyze from URL
    result = await analyzer.analyze_image_url(
        "https://example.com/sample.jpg",
        "Describe what you see in this image in detail."
    )
    
    print(result['analysis'])
```

---

### 2. Advanced Vision Features

```python
import asyncio
from typing import Dict, Any, List, Optional
from blossom_ai import BlossomClient, SessionConfig, MessageBuilder
import json
import re

class AdvancedVisionAnalyzer:
    """Advanced vision analysis with specialized prompts."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=90.0,
            sync_pool_connections=15,
            async_limit_total=75
        )
    
    async def detect_objects(
        self,
        image_url: str,
        confidence_threshold: float = 0.7
    ) -> Dict[str, Any]:
        """Detect objects in image."""
        
        async with BlossomClient(config=self.config) as client:
            prompt = """
            Analyze this image and identify all objects. 
            Return a JSON array with objects containing:
            - object_name: name of the object
            - confidence: confidence score (0-1)
            - location: approximate location in image
            - description: brief description
            """
            
            message = MessageBuilder.image(
                role="user",
                text=prompt,
                image_url=image_url
            )
            
            result = await client.vision.analyze(message)
            
            # Parse JSON response
            try:
                # Extract JSON from response
                json_match = re.search(r'\[.*?\]', result, re.DOTALL)
                if json_match:
                    objects = json.loads(json_match.group())
                    
                    # Filter by confidence
                    filtered_objects = [
                        obj for obj in objects
                        if obj.get('confidence', 0) >= confidence_threshold
                    ]
                    
                    return {
                        'image_url': image_url,
                        'objects': filtered_objects,
                        'total_objects': len(filtered_objects),
                        'timestamp': time.time()
                    }
            except Exception:
                pass
            
            # Fallback: return raw analysis
            return {
                'image_url': image_url,
                'analysis': result,
                'timestamp': time.time()
            }
    
    async def extract_text_from_image(
        self,
        image_url: str,
        language: str = "auto"
    ) -> Dict[str, Any]:
        """Extract text from image (OCR)."""
        
        async with BlossomClient(config=self.config) as client:
            prompt = f"""
            Extract all text visible in this image.
            Language hint: {language}
            Return the text exactly as it appears, maintaining formatting.
            If no text is visible, return "No text detected".
            """
            
            message = MessageBuilder.image(
                role="user",
                text=prompt,
                image_url=image_url
            )
            
            result = await client.vision.analyze(message)
            
            # Extract structured text
            lines = [line.strip() for line in result.split('\n') if line.strip()]
            
            return {
                'image_url': image_url,
                'extracted_text': result,
                'text_lines': lines,
                'word_count': len(result.split()),
                'timestamp': time.time()
            }
    
    async def analyze_scene(
        self,
        image_url: str,
        analysis_type: str = "comprehensive"
    ) -> Dict[str, Any]:
        """Comprehensive scene analysis."""
        
        analysis_prompts = {
            'comprehensive': """
            Provide a comprehensive analysis of this image including:
            1. Main subjects and objects
            2. Scene setting and environment
            3. Colors and lighting
            4. Composition and perspective
            5. Mood and atmosphere
            6. Any text or symbols visible
            7. Technical quality assessment
            """,
            'technical': """
            Analyze the technical aspects of this image:
            1. Image quality and sharpness
            2. Lighting conditions
            3. Color balance and saturation
            4. Composition and framing
            5. Any technical issues or artifacts
            """,
            'artistic': """
            Analyze the artistic elements of this image:
            1. Visual style and technique
            2. Color palette and mood
            3. Composition and visual flow
            4. Subject matter and theme
            5. Emotional impact
            """
        }
        
        prompt = analysis_prompts.get(analysis_type, analysis_prompts['comprehensive'])
        
        async with BlossomClient(config=self.config) as client:
            message = MessageBuilder.image(
                role="user",
                text=prompt,
                image_url=image_url
            )
            
            result = await client.vision.analyze(message)
            
            # Parse structured analysis
            sections = {}
            current_section = "general"
            sections[current_section] = []
            
            for line in result.split('\n'):
                line = line.strip()
                if line and line[0].isdigit():
                    # New section
                    section_match = re.match(r'\d+\.\s*(.+?):', line)
                    if section_match:
                        current_section = section_match.group(1).lower().replace(' ', '_')
                        sections[current_section] = []
                    sections[current_section].append(line)
                elif line:
                    sections[current_section].append(line)
            
            return {
                'image_url': image_url,
                'analysis_type': analysis_type,
                'structured_analysis': sections,
                'full_analysis': result,
                'timestamp': time.time()
            }
    
    async def compare_images(
        self,
        image1_url: str,
        image2_url: str,
        comparison_focus: str = "similarities"
    ) -> Dict[str, Any]:
        """Compare two images."""
        
        focus_prompts = {
            'similarities': "Compare these two images and describe their similarities:",
            'differences': "Compare these two images and describe their differences:",
            'overall': "Compare these two images and provide a comprehensive comparison:"
        }
        
        prompt = focus_prompts.get(comparison_focus, focus_prompts['overall'])
        
        async with BlossomClient(config=self.config) as client:
            # Build multi-image message
            message = MessageBuilder.multimodal(
                role="user",
                text=prompt,
                images=[
                    {"type": "image_url", "image_url": {"url": image1_url}},
                    {"type": "image_url", "image_url": {"url": image2_url}}
                ]
            )
            
            result = await client.vision.analyze(message)
            
            return {
                'image1_url': image1_url,
                'image2_url': image2_url,
                'comparison_focus': comparison_focus,
                'comparison': result,
                'timestamp': time.time()
            }
    
    async def generate_image_description(
        self,
        image_url: str,
        style: str = "detailed",
        max_length: int = 500
    ) -> Dict[str, Any]:
        """Generate image description for accessibility."""
        
        style_prompts = {
            'detailed': f"Provide a detailed description of this image in {max_length} characters or less:",
            'concise': f"Provide a concise description of this image in {max_length//2} characters or less:",
            'alt_text': "Generate alt text for this image (max 125 characters):",
            'technical': "Provide a technical description of this image for documentation:"
        }
        
        prompt = style_prompts.get(style, style_prompts['detailed'])
        
        async with BlossomClient(config=self.config) as client:
            message = MessageBuilder.image(
                role="user",
                text=prompt,
                image_url=image_url
            )
            
            result = await client.vision.analyze(message)
            
            # Ensure length constraints
            if style == 'alt_text' and len(result) > 125:
                result = result[:125]
            elif len(result) > max_length:
                result = result[:max_length]
            
            return {
                'image_url': image_url,
                'style': style,
                'description': result,
                'length': len(result),
                'timestamp': time.time()
            }

# Usage
async def advanced_vision_analysis():
    """Run advanced vision analysis."""
    
    analyzer = AdvancedVisionAnalyzer()
    
    # Detect objects
    objects = await analyzer.detect_objects(
        "https://example.com/street-scene.jpg",
        confidence_threshold=0.8
    )
    
    print(f"Detected {objects['total_objects']} objects")
    
    # Extract text
    text = await analyzer.extract_text_from_image(
        "https://example.com/document.jpg"
    )
    
    print(f"Extracted {text['word_count']} words")
```

---

## Vision Application Features

### 3. Image Gallery Analyzer

```python
import asyncio
from typing import Dict, Any, List
from dataclasses import dataclass
from blossom_ai import BlossomClient, SessionConfig, MessageBuilder
import json
import time

@dataclass
class GalleryImage:
    """Represents an image in a gallery."""
    id: str
    url: str
    metadata: Dict[str, Any]
    analysis: Dict[str, Any] = None

class ImageGalleryAnalyzer:
    """Analyze and organize image galleries."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=90.0,
            sync_pool_connections=20,
            async_limit_total=100
        )
        self.gallery = []
        self.categories = {}
        self.tags = {}
    
    async def add_image(
        self,
        image_id: str,
        image_url: str,
        metadata: Dict[str, Any] = None
    ) -> GalleryImage:
        """Add image to gallery."""
        
        image = GalleryImage(
            id=image_id,
            url=image_url,
            metadata=metadata or {}
        )
        
        self.gallery.append(image)
        return image
    
    async def analyze_gallery(
        self,
        analysis_types: List[str] = None
    ) -> Dict[str, Any]:
        """Analyze all images in gallery."""
        
        analysis_types = analysis_types or ['content', 'technical', 'tags']
        
        async with BlossomClient(config=self.config) as client:
            tasks = []
            
            for image in self.gallery:
                task = self._analyze_image(client, image, analysis_types)
                tasks.append(task)
            
            results = await asyncio.gather(*tasks)
            
            # Organize results
            for image, analysis in zip(self.gallery, results):
                image.analysis = analysis
                self._organize_by_category(image)
                self._extract_tags(image)
            
        return {
            'total_images': len(self.gallery),
            'categories': dict(self.categories),
            'tags': dict(self.tags),
            'analysis_summary': self._generate_summary()
        }
    
    async def _analyze_image(
        self,
        client: BlossomClient,
        image: GalleryImage,
        analysis_types: List[str]
    ) -> Dict[str, Any]:
        """Analyze single image with multiple analysis types."""
        
        analysis_results = {}
        
        if 'content' in analysis_types:
            # Content analysis
            message = MessageBuilder.image(
                role="user",
                text="Describe the main content of this image:",
                image_url=image.url
            )
            analysis_results['content'] = await client.vision.analyze(message)
        
        if 'technical' in analysis_types:
            # Technical analysis
            message = MessageBuilder.image(
                role="user",
                text="Analyze the technical quality of this image:",
                image_url=image.url
            )
            analysis_results['technical'] = await client.vision.analyze(message)
        
        if 'tags' in analysis_types:
            # Tag extraction
            message = MessageBuilder.image(
                role="user",
                text="Generate relevant tags for this image as a comma-separated list:",
                image_url=image.url
            )
            tags_response = await client.vision.analyze(message)
            analysis_results['tags'] = [tag.strip() for tag in tags_response.split(',')]
        
        return analysis_results
    
    def _organize_by_category(self, image: GalleryImage):
        """Organize images by category."""
        
        # In production, use AI to determine category
        category = image.metadata.get('category', 'uncategorized')
        
        if category not in self.categories:
            self.categories[category] = []
        
        self.categories[category].append(image.id)
    
    def _extract_tags(self, image: GalleryImage):
        """Extract and organize tags."""
        
        if image.analysis and 'tags' in image.analysis:
            for tag in image.analysis['tags']:
                if tag not in self.tags:
                    self.tags[tag] = []
                self.tags[tag].append(image.id)
    
    def _generate_summary(self) -> Dict[str, Any]:
        """Generate gallery summary."""
        
        return {
            'total_categories': len(self.categories),
            'total_tags': len(self.tags),
            'images_per_category': {
                cat: len(images) for cat, images in self.categories.items()
            },
            'most_common_tags': sorted(
                [(tag, len(images)) for tag, images in self.tags.items()],
                key=lambda x: x[1],
                reverse=True
            )[:10]
        }
    
    async def search_gallery(
        self,
        query: str,
        search_type: str = "content"
    ) -> List[GalleryImage]:
        """Search gallery using AI-powered search."""
        
        results = []
        
        async with BlossomClient(config=self.config) as client:
            for image in self.gallery:
                if not image.analysis:
                    continue
                
                if search_type == "content":
                    search_data = image.analysis.get('content', '')
                elif search_type == "tags":
                    search_data = ' '.join(image.analysis.get('tags', []))
                else:
                    search_data = json.dumps(image.analysis)
                
                # Use AI to determine relevance
                relevance_prompt = f"""
                Is the following search query relevant to this image content?
                Query: {query}
                Image content: {search_data}
                Answer with YES or NO only.
                """
                
                message = MessageBuilder.text(
                    role="user",
                    text=relevance_prompt
                )
                
                relevance = await client.text.generate(relevance_prompt)
                
                if relevance.strip().upper() == 'YES':
                    results.append(image)
        
        return results
    
    def export_gallery_data(self, format_type: str = "json") -> str:
        """Export gallery analysis data."""
        
        export_data = {
            'gallery': [
                {
                    'id': img.id,
                    'url': img.url,
                    'metadata': img.metadata,
                    'analysis': img.analysis
                }
                for img in self.gallery
            ],
            'categories': self.categories,
            'tags': self.tags,
            'summary': self._generate_summary(),
            'exported_at': time.time()
        }
        
        if format_type == "json":
            return json.dumps(export_data, indent=2)
        else:
            # Implement other formats (CSV, XML, etc.)
            return json.dumps(export_data)

# Usage
async def analyze_image_gallery():
    """Analyze an image gallery."""
    
    analyzer = ImageGalleryAnalyzer()
    
    # Add images
    images = [
        {"id": "img1", "url": "https://example.com/image1.jpg", "category": "landscape"},
        {"id": "img2", "url": "https://example.com/image2.jpg", "category": "portrait"},
        {"id": "img3", "url": "https://example.com/image3.jpg", "category": "architecture"},
    ]
    
    for img_data in images:
        await analyzer.add_image(
            img_data["id"],
            img_data["url"],
            {"category": img_data["category"]}
        )
    
    # Analyze gallery
    results = await analyzer.analyze_gallery()
    
    print(f"Analyzed {results['total_images']} images")
    print(f"Found {results['categories']} categories")
    print(f"Extracted {results['tags']} unique tags")
    
    # Search gallery
    search_results = await analyzer.search_gallery("beautiful landscape")
    print(f"Found {len(search_results)} relevant images")
```

---

### 4. Real-time Vision Processing

```python
import asyncio
from typing import AsyncGenerator, Dict, Any
import aiohttp
import websockets
from blossom_ai import BlossomClient, SessionConfig, MessageBuilder
import json
import time

class RealtimeVisionProcessor:
    """Process vision tasks in real-time."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=30.0,
            sync_pool_connections=10,
            async_limit_total=50
        )
        self.processing_queue = asyncio.Queue()
        self.results_queue = asyncio.Queue()
        self.is_running = False
    
    async def process_camera_stream(
        self,
        camera_url: str,
        analysis_interval: float = 5.0
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Process live camera stream."""
        
        self.is_running = True
        last_analysis = 0
        
        async with aiohttp.ClientSession() as session:
            async with session.get(camera_url) as response:
                
                # Process stream in chunks
                async for chunk in response.content.iter_chunked(1024):
                    if not self.is_running:
                        break
                    
                    current_time = time.time()
                    
                    # Analyze at specified intervals
                    if current_time - last_analysis >= analysis_interval:
                        last_analysis = current_time
                        
                        # In production, extract frame from video stream
                        # For now, simulate with periodic analysis
                        analysis_result = await self._analyze_frame(chunk)
                        
                        yield {
                            'timestamp': current_time,
                            'frame_analysis': analysis_result,
                            'sequence': int(current_time)
                        }
    
    async def process_websocket_images(
        self,
        websocket_url: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Process images received via WebSocket."""
        
        async with websockets.connect(websocket_url) as websocket:
            async for message in websocket:
                try:
                    # Parse incoming image data
                    data = json.loads(message)
                    
                    if 'image_base64' in data:
                        # Process image
                        result = await self._analyze_image_base64(
                            data['image_base64'],
                            data.get('prompt', 'Analyze this image:')
                        )
                        
                        yield {
                            'client_id': data.get('client_id'),
                            'original_metadata': data.get('metadata', {}),
                            'analysis': result,
                            'processed_at': time.time()
                        }
                
                except Exception as e:
                    yield {
                        'error': str(e),
                        'original_message': message,
                        'timestamp': time.time()
                    }
    
    async def _analyze_frame(self, frame_data: bytes) -> Dict[str, Any]:
        """Analyze video frame."""
        
        # In production, decode frame and analyze
        # For now, simulate analysis
        async with BlossomClient(config=self.config) as client:
            # This would analyze the actual frame
            prompt = "Analyze this video frame and describe what's happening:"
            
            # Simulate base64 encoding
            import base64
            frame_base64 = base64.b64encode(frame_data[:1000]).decode('utf-8')
            
            message = MessageBuilder.image(
                role="user",
                text=prompt,
                image_base64=frame_base64,
                image_format="jpeg"
            )
            
            return await client.vision.analyze(message)
    
    async def _analyze_image_base64(
        self,
        image_base64: str,
        prompt: str
    ) -> Dict[str, Any]:
        """Analyze base64 encoded image."""
        
        async with BlossomClient(config=self.config) as client:
            message = MessageBuilder.image(
                role="user",
                text=prompt,
                image_base64=image_base64,
                image_format="jpeg"
            )
            
            return await client.vision.analyze(message)
    
    async def start_background_processing(self):
        """Start background processing tasks."""
        
        # Start multiple worker tasks
        tasks = [
            asyncio.create_task(self._processing_worker())
            for _ in range(3)
        ]
        
        await asyncio.gather(*tasks)
    
    async def _processing_worker(self):
        """Background processing worker."""
        
        while self.is_running:
            try:
                # Get item from queue with timeout
                item = await asyncio.wait_for(
                    self.processing_queue.get(),
                    timeout=1.0
                )
                
                # Process item
                result = await self._process_queue_item(item)
                
                # Put result in results queue
                await self.results_queue.put(result)
                
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Processing worker error: {e}")
    
    async def _process_queue_item(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """Process item from queue."""
        
        async with BlossomClient(config=self.config) as client:
            # Determine processing based on item type
            if item['type'] == 'image_url':
                message = MessageBuilder.image(
                    role="user",
                    text=item.get('prompt', 'Analyze this image:'),
                    image_url=item['url']
                )
            elif item['type'] == 'image_base64':
                message = MessageBuilder.image(
                    role="user",
                    text=item.get('prompt', 'Analyze this image:'),
                    image_base64=item['data'],
                    image_format=item.get('format', 'jpeg')
                )
            else:
                raise ValueError(f"Unknown item type: {item['type']}")
            
            result = await client.vision.analyze(message)
            
            return {
                'item_id': item.get('id'),
                'result': result,
                'processed_at': time.time()
            }
    
    def stop(self):
        """Stop real-time processing."""
        self.is_running = False
    
    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics."""
        return {
            'queue_size': self.processing_queue.qsize(),
            'results_pending': self.results_queue.qsize(),
            'is_running': self.is_running,
            'uptime': time.time() - getattr(self, 'start_time', time.time())
        }

# Usage
async def run_realtime_processing():
    """Run real-time vision processing."""
    
    processor = RealtimeVisionProcessor()
    
    # Start background processing
    processing_task = asyncio.create_task(processor.start_background_processing())
    
    # Process camera stream
    async for result in processor.process_camera_stream(
        camera_url='http://example.com/camera/stream',
        analysis_interval=10.0
    ):
        print(f"Frame {result['sequence']}: {result['frame_analysis']}")
    
    # Cleanup
    processor.stop()
    await processing_task
```

---

## Vision Application Deployment

### 5. FastAPI Vision Service

```python
# vision_service.py
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from typing import List, Dict, Any
import asyncio
import base64
from PIL import Image
import io
import time
from blossom_ai import BlossomClient, SessionConfig, MessageBuilder

app = FastAPI(title="Blossom AI Vision Service", version="1.0.0")

# Global configuration
config = SessionConfig(
    timeout=60.0,
    sync_pool_connections=20,
    async_limit_total=100
)

@app.post("/analyze/url")
async def analyze_from_url(request: Dict[str, Any]):
    """Analyze image from URL."""
    
    image_url = request.get('url')
    prompt = request.get('prompt', "What's in this image?")
    
    if not image_url:
        raise HTTPException(status_code=400, detail="Image URL is required")
    
    try:
        async with BlossomClient(config=config) as client:
            message = MessageBuilder.image(
                role="user",
                text=prompt,
                image_url=image_url
            )
            
            result = await client.vision.analyze(message)
            
            return {
                'image_url': image_url,
                'prompt': prompt,
                'analysis': result,
                'timestamp': time.time()
            }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze/upload")
async def analyze_uploaded_file(
    file: UploadFile = File(...),
    prompt: str = "What's in this image?"
):
    """Analyze uploaded image file."""
    
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        # Read and validate image
        contents = await file.read()
        
        # Validate image
        image = Image.open(io.BytesIO(contents))
        image.verify()
        
        # Convert to base64
        image_base64 = base64.b64encode(contents).decode('utf-8')
        image_format = file.content_type.split('/')[-1]
        
        async with BlossomClient(config=config) as client:
            message = MessageBuilder.image(
                role="user",
                text=prompt,
                image_base64=image_base64,
                image_format=image_format
            )
            
            result = await client.vision.analyze(message)
            
            return {
                'filename': file.filename,
                'content_type': file.content_type,
                'prompt': prompt,
                'analysis': result,
                'timestamp': time.time()
            }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze/batch")
async def batch_analyze(request: Dict[str, Any]):
    """Analyze multiple images in batch."""
    
    images = request.get('images', [])
    prompt_template = request.get('prompt_template', "Analyze this image:")
    
    if not images:
        raise HTTPException(status_code=400, detail="Images list is required")
    
    try:
        analyzer = VisionAnalyzer(config=config)
        results = await analyzer.batch_analyze(images, prompt_template)
        
        return {
            'total_images': len(results),
            'results': results,
            'timestamp': time.time()
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/detect/objects")
async def detect_objects_endpoint(request: Dict[str, Any]):
    """Detect objects in image."""
    
    image_url = request.get('url')
    confidence_threshold = request.get('confidence_threshold', 0.7)
    
    if not image_url:
        raise HTTPException(status_code=400, detail="Image URL is required")
    
    try:
        analyzer = AdvancedVisionAnalyzer(config=config)
        result = await analyzer.detect_objects(image_url, confidence_threshold)
        
        return result
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    
    try:
        # Test Blossom AI connectivity
        async with BlossomClient(config=config) as client:
            result = await client.text.generate("Health check", max_tokens=5)
        
        return {
            'status': 'healthy',
            'blossom_ai': 'connected',
            'timestamp': time.time()
        }
    
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

---

## Summary

Key vision application patterns for Blossom AI:

1. **Image Analysis**: Comprehensive visual content analysis
2. **Object Detection**: Identify and categorize objects in images
3. **Text Extraction**: OCR capabilities for documents and signs
4. **Scene Understanding**: Advanced scene and context analysis
5. **Image Comparison**: Compare and contrast multiple images
6. **Batch Processing**: Process large image collections efficiently
7. **Real-time Processing**: Stream processing for live video
8. **Gallery Management**: Organize and search image collections
9. **Accessibility**: Generate descriptions for visually impaired users
10. **Production Deployment**: Scalable vision services

---

## See Also

- [Async Patterns](ASYNC_PATTERNS.md) - Async/await best practices
- [Performance Guide](PERFORMANCE.md) - Performance optimization techniques
- [Memory Management](MEMORY.md) - Managing memory with large images
- [Connection Pooling](CONNECTION_POOLING.md) - HTTP connection optimization
- [FastAPI Integration](FASTAPI.md) - Web framework integration
- [Data Pipeline](DATA_PIPELINE.md) - Processing image collections