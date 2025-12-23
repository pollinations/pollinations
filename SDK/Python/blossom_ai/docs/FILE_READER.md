# 📄 File Reader Guide

> **Process and analyze various file formats with Blossom AI**

---

## Overview

This guide covers reading, processing, and analyzing different file formats using Blossom AI, including text documents, structured data, and multimedia files.

---

## Supported File Formats

### Text-Based Formats
- **Plain Text** (.txt)
- **Markdown** (.md)
- **JSON** (.json)
- **CSV** (.csv)
- **XML** (.xml)
- **HTML** (.html)

### Document Formats
- **PDF** (.pdf)
- **Word** (.docx)
- **PowerPoint** (.pptx)
- **Excel** (.xlsx)

### Multimedia Formats
- **Images** (.jpg, .png, .gif, .bmp)
- **Audio** (.mp3, .wav, .ogg)
- **Video** (.mp4, .avi, .mov)

---

## Basic File Reading

### 1. Text File Processing

```python
import asyncio
import aiofiles
from typing import Dict, Any, List, Optional
from blossom_ai import BlossomClient, SessionConfig
import json
import csv
import xml.etree.ElementTree as ET

class TextFileProcessor:
    """Process text-based files with Blossom AI."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=60.0,
            sync_pool_connections=10,
            async_limit_total=50
        )
    
    async def read_text_file(self, file_path: str) -> str:
        """Read text file asynchronously."""
        
        async with aiofiles.open(file_path, 'r', encoding='utf-8') as file:
            content = await file.read()
        
        return content
    
    async def process_text_file(
        self,
        file_path: str,
        processing_type: str = "summarize"
    ) -> Dict[str, Any]:
        """Process text file with Blossom AI."""
        
        content = await self.read_text_file(file_path)
        
        async with BlossomClient(config=self.config) as client:
            if processing_type == "summarize":
                result = await client.text.generate(
                    f"Summarize this text in 3-5 sentences:\n\n{content[:2000]}"
                )
            elif processing_type == "extract_key_points":
                result = await client.text.generate(
                    f"Extract the key points from this text:\n\n{content[:2000]}"
                )
            elif processing_type == "analyze_sentiment":
                result = await client.text.generate(
                    f"Analyze the sentiment of this text:\n\n{content[:2000]}"
                )
            elif processing_type == "translate":
                result = await client.text.generate(
                    f"Translate this text to English:\n\n{content[:2000]}"
                )
            else:
                result = await client.text.generate(
                    f"{processing_type}:\n\n{content[:2000]}"
                )
        
        return {
            'file_path': file_path,
            'processing_type': processing_type,
            'original_length': len(content),
            'result': result,
            'timestamp': time.time()
        }
    
    async def batch_process_text_files(
        self,
        file_paths: List[str],
        processing_type: str = "summarize"
    ) -> List[Dict[str, Any]]:
        """Process multiple text files."""
        
        tasks = [
            self.process_text_file(file_path, processing_type)
            for file_path in file_paths
        ]
        
        return await asyncio.gather(*tasks)
    
    async def compare_text_files(
        self,
        file1_path: str,
        file2_path: str
    ) -> Dict[str, Any]:
        """Compare two text files."""
        
        content1 = await self.read_text_file(file1_path)
        content2 = await self.read_text_file(file2_path)
        
        async with BlossomClient(config=self.config) as client:
            comparison = await client.text.generate(
                f"Compare these two texts:\n\nText 1:\n{content1[:1000]}\n\nText 2:\n{content2[:1000]}\n\nHighlight similarities and differences."
            )
        
        return {
            'file1': file1_path,
            'file2': file2_path,
            'comparison': comparison,
            'length1': len(content1),
            'length2': len(content2),
            'timestamp': time.time()
        }

# Usage
async def process_text_files():
    """Process text files."""
    
    processor = TextFileProcessor()
    
    # Process single file
    result = await processor.process_text_file(
        'document.txt',
        processing_type='summarize'
    )
    
    print(f"Summary: {result['result'][:200]}...")
```

---

### 2. JSON and Structured Data Processing

