# 🔄 Data Pipeline Guide

> **Build efficient data processing pipelines with Blossom AI**

---

## Overview

This guide covers building data pipelines that leverage Blossom AI for various data processing tasks, including ETL patterns, batch processing, and real-time data transformation.

---

## Pipeline Architecture

### Basic Pipeline Structure

```
Data Source → Extract → Transform → Load → Blossom AI → Output
```

### Pipeline Types

1. **Batch Pipelines**: Process large datasets periodically
2. **Streaming Pipelines**: Process data in real-time
3. **Hybrid Pipelines**: Combine batch and streaming approaches

---

## Batch Processing Pipeline

### 1. Simple ETL Pipeline

```python
import asyncio
import pandas as pd
from typing import List, Dict, Any
from blossom_ai import BlossomClient, SessionConfig
import json
import time

class SimpleETLPipeline:
    """Simple ETL pipeline with Blossom AI integration."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=60.0,
            sync_pool_connections=10,
            rate_limit_per_minute=1000
        )
        self.client = None
    
    async def __aenter__(self):
        """Initialize pipeline."""
        self.client = BlossomClient(config=self.config)
        await self.client.__aenter__()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Cleanup pipeline."""
        if self.client:
            await self.client.__aexit__(exc_type, exc_val, exc_tb)
    
    async def extract(self, source: str) -> pd.DataFrame:
        """Extract data from source."""
        
        # Example: Read from CSV
        if source.endswith('.csv'):
            return pd.read_csv(source)
        
        # Example: Read from JSON
        elif source.endswith('.json'):
            return pd.read_json(source)
        
        # Example: Database query (simplified)
        else:
            # In production, implement actual database extraction
            data = [
                {"id": i, "text": f"Sample text {i}"}
                for i in range(100)
            ]
            return pd.DataFrame(data)
    
    async def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Transform data using Blossom AI."""
        
        # Process each row
        results = []
        
        for index, row in df.iterrows():
            # Generate enhanced text
            enhanced_text = await self.client.text.generate(
                f"Enhance and expand this text: {row['text']}"
            )
            
            # Extract insights
            insights = await self.client.text.generate(
                f"Extract key insights from: {enhanced_text}"
            )
            
            results.append({
                'original_id': row['id'],
                'original_text': row['text'],
                'enhanced_text': enhanced_text,
                'insights': insights,
                'processed_at': time.time()
            })
        
        return pd.DataFrame(results)
    
    async def load(self, df: pd.DataFrame, destination: str):
        """Load transformed data to destination."""
        
        # Example: Save to CSV
        if destination.endswith('.csv'):
            df.to_csv(destination, index=False)
        
        # Example: Save to JSON
        elif destination.endswith('.json'):
            df.to_json(destination, orient='records')
        
        # Example: Database insert (simplified)
        else:
            # In production, implement actual database loading
            logger.info(f"Loading {len(df)} records to {destination}")
    
    async def run_pipeline(self, source: str, destination: str):
        """Run complete ETL pipeline."""
        
        start_time = time.time()
        
        # Extract
        logger.info(f"Extracting data from {source}")
        df = await self.extract(source)
        
        # Transform
        logger.info(f"Transforming {len(df)} records")
        transformed_df = await self.transform(df)
        
        # Load
        logger.info(f"Loading data to {destination}")
        await self.load(transformed_df, destination)
        
        elapsed_time = time.time() - start_time
        logger.info(f"Pipeline completed in {elapsed_time:.2f} seconds")
        
        return {
            'source': source,
            'destination': destination,
            'records_processed': len(df),
            'elapsed_time': elapsed_time,
            'status': 'completed'
        }

# Usage
async def run_simple_pipeline():
    """Run simple ETL pipeline."""
    
    async with SimpleETLPipeline() as pipeline:
        result = await pipeline.run_pipeline(
            source='input_data.csv',
            destination='processed_data.json'
        )
        print(result)
```

---

### 2. Batch Processing with Parallelism