```python
import asyncio
import json
from typing import Dict, Any, List
from blossom_ai import BlossomClient, SessionConfig

class StructuredDataProcessor:
    """Process structured data files."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=60.0,
            sync_pool_connections=10,
            async_limit_total=50
        )
    
    async def process_json_file(
        self,
        file_path: str,
        analysis_type: str = "summarize"
    ) -> Dict[str, Any]:
        """Process JSON file."""
        
        async with aiofiles.open(file_path, 'r', encoding='utf-8') as file:
            json_content = await file.read()
            data = json.loads(json_content)
        
        async with BlossomClient(config=self.config) as client:
            if analysis_type == "summarize":
                prompt = f"""
                Analyze this JSON data and provide a summary:
                {json.dumps(data, indent=2)[:2000]}
                
                Focus on key insights and patterns.
                """
            elif analysis_type == "validate":
                prompt = f"""
                Validate this JSON data for consistency and quality:
                {json.dumps(data, indent=2)[:2000]}
                
                Identify any issues or improvements needed.
                """
            elif analysis_type == "extract_schema":
                prompt = f"""
                Extract the schema/structure from this JSON data:
                {json.dumps(data, indent=2)[:2000]}
                
                Describe the data structure and field types.
                """
            else:
                prompt = f"{analysis_type}:\n{json.dumps(data, indent=2)[:2000]}"
            
            result = await client.text.generate(prompt)
        
        return {
            'file_path': file_path,
            'analysis_type': analysis_type,
            'data_structure': self._analyze_structure(data),
            'result': result,
            'timestamp': time.time()
        }
    
    def _analyze_structure(self, data: Any, path: str = "") -> Dict[str, Any]:
        """Analyze JSON structure recursively."""
        
        if isinstance(data, dict):
            structure = {
                'type': 'object',
                'properties': {},
                'count': len(data)
            }
            for key, value in data.items():
                structure['properties'][key] = self._analyze_structure(value, f"{path}.{key}")
            return structure
        
        elif isinstance(data, list):
            structure = {
                'type': 'array',
                'length': len(data),
                'items': 'mixed'
            }
            if data:
                # Analyze first few items
                sample_items = data[:3]
                if all(isinstance(item, type(data[0])) for item in sample_items):
                    structure['items'] = self._analyze_structure(data[0], f"{path}[0]")
            return structure
        
        else:
            return {
                'type': type(data).__name__,
                'sample': str(data)[:100]
            }
    
    async def process_csv_file(
        self,
        file_path: str,
        analysis_type: str = "summarize"
    ) -> Dict[str, Any]:
        """Process CSV file."""
        
        async with aiofiles.open(file_path, 'r', encoding='utf-8') as file:
            csv_content = await file.read()
        
        # Parse CSV
        csv_reader = csv.DictReader(csv_content.splitlines())
        rows = list(csv_reader)
        
        # Generate summary statistics
        summary = {
            'total_rows': len(rows),
            'columns': list(rows[0].keys()) if rows else [],
            'sample_data': rows[:5]
        }
        
        async with BlossomClient(config=self.config) as client:
            if analysis_type == "summarize":
                prompt = f"""
                Analyze this CSV data:
                Columns: {summary['columns']}
                Total rows: {summary['total_rows']}
                Sample data: {json.dumps(summary['sample_data'], indent=2)[:1500]}
                
                Provide insights and patterns.
                """
            elif analysis_type == "quality_check":
                prompt = f"""
                Check data quality for this CSV:
                Columns: {summary['columns']}
                Sample data: {json.dumps(summary['sample_data'], indent=2)[:1500]}
                
                Identify data quality issues.
                """
            else:
                prompt = f"{analysis_type}:\n{json.dumps(summary, indent=2)[:2000]}"
            
            result = await client.text.generate(prompt)
        
        return {
            'file_path': file_path,
            'analysis_type': analysis_type,
            'summary': summary,
            'result': result,
            'timestamp': time.time()
        }

# Usage
async def process_structured_data():
    """Process structured data files."""
    
    processor = StructuredDataProcessor()
    
    # Process JSON
    json_result = await processor.process_json_file(
        'data.json',
        analysis_type='extract_schema'
    )
    
    print(f"Schema: {json_result['result'][:200]}...")
```

---

## Advanced File Processing

### 3. PDF Document Processing