```python
import asyncio
from typing import List, Dict, Any, Callable
import pandas as pd
from blossom_ai import BlossomClient, SessionConfig
import aiofiles
import json

class ParallelBatchProcessor:
    """Process large batches with parallel execution."""
    
    def __init__(
        self,
        batch_size: int = 100,
        max_concurrent: int = 10,
        config: SessionConfig = None
    ):
        self.batch_size = batch_size
        self.max_concurrent = max_concurrent
        self.config = config or SessionConfig(
            timeout=120.0,
            sync_pool_connections=20,
            async_limit_total=50
        )
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.results = []
    
    async def process_batch(
        self,
        data: List[Dict[str, Any]],
        process_func: Callable[[BlossomClient, Dict[str, Any]], Any]
    ) -> List[Any]:
        """Process a batch of data items."""
        
        async with BlossomClient(config=self.config) as client:
            # Create tasks for batch processing
            tasks = [
                self._process_item(client, item, process_func)
                for item in data
            ]
            
            # Execute all tasks concurrently
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Filter out exceptions
            successful_results = [
                result for result in results
                if not isinstance(result, Exception)
            ]
            
            return successful_results
    
    async def _process_item(
        self,
        client: BlossomClient,
        item: Dict[str, Any],
        process_func: Callable
    ) -> Any:
        """Process individual item with semaphore control."""
        
        async with self.semaphore:
            return await process_func(client, item)
    
    async def process_large_dataset(
        self,
        data_source: str,
        process_func: Callable,
        output_file: str
    ):
        """Process large dataset in batches."""
        
        # Load data
        df = pd.read_csv(data_source)
        total_records = len(df)
        
        # Process in batches
        all_results = []
        
        for start_idx in range(0, total_records, self.batch_size):
            end_idx = min(start_idx + self.batch_size, total_records)
            batch = df.iloc[start_idx:end_idx].to_dict('records')
            
            logger.info(f"Processing batch {start_idx//self.batch_size + 1}: {len(batch)} records")
            
            # Process batch
            batch_results = await self.process_batch(batch, process_func)
            all_results.extend(batch_results)
            
            # Small delay between batches
            await asyncio.sleep(1)
        
        # Save results
        async with aiofiles.open(output_file, 'w') as f:
            await f.write(json.dumps(all_results, indent=2))
        
        return {
            'total_processed': total_records,
            'successful': len(all_results),
            'output_file': output_file
        }

# Processing functions
async def enhance_text(client: BlossomClient, item: Dict[str, Any]) -> Dict[str, Any]:
    """Enhance text using Blossom AI."""
    
    enhanced = await client.text.generate(
        f"Enhance this text: {item['text']}"
    )
    
    return {
        'id': item['id'],
        'original_text': item['text'],
        'enhanced_text': enhanced,
        'length_original': len(item['text']),
        'length_enhanced': len(enhanced)
    }

async def analyze_sentiment(client: BlossomClient, item: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze sentiment of text."""
    
    sentiment = await client.text.generate(
        f"Analyze the sentiment of this text and return POSITIVE, NEGATIVE, or NEUTRAL: {item['text']}"
    )
    
    return {
        'id': item['id'],
        'text': item['text'],
        'sentiment': sentiment.strip().upper()
    }

# Usage
async def run_parallel_processing():
    """Run parallel batch processing."""
    
    processor = ParallelBatchProcessor(
        batch_size=50,
        max_concurrent=20
    )
    
    result = await processor.process_large_dataset(
        data_source='large_dataset.csv',
        process_func=enhance_text,
        output_file='enhanced_data.json'
    )
    
    print(result)
```

---

## Streaming Pipeline

### 3. Real-time Data Processing

```python
import asyncio
from typing import AsyncGenerator, Dict, Any
import aiohttp
import json
from blossom_ai import BlossomClient, SessionConfig

class StreamingPipeline:
    """Process streaming data in real-time."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=30.0,
            sync_pool_connections=10,
            async_limit_total=50
        )
        self.processed_count = 0
        self.error_count = 0
    
    async def stream_processor(
        self,
        source_url: str,
        process_func: Callable[[BlossomClient, Dict[str, Any]], Any]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Process streaming data from source."""
        
        async with aiohttp.ClientSession() as session:
            async with session.get(source_url) as response:
                async with BlossomClient(config=self.config) as client:
                    
                    async for line in response.content:
                        if line:
                            try:
                                # Parse incoming data
                                data = json.loads(line.decode('utf-8'))
                                
                                # Process with Blossom AI
                                result = await process_func(client, data)
                                
                                self.processed_count += 1
                                
                                yield {
                                    'input': data,
                                    'output': result,
                                    'processed_at': time.time(),
                                    'sequence': self.processed_count
                                }
                                
                            except Exception as e:
                                self.error_count += 1
                                logger.error(f"Processing error: {e}")
                                
                                yield {
                                    'input': data,
                                    'error': str(e),
                                    'processed_at': time.time()
                                }
    
    async def process_websocket_stream(
        self,
        websocket_url: str,
        process_func: Callable
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Process data from WebSocket stream."""
        
        async with aiohttp.ClientSession() as session:
            async with session.ws_connect(websocket_url) as ws:
                async with BlossomClient(config=self.config) as client:
                    
                    async for msg in ws:
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            try:
                                data = json.loads(msg.data)
                                
                                result = await process_func(client, data)
                                
                                self.processed_count += 1
                                
                                yield {
                                    'input': data,
                                    'output': result,
                                    'processed_at': time.time(),
                                    'sequence': self.processed_count
                                }
                                
                            except Exception as e:
                                self.error_count += 1
                                logger.error(f"WebSocket processing error: {e}")
    
    async def sink_to_destination(
        self,
        stream: AsyncGenerator[Dict[str, Any], None],
        destination_url: str
    ):
        """Send processed data to destination."""
        
        async with aiohttp.ClientSession() as session:
            async for item in stream:
                try:
                    async with session.post(
                        destination_url,
                        json=item,
                        headers={'Content-Type': 'application/json'}
                    ) as response:
                        if response.status >= 400:
                            logger.error(f"Sink error: {response.status}")
                
                except Exception as e:
                    logger.error(f"Sink connection error: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get pipeline statistics."""
        
        return {
            'processed_count': self.processed_count,
            'error_count': self.error_count,
            'success_rate': (
                (self.processed_count - self.error_count) / max(self.processed_count, 1)
            ) * 100,
            'uptime': time.time() - getattr(self, 'start_time', time.time())
        }

# Usage
async def run_streaming_pipeline():
    """Run streaming data pipeline."""
    
    pipeline = StreamingPipeline()
    pipeline.start_time = time.time()
    
    # Process stream
    stream = pipeline.stream_processor(
        source_url='https://api.example.com/stream',
        process_func=enhance_text
    )
    
    # Sink to destination
    await pipeline.sink_to_destination(
        stream,
        destination_url='https://api.destination.com/processed'
    )
```

---

## Pipeline Orchestration

### 4. Complex Pipeline with Multiple Stages