```python
import asyncio
from typing import Dict, Any, List
from pathlib import Path
import subprocess
import tempfile
from blossom_ai import BlossomClient, SessionConfig

class PDFProcessor:
    """Process PDF documents with Blossom AI."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=120.0,
            sync_pool_connections=10,
            async_limit_total=50
        )
    
    async def extract_pdf_text(self, file_path: str) -> str:
        """Extract text from PDF using pdftotext."""
        
        try:
            # Use pdftotext command line tool
            result = subprocess.run(
                ['pdftotext', '-layout', file_path, '-'],
                capture_output=True,
                text=True,
                check=True
            )
            
            return result.stdout
        
        except subprocess.CalledProcessError as e:
            raise Exception(f"Failed to extract text from PDF: {e}")
    
    async def process_pdf(
        self,
        file_path: str,
        processing_type: str = "summarize"
    ) -> Dict[str, Any]:
        """Process PDF document."""
        
        # Extract text
        text_content = await self.extract_pdf_text(file_path)
        
        # Process with Blossom AI
        async with BlossomClient(config=self.config) as client:
            if processing_type == "summarize":
                sections = text_content.split('\n\n')
                summary_parts = []
                
                # Process in chunks
                for i in range(0, min(len(sections), 10), 2):
                    chunk = '\n\n'.join(sections[i:i+2])
                    if chunk.strip():
                        chunk_summary = await client.text.generate(
                            f"Summarize:\n{chunk[:1000]}"
                        )
                        summary_parts.append(chunk_summary)
                
                # Combine summaries
                combined_summary = '\n'.join(summary_parts)
                result = combined_summary
                
            elif processing_type == "extract_key_points":
                result = await client.text.generate(
                    f"Extract key points from this document:\n{text_content[:2000]}"
                )
            
            elif processing_type == "extract_entities":
                result = await client.text.generate(
                    f"Extract named entities from this document:\n{text_content[:2000]}"
                )
            
            else:
                result = await client.text.generate(
                    f"{processing_type}:\n{text_content[:2000]}"
                )
        
        return {
            'file_path': file_path,
            'processing_type': processing_type,
            'text_length': len(text_content),
            'result': result,
            'timestamp': time.time()
        }
    
    async def process_pdf_pages(
        self,
        file_path: str,
        page_numbers: List[int] = None
    ) -> Dict[str, Any]:
        """Process specific pages of PDF."""
        
        # Extract specific pages
        if page_numbers:
            page_args = ' '.join([f'-f {page}' for page in page_numbers])
            cmd = ['pdftotext', '-layout', page_args, file_path, '-']
        else:
            cmd = ['pdftotext', '-layout', file_path, '-']
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        text_content = result.stdout
        
        async with BlossomClient(config=self.config) as client:
            summary = await client.text.generate(
                f"Summarize these PDF pages:\n{text_content[:2000]}"
            )
        
        return {
            'file_path': file_path,
            'pages': page_numbers or 'all',
            'summary': summary,
            'text_length': len(text_content),
            'timestamp': time.time()
        }

# Usage
async def process_pdf_files():
    """Process PDF files."""
    
    processor = PDFProcessor()
    
    # Process PDF
    result = await processor.process_pdf(
        'document.pdf',
        processing_type='summarize'
    )
    
    print(f"Summary: {result['result'][:200]}...")
```

---

### 4. Multimedia File Processing