```python
import asyncio
from typing import Dict, Any, List, Callable
from dataclasses import dataclass
from blossom_ai import BlossomClient, SessionConfig
import logging

@dataclass
class PipelineStage:
    """Define a pipeline stage."""
    name: str
    func: Callable
    config: Dict[str, Any]
    
class ComplexPipeline:
    """Complex multi-stage data pipeline."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=120.0,
            sync_pool_connections=15,
            async_limit_total=100
        )
        self.stages = []
        self.results = {}
        self.errors = []
    
    def add_stage(self, stage: PipelineStage):
        """Add a processing stage to the pipeline."""
        self.stages.append(stage)
    
    async def execute_stage(
        self,
        client: BlossomClient,
        stage: PipelineStage,
        input_data: Any
    ) -> Any:
        """Execute a single pipeline stage."""
        
        try:
            logger.info(f"Executing stage: {stage.name}")
            
            result = await stage.func(client, input_data, **stage.config)
            
            self.results[stage.name] = {
                'status': 'completed',
                'output': result,
                'timestamp': time.time()
            }
            
            return result
        
        except Exception as e:
            error_info = {
                'stage': stage.name,
                'error': str(e),
                'timestamp': time.time()
            }
            
            self.errors.append(error_info)
            self.results[stage.name] = {
                'status': 'failed',
                'error': str(e),
                'timestamp': time.time()
            }
            
            raise
    
    async def run_pipeline(self, initial_data: Any) -> Dict[str, Any]:
        """Run complete pipeline with all stages."""
        
        start_time = time.time()
        current_data = initial_data
        
        async with BlossomClient(config=self.config) as client:
            for stage in self.stages:
                current_data = await self.execute_stage(
                    client,
                    stage,
                    current_data
                )
        
        total_time = time.time() - start_time
        
        return {
            'pipeline_status': 'completed' if not self.errors else 'failed',
            'total_time': total_time,
            'stages': self.results,
            'errors': self.errors,
            'final_output': current_data
        }
    
    def get_pipeline_dag(self) -> Dict[str, Any]:
        """Get pipeline structure as DAG."""
        
        return {
            'stages': [
                {
                    'name': stage.name,
                    'config': stage.config
                }
                for stage in self.stages
            ],
            'total_stages': len(self.stages)
        }

# Stage functions
async def extract_insights(client: BlossomClient, data: Dict[str, Any], **config) -> Dict[str, Any]:
    """Extract insights from data."""
    
    prompt = f"Extract key insights from: {json.dumps(data)}"
    insights = await client.text.generate(prompt)
    
    return {
        'original_data': data,
        'insights': insights,
        'extraction_method': config.get('method', 'ai_extraction')
    }

async def categorize_content(client: BlossomClient, data: Dict[str, Any], **config) -> Dict[str, Any]:
    """Categorize content."""
    
    categories = config.get('categories', ['general'])
    prompt = f"Categorize this content into one of: {', '.join(categories)}. Content: {data.get('insights', '')}"
    
    category = await client.text.generate(prompt)
    
    data['category'] = category.strip()
    return data

async def generate_summary(client: BlossomClient, data: Dict[str, Any], **config) -> Dict[str, Any]:
    """Generate summary."""
    
    max_length = config.get('max_length', 100)
    prompt = f"Generate a {max_length}-character summary of: {data.get('insights', '')}"
    
    summary = await client.text.generate(prompt)
    
    data['summary'] = summary[:max_length]
    return data

async def format_output(client: BlossomClient, data: Dict[str, Any], **config) -> Dict[str, Any]:
    """Format final output."""
    
    format_type = config.get('format', 'json')
    
    if format_type == 'json':
        return {
            'id': data.get('original_data', {}).get('id'),
            'category': data.get('category'),
            'summary': data.get('summary'),
            'insights': data.get('insights'),
            'processed_at': time.time()
        }
    
    elif format_type == 'text':
        text_output = f"""
ID: {data.get('original_data', {}).get('id')}
Category: {data.get('category')}
Summary: {data.get('summary')}

Insights:
{data.get('insights')}
"""
        return {'formatted_text': text_output}
    
    return data

# Usage
async def run_complex_pipeline():
    """Run complex multi-stage pipeline."""
    
    pipeline = ComplexPipeline()
    
    # Add stages
    pipeline.add_stage(PipelineStage(
        name='extract_insights',
        func=extract_insights,
        config={'method': 'ai_extraction'}
    ))
    
    pipeline.add_stage(PipelineStage(
        name='categorize',
        func=categorize_content,
        config={
            'categories': ['technology', 'business', 'science', 'general']
        }
    ))
    
    pipeline.add_stage(PipelineStage(
        name='generate_summary',
        func=generate_summary,
        config={'max_length': 200}
    ))
    
    pipeline.add_stage(PipelineStage(
        name='format_output',
        func=format_output,
        config={'format': 'json'}
    ))
    
    # Run pipeline
    initial_data = {
        'id': 123,
        'text': 'Blossom AI is revolutionizing artificial intelligence with advanced capabilities.',
        'source': 'news_article'
    }
    
    result = await pipeline.run_pipeline(initial_data)
    print(json.dumps(result, indent=2))
```

---

## Pipeline Monitoring and Error Handling

### 5. Pipeline with Monitoring

```python
import asyncio
import time
import logging
from typing import Dict, Any, List
from dataclasses import dataclass, field
from blossom_ai import BlossomClient, SessionConfig

@dataclass
class PipelineMetrics:
    """Pipeline execution metrics."""
    start_time: float = field(default_factory=time.time)
    stage_metrics: Dict[str, Any] = field(default_factory=dict)
    total_records: int = 0
    successful_records: int = 0
    failed_records: int = 0
    errors: List[Dict[str, Any]] = field(default_factory=list)
    
    def record_stage_start(self, stage_name: str):
        """Record stage start time."""
        self.stage_metrics[stage_name] = {
            'start_time': time.time(),
            'status': 'running'
        }
    
    def record_stage_complete(self, stage_name: str, record_count: int = 1):
        """Record stage completion."""
        if stage_name in self.stage_metrics:
            self.stage_metrics[stage_name].update({
                'end_time': time.time(),
                'duration': time.time() - self.stage_metrics[stage_name]['start_time'],
                'status': 'completed',
                'records_processed': record_count
            })
    
    def record_stage_error(self, stage_name: str, error: str):
        """Record stage error."""
        if stage_name in self.stage_metrics:
            self.stage_metrics[stage_name].update({
                'end_time': time.time(),
                'duration': time.time() - self.stage_metrics[stage_name]['start_time'],
                'status': 'failed',
                'error': error
            })
    
    def record_success(self):
        """Record successful record processing."""
        self.successful_records += 1
    
    def record_failure(self, error: str, context: Dict[str, Any] = None):
        """Record failed record processing."""
        self.failed_records += 1
        self.errors.append({
            'error': error,
            'context': context or {},
            'timestamp': time.time()
        })
    
    def get_summary(self) -> Dict[str, Any]:
        """Get pipeline execution summary."""
        total_time = time.time() - self.start_time
        
        return {
            'total_time': total_time,
            'total_records': self.total_records,
            'successful_records': self.successful_records,
            'failed_records': self.failed_records,
            'success_rate': (
                self.successful_records / max(self.total_records, 1) * 100
            ),
            'stage_metrics': self.stage_metrics,
            'error_count': len(self.errors),
            'errors': self.errors[:10]  # First 10 errors
        }

class MonitoredPipeline:
    """Pipeline with comprehensive monitoring."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=120.0,
            sync_pool_connections=15,
            async_limit_total=100
        )
        self.metrics = PipelineMetrics()
    
    async def safe_process(
        self,
        client: BlossomClient,
        process_func: Callable,
        data: Any,
        stage_name: str
    ) -> Any:
        """Process data with error handling and monitoring."""
        
        self.metrics.record_stage_start(stage_name)
        
        try:
            result = await process_func(client, data)
            self.metrics.record_stage_complete(stage_name)
            self.metrics.record_success()
            return result
        
        except Exception as e:
            error_msg = str(e)
            self.metrics.record_stage_error(stage_name, error_msg)
            self.metrics.record_failure(error_msg, {'stage': stage_name})
            
            # Log detailed error
            logger.error(f"Pipeline error in stage {stage_name}: {error_msg}")
            
            # In production, implement retry logic or dead letter queue
            raise
    
    async def run_monitored_pipeline(self, data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Run pipeline with full monitoring."""
        
        self.metrics.total_records = len(data)
        
        async with BlossomClient(config=self.config) as client:
            # Example: Multi-stage processing with monitoring
            processed_data = []
            
            for i, item in enumerate(data):
                try:
                    # Stage 1: Extract insights
                    insights = await self.safe_process(
                        client,
                        extract_insights,
                        item,
                        'extract_insights'
                    )
                    
                    # Stage 2: Categorize
                    categorized = await self.safe_process(
                        client,
                        categorize_content,
                        insights,
                        'categorize'
                    )
                    
                    # Stage 3: Generate summary
                    summarized = await self.safe_process(
                        client,
                        generate_summary,
                        categorized,
                        'generate_summary'
                    )
                    
                    processed_data.append(summarized)
                
                except Exception as e:
                    # Continue with next item
                    logger.error(f"Failed to process item {i}: {e}")
                    continue
        
        return {
            'processed_data': processed_data,
            'metrics': self.metrics.get_summary()
        }

# Usage
async def run_monitored_pipeline():
    """Run pipeline with monitoring."""
    
    pipeline = MonitoredPipeline()
    
    # Sample data
    data = [
        {'id': i, 'text': f'Sample text {i}', 'source': 'test'}
        for i in range(100)
    ]
    
    result = await pipeline.run_monitored_pipeline(data)
    
    # Log summary
    metrics = result['metrics']
    logger.info(f"Pipeline completed: {metrics['success_rate']:.1f}% success rate")
    logger.info(f"Processing time: {metrics['total_time']:.2f}s")
    
    if metrics['error_count'] > 0:
        logger.warning(f"Pipeline had {metrics['error_count']} errors")
    
    return result
```