```python
import asyncio
from typing import Dict, Any, Optional
from pathlib import Path
import subprocess
import base64
from blossom_ai import BlossomClient, SessionConfig, MessageBuilder

class MultimediaProcessor:
    """Process multimedia files with Blossom AI."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=120.0,
            sync_pool_connections=10,
            async_limit_total=50
        )
    
    async def process_image_file(
        self,
        file_path: str,
        prompt: str = "What's in this image?"
    ) -> Dict[str, Any]:
        """Process image file with vision analysis."""
        
        # Read image file
        with open(file_path, 'rb') as f:
            image_data = f.read()
        
        # Convert to base64
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        # Determine format
        image_format = Path(file_path).suffix.lower().lstrip('.')
        if image_format == 'jpg':
            image_format = 'jpeg'
        
        async with BlossomClient(config=self.config) as client:
            message = MessageBuilder.image(
                role="user",
                text=prompt,
                image_base64=image_base64,
                image_format=image_format
            )
            
            analysis = await client.vision.analyze(message)
        
        return {
            'file_path': file_path,
            'image_format': image_format,
            'image_size': len(image_data),
            'prompt': prompt,
            'analysis': analysis,
            'timestamp': time.time()
        }
    
    async def extract_audio_transcript(
        self,
        audio_path: str
    ) -> str:
        """Extract transcript from audio using Whisper."""
        
        # This would integrate with Whisper API
        # For now, simulate with placeholder
        return f"Transcript extracted from {audio_path}"
    
    async def process_audio_file(
        self,
        file_path: str,
        analysis_type: str = "summarize"
    ) -> Dict[str, Any]:
        """Process audio file."""
        
        # Extract transcript
        transcript = await self.extract_audio_transcript(file_path)
        
        async with BlossomClient(config=self.config) as client:
            if analysis_type == "summarize":
                result = await client.text.generate(
                    f"Summarize this audio transcript:\n{transcript[:2000]}"
                )
            elif analysis_type == "sentiment":
                result = await client.text.generate(
                    f"Analyze the sentiment of this transcript:\n{transcript[:2000]}"
                )
            elif analysis_type == "extract_topics":
                result = await client.text.generate(
                    f"Extract main topics from this transcript:\n{transcript[:2000]}"
                )
            else:
                result = await client.text.generate(
                    f"{analysis_type}:\n{transcript[:2000]}"
                )
        
        return {
            'file_path': file_path,
            'analysis_type': analysis_type,
            'transcript_length': len(transcript),
            'result': result,
            'timestamp': time.time()
        }
    
    async def process_video_file(
        self,
        file_path: str,
        sample_interval: int = 10
    ) -> Dict[str, Any]:
        """Process video file by sampling frames."""
        
        # Extract frames using ffmpeg
        with tempfile.TemporaryDirectory() as temp_dir:
            # Extract frames at intervals
            cmd = [
                'ffmpeg', '-i', file_path,
                '-vf', f'fps=1/{sample_interval}',
                f'{temp_dir}/frame_%03d.jpg'
            ]
            
            subprocess.run(cmd, capture_output=True, check=True)
            
            # Process extracted frames
            frame_files = sorted(Path(temp_dir).glob('frame_*.jpg'))
            
            frame_analyses = []
            async with BlossomClient(config=self.config) as client:
                for frame_file in frame_files[:10]:  # Limit to 10 frames
                    with open(frame_file, 'rb') as f:
                        frame_data = f.read()
                    
                    frame_base64 = base64.b64encode(frame_data).decode('utf-8')
                    
                    message = MessageBuilder.image(
                        role="user",
                        text="Describe what's happening in this video frame:",
                        image_base64=frame_base64,
                        image_format='jpeg'
                    )
                    
                    analysis = await client.vision.analyze(message)
                    frame_analyses.append(analysis)
            
            # Summarize frame analyses
            all_analyses = "\n\n".join(frame_analyses)
            
            async with BlossomClient(config=self.config) as client:
                video_summary = await client.text.generate(
                    f"Summarize this video based on frame analyses:\n{all_analyses[:2000]}"
                )
        
        return {
            'file_path': file_path,
            'frames_analyzed': len(frame_analyses),
            'sample_interval': sample_interval,
            'frame_analyses': frame_analyses,
            'summary': video_summary,
            'timestamp': time.time()
        }

# Usage
async def process_multimedia_files():
    """Process multimedia files."""
    
    processor = MultimediaProcessor()
    
    # Process image
    image_result = await processor.process_image_file(
        'photo.jpg',
        prompt='Describe this image in detail'
    )
    
    print(f"Image Analysis: {image_result['analysis'][:200]}...")
```

---

## Batch Processing and Automation

### 5. File Processing Pipeline