---

## Pipeline Orchestration

### 6. Pipeline with Airflow Integration

```python
# airflow_dag.py
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.utils.dates import days_ago
import asyncio
import json

# DAG configuration
default_args = {
    'owner': 'blossom_ai',
    'depends_on_past': False,
    'start_date': days_ago(1),
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 2,
    'retry_delay': timedelta(minutes=5),
}

dag = DAG(
    'blossom_ai_data_pipeline',
    default_args=default_args,
    description='Blossom AI Data Processing Pipeline',
    schedule_interval=timedelta(hours=6),
    catchup=False,
)

def extract_data(**context):
    """Extract data from source."""
    
    # In production, extract from actual source
    data = [
        {'id': i, 'text': f'Sample article {i}', 'category': 'general'}
        for i in range(100)
    ]
    
    # Store in XCom for next task
    context['task_instance'].xcom_push(key='raw_data', value=data)
    
    return f"Extracted {len(data)} records"

def process_with_blossom(**context):
    """Process data using Blossom AI."""
    
    # Get data from previous task
    data = context['task_instance'].xcom_pull(key='raw_data')
    
    # Process with Blossom AI
    async def process_batch():
        from blossom_ai import BlossomClient, SessionConfig
        
        config = SessionConfig(timeout=60.0)
        results = []
        
        async with BlossomClient(config=config) as client:
            for item in data:
                enhanced = await client.text.generate(
                    f"Enhance this article: {item['text']}"
                )
                results.append({
                    **item,
                    'enhanced_text': enhanced
                })
        
        return results
    
    # Run async function in sync context
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        processed_data = loop.run_until_complete(process_batch())
    finally:
        loop.close()
    
    # Store results
    context['task_instance'].xcom_push(key='processed_data', value=processed_data)
    
    return f"Processed {len(processed_data)} records"

def load_to_database(**context):
    """Load processed data to database."""
    
    data = context['task_instance'].xcom_pull(key='processed_data')
    
    # In production, implement actual database loading
    logger.info(f"Loading {len(data)} records to database")
    
    return f"Loaded {len(data)} records"

# Define tasks
extract_task = PythonOperator(
    task_id='extract_data',
    python_callable=extract_data,
    dag=dag,
)

process_task = PythonOperator(
    task_id='process_with_blossom',
    python_callable=process_with_blossom,
    dag=dag,
)

load_task = PythonOperator(
    task_id='load_to_database',
    python_callable=load_to_database,
    dag=dag,
)

# Define dependencies
extract_task >> process_task >> load_task
```

---

## Summary

Key data pipeline patterns for Blossom AI:

1. **ETL Patterns**: Extract, Transform, Load with AI enhancement
2. **Batch Processing**: Parallel processing of large datasets
3. **Streaming**: Real-time data processing
4. **Multi-stage Pipelines**: Complex processing workflows
5. **Error Handling**: Robust error handling and monitoring
6. **Orchestration**: Integration with workflow tools
7. **Scalability**: Horizontal and vertical scaling
8. **Monitoring**: Comprehensive metrics and logging
9. **Reliability**: Retry logic and fault tolerance
10. **Performance**: Optimized processing patterns

---

## See Also

- [Async Patterns](ASYNC_PATTERNS.md) - Async/await best practices
- [Performance Guide](PERFORMANCE.md) - Performance optimization techniques
- [Connection Pooling](CONNECTION_POOLING.md) - HTTP connection optimization
- [Memory Management](MEMORY.md) - Managing memory in pipelines
- [Celery Integration](CELERY.md) - Distributed task processing