```python
import asyncio
from typing import Dict, Any, List, Optional
from pathlib import Path
from dataclasses import dataclass
from blossom_ai import BlossomClient, SessionConfig
import json

@dataclass
class ProcessingTask:
    """File processing task."""
    file_path: str
    file_type: str
    processing_type: str
    output_path: Optional[str] = None

class FileProcessingPipeline:
    """Pipeline for processing multiple files."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=120.0,
            sync_pool_connections=15,
            async_limit_total=75
        )
        self.processors = {
            'text': TextFileProcessor(config),
            'json': StructuredDataProcessor(config),
            'pdf': PDFProcessor(config),
            'image': MultimediaProcessor(config)
        }
    
    async def process_single_file(
        self,
        task: ProcessingTask
    ) -> Dict[str, Any]:
        """Process a single file."""
        
        processor = self.processors.get(task.file_type)
        
        if not processor:
            return {
                'error': f'Unsupported file type: {task.file_type}',
                'task': task,
                'timestamp': time.time()
            }
        
        try:
            if task.file_type == 'text':
                result = await processor.process_text_file(
                    task.file_path,
                    task.processing_type
                )
            elif task.file_type == 'json':
                result = await processor.process_json_file(
                    task.file_path,
                    task.processing_type
                )
            elif task.file_type == 'pdf':
                result = await processor.process_pdf(
                    task.file_path,
                    task.processing_type
                )
            elif task.file_type == 'image':
                result = await processor.process_image_file(
                    task.file_path,
                    task.processing_type
                )
            else:
                result = {'error': 'Unknown processor method'}
            
            # Save to output file if specified
            if task.output_path:
                await self._save_result(result, task.output_path)
            
            return result
        
        except Exception as e:
            return {
                'error': str(e),
                'task': task,
                'timestamp': time.time()
            }
    
    async def process_batch(
        tasks: List[ProcessingTask]
    ) -> List[Dict[str, Any]]:
        """Process multiple files in batch."""
        
        semaphore = asyncio.Semaphore(5)  # Limit concurrent processing
        
        async def process_with_limit(task: ProcessingTask):
            async with semaphore:
                return await self.process_single_file(task)
        
        batch_tasks = [process_with_limit(task) for task in tasks]
        results = await asyncio.gather(*batch_tasks)
        
        return results
    
    async def process_directory(
        self,
        directory_path: str,
        file_pattern: str = "*",
        processing_type: str = "summarize"
    ) -> List[Dict[str, Any]]:
        """Process all files in a directory."""
        
        directory = Path(directory_path)
        
        # Find files matching pattern
        files = list(directory.glob(file_pattern))
        
        # Create processing tasks
        tasks = []
        for file_path in files:
            if file_path.is_file():
                file_type = self._detect_file_type(file_path)
                
                task = ProcessingTask(
                    file_path=str(file_path),
                    file_type=file_type,
                    processing_type=processing_type,
                    output_path=str(file_path.with_suffix('.analysis.json'))
                )
                
                tasks.append(task)
        
        # Process batch
        return await self.process_batch(tasks)
    
    def _detect_file_type(self, file_path: Path) -> str:
        """Detect file type from extension."""
        
        extension = file_path.suffix.lower()
        
        if extension in ['.txt', '.md', '.log']:
            return 'text'
        elif extension in ['.json']:
            return 'json'
        elif extension in ['.csv']:
            return 'csv'
        elif extension in ['.pdf']:
            return 'pdf'
        elif extension in ['.jpg', '.jpeg', '.png', '.gif', '.bmp']:
            return 'image'
        else:
            return 'unknown'
    
    async def _save_result(self, result: Dict[str, Any], output_path: str):
        """Save result to file."""
        
        async with aiofiles.open(output_path, 'w', encoding='utf-8') as f:
            await f.write(json.dumps(result, indent=2))
    
    def get_pipeline_stats(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Get pipeline statistics."""
        
        successful = [r for r in results if 'error' not in r]
        failed = [r for r in results if 'error' in r]
        
        return {
            'total_files': len(results),
            'successful': len(successful),
            'failed': len(failed),
            'success_rate': len(successful) / len(results) if results else 0,
            'file_types': {}
        }

# Usage
async def run_file_pipeline():
    """Run file processing pipeline."""
    
    pipeline = FileProcessingPipeline()
    
    # Process directory
    results = await pipeline.process_directory(
        directory_path='./documents',
        file_pattern='*.txt',
        processing_type='summarize'
    )
    
    # Get statistics
    stats = pipeline.get_pipeline_stats(results)
    
    print(f"Pipeline Statistics:")
    print(f"Total Files: {stats['total_files']}")
    print(f"Successful: {stats['successful']}")
    print(f"Failed: {stats['failed']}")
    print(f"Success Rate: {stats['success_rate']:.1%}")
```

---

## Summary

Key file processing patterns for Blossom AI:

1. **Text Processing**: Handle various text formats efficiently
2. **Structured Data**: Process JSON, CSV, XML with AI insights
3. **PDF Documents**: Extract and analyze PDF content
4. **Multimedia**: Process images, audio, and video files
5. **Batch Processing**: Handle multiple files concurrently
6. **Pipeline Automation**: Automated file processing workflows
7. **Error Handling**: Robust error management for file operations
8. **Format Detection**: Automatic file type identification
9. **Scalable Processing**: Handle large file collections
10. **Quality Assurance**: Validate processed outputs

---

## See Also

- [Data Pipeline](DATA_PIPELINE.md) - Building data processing pipelines
- [Async Patterns](ASYNC_PATTERNS.md) - Async/await best practices
- [Performance Guide](PERFORMANCE.md) - Performance optimization techniques
- [Memory Management](MEMORY.md) - Managing memory with large files
- [Error Handling](ERROR_TYPES.md) - Comprehensive error handling