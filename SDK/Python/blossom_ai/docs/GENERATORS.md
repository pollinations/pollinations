# ⚙️ Generators Guide

> **Understand and extend Blossom AI's generator system for content creation**

---

## 📋 Table of Contents

- [Generator Architecture](#generator-architecture)
- [Base Generator Classes](#base-generator-classes)
- [Image Generators](#image-generators)
- [Text Generators](#text-generators)
- [Custom Generators](#custom-generators)
- [Generator Composition](#generator-composition)

---

## 🏗️ Generator Architecture

### Generator Hierarchy

```python
from blossom_ai.core.protocols import GeneratorProtocol
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

# Base generator protocol
class GeneratorProtocol(Protocol):
    """Core generator interface"""
    
    async def generate(self, prompt: str, **kwargs) -> bytes:
        """Generate content from prompt"""
        ...
    
    def supports(self, prompt_type: str) -> bool:
        """Check if generator supports prompt type"""
        ...

# Abstract base generator
class BaseGenerator(ABC):
    """Abstract base class for all generators"""
    
    def __init__(
        self,
        model_id: str,
        api_client: Any,
        cache: Optional[Any] = None,
        logger: Optional[Any] = None
    ):
        self.model_id = model_id
        self.api_client = api_client
        self.cache = cache
        self.logger = logger
        self._setup()
    
    def _setup(self):
        """Setup generator"""
        pass
    
    @abstractmethod
    async def generate(self, prompt: str, **kwargs) -> bytes:
        """Generate content"""
        pass
    
    def supports(self, prompt_type: str) -> bool:
        """Check supported prompt types"""
        return prompt_type in self.get_supported_types()
    
    @abstractmethod
    def get_supported_types(self) -> list:
        """Get list of supported prompt types"""
        pass
    
    def _log_generation(self, prompt: str, **kwargs):
        """Log generation request"""
        if self.logger:
            self.logger.debug(
                f"Generation request: {prompt[:50]}...",
                extra={"model": self.model_id, **kwargs}
            )
```

### Generator Factory

```python
from typing import Dict, Type, Optional

class GeneratorFactory:
    """Factory for creating and managing generators"""
    
    def __init__(self):
        self._generators: Dict[str, BaseGenerator] = {}
        self._generator_classes: Dict[str, Type[BaseGenerator]] = {}
    
    def register_generator(
        self,
        name: str,
        generator_class: Type[BaseGenerator],
        default_config: Optional[Dict] = None
    ):
        """Register a generator class"""
        self._generator_classes[name] = generator_class
        
        # Create default instance if config provided
        if default_config:
            generator = self.create_generator(name, default_config)
            self._generators[name] = generator
    
    def create_generator(
        self,
        name: str,
        config: Dict,
        dependencies: Optional[Dict] = None
    ) -> BaseGenerator:
        """Create generator instance"""
        
        if name not in self._generator_classes:
            raise ValueError(f"Unknown generator: {name}")
        
        generator_class = self._generator_classes[name]
        
        # Merge dependencies
        all_deps = {**config, **(dependencies or {})}
        
        return generator_class(**all_deps)
    
    def get_generator(self, name: str) -> BaseGenerator:
        """Get existing generator instance"""
        return self._generators[name]
    
    def list_generators(self) -> list:
        """List available generator types"""
        return list(self._generator_classes.keys())

# Global factory instance
generator_factory = GeneratorFactory()
```

---

## 🎨 Image Generators

### Base Image Generator

```python
from blossom_ai.generators.base import BaseGenerator
from typing import Dict, Any, Optional, Tuple
from PIL import Image
import io

class ImageGenerator(BaseGenerator):
    """Base class for image generators"""
    
    def __init__(
        self,
        model_id: str,
        api_client: Any,
        cache: Optional[Any] = None,
        logger: Optional[Any] = None,
        default_size: Tuple[int, int] = (1024, 1024),
        default_quality: str = "standard"
    ):
        super().__init__(model_id, api_client, cache, logger)
        self.default_size = default_size
        self.default_quality = default_quality
    
    async def generate(
        self,
        prompt: str,
        width: int = None,
        height: int = None,
        quality: str = None,
        negative_prompt: str = None,
        guidance_scale: float = 7.5,
        seed: int = None,
        **kwargs
    ) -> Image.Image:
        """Generate image from prompt"""
        
        # Use defaults if not specified
        width = width or self.default_size[0]
        height = height or self.default_size[1]
        quality = quality or self.default_quality
        
        # Check cache first
        cache_key = self._create_cache_key(
            prompt, width, height, quality, negative_prompt, guidance_scale, seed
        )
        
        if self.cache:
            cached = await self.cache.get(cache_key)
            if cached:
                return Image.open(io.BytesIO(cached))
        
        # Generate new image
        self._log_generation(prompt, width=width, height=height, quality=quality)
        
        image_data = await self._generate_image(
            prompt=prompt,
            width=width,
            height=height,
            quality=quality,
            negative_prompt=negative_prompt,
            guidance_scale=guidance_scale,
            seed=seed,
            **kwargs
        )
        
        # Cache result
        if self.cache:
            await self.cache.set(cache_key, image_data, ttl=3600)
        
        return Image.open(io.BytesIO(image_data))
    
    @abstractmethod
    async def _generate_image(self, **kwargs) -> bytes:
        """Internal image generation implementation"""
        pass
    
    def _create_cache_key(self, *args) -> str:
        """Create cache key from arguments"""
        import hashlib
        key_data = "|".join(str(arg) for arg in args if arg is not None)
        return f"img_{hashlib.md5(key_data.encode()).hexdigest()}"
    
    def get_supported_types(self) -> list:
        return ["image", "photo", "art", "sketch"]
    
    def supports_style(self, style: str) -> bool:
        """Check if generator supports specific style"""
        supported_styles = [
            "photographic", "digital_art", "oil_painting",
            "watercolor", "sketch", "anime", "realistic"
        ]
        return style in supported_styles
```

### DALL-E Generator

```python
class DalleGenerator(ImageGenerator):
    """DALL-E image generator"""
    
    def __init__(self, api_key: str, **kwargs):
        self.api_key = api_key
        super().__init__(
            model_id="dall-e-3",
            api_client=self._create_api_client(),
            **kwargs
        )
    
    def _create_api_client(self):
        """Create OpenAI API client"""
        import openai
        return openai.AsyncOpenAI(api_key=self.api_key)
    
    async def _generate_image(self, **kwargs) -> bytes:
        """Generate image using DALL-E"""
        
        response = await self.api_client.images.generate(
            model=self.model_id,
            prompt=kwargs['prompt'],
            size=f"{kwargs['width']}x{kwargs['height']}",
            quality=kwargs['quality'],
            response_format="b64_json",
            n=1
        )
        
        import base64
        image_data = response.data[0].b64_json
        return base64.b64decode(image_data)
    
    def get_supported_types(self) -> list:
        return ["image", "art", "photo", "digital_art", "realistic"]
```

### Stable Diffusion Generator

```python
class StableDiffusionGenerator(ImageGenerator):
    """Stable Diffusion image generator"""
    
    def __init__(self, api_url: str, api_key: str = None, **kwargs):
        self.api_url = api_url
        self.api_key = api_key
        super().__init__(
            model_id="stable-diffusion-xl",
            api_client=self._create_api_client(),
            **kwargs
        )
    
    def _create_api_client(self):
        """Create Stability AI API client"""
        import httpx
        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        return httpx.AsyncClient(
            base_url=self.api_url,
            headers=headers
        )
    
    async def _generate_image(self, **kwargs) -> bytes:
        """Generate image using Stable Diffusion"""
        
        payload = {
            "prompt": kwargs['prompt'],
            "negative_prompt": kwargs.get('negative_prompt', ""),
            "width": kwargs['width'],
            "height": kwargs['height'],
            "guidance_scale": kwargs.get('guidance_scale', 7.5),
            "seed": kwargs.get('seed'),
            "steps": 30,
            "sampler": "DPM++ 2M Karras"
        }
        
        response = await self.api_client.post(
            "/v1/generation/stable-diffusion-xl-1024/text-to-image",
            json=payload
        )
        
        result = response.json()
        import base64
        return base64.b64decode(result["artifacts"][0]["base64"])
    
    def get_supported_types(self) -> list:
        return ["image", "art", "digital_art", "anime", "photographic"]
```

---

## 💬 Text Generators

### Base Text Generator

```python
from typing import Dict, Any, Optional, List, AsyncIterator

class TextGenerator(BaseGenerator):
    """Base class for text generators"""
    
    def __init__(
        self,
        model_id: str,
        api_client: Any,
        cache: Optional[Any] = None,
        logger: Optional[Any] = None,
        default_max_tokens: int = 1000,
        default_temperature: float = 0.7
    ):
        super().__init__(model_id, api_client, cache, logger)
        self.default_max_tokens = default_max_tokens
        self.default_temperature = default_temperature
    
    async def generate(
        self,
        prompt: str,
        max_tokens: int = None,
        temperature: float = None,
        system_prompt: str = None,
        **kwargs
    ) -> str:
        """Generate text from prompt"""
        
        # Use defaults
        max_tokens = max_tokens or self.default_max_tokens
        temperature = temperature or self.default_temperature
        
        # Check cache
        cache_key = self._create_cache_key(prompt, max_tokens, temperature, system_prompt)
        
        if self.cache:
            cached = await self.cache.get(cache_key)
            if cached:
                return cached.decode()
        
        # Generate
        self._log_generation(
            prompt, 
            max_tokens=max_tokens, 
            temperature=temperature
        )
        
        result = await self._generate_text(
            prompt=prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            system_prompt=system_prompt,
            **kwargs
        )
        
        # Cache result
        if self.cache:
            await self.cache.set(cache_key, result.encode(), ttl=1800)
        
        return result
    
    async def generate_stream(
        self,
        prompt: str,
        max_tokens: int = None,
        temperature: float = None,
        system_prompt: str = None,
        **kwargs
    ) -> AsyncIterator[str]:
        """Generate text as stream"""
        
        # Stream generation implementation
        async for chunk in self._generate_text_stream(
            prompt=prompt,
            max_tokens=max_tokens or self.default_max_tokens,
            temperature=temperature or self.default_temperature,
            system_prompt=system_prompt,
            **kwargs
        ):
            yield chunk
    
    @abstractmethod
    async def _generate_text(self, **kwargs) -> str:
        """Internal text generation implementation"""
        pass
    
    async def _generate_text_stream(self, **kwargs) -> AsyncIterator[str]:
        """Internal streaming text generation"""
        # Default implementation falls back to regular generation
        result = await self._generate_text(**kwargs)
        yield result
    
    def get_supported_types(self) -> list:
        return ["text", "completion", "chat", "analysis"]
```

### GPT Generator

```python
class GPTGenerator(TextGenerator):
    """OpenAI GPT text generator"""
    
    def __init__(self, api_key: str, model: str = "gpt-4", **kwargs):
        self.api_key = api_key
        self.model_name = model
        super().__init__(
            model_id=model,
            api_client=self._create_api_client(),
            **kwargs
        )
    
    def _create_api_client(self):
        """Create OpenAI API client"""
        import openai
        return openai.AsyncOpenAI(api_key=self.api_key)
    
    async def _generate_text(self, **kwargs) -> str:
        """Generate text using GPT"""
        
        messages = []
        
        if kwargs.get('system_prompt'):
            messages.append({
                "role": "system",
                "content": kwargs['system_prompt']
            })
        
        messages.append({
            "role": "user",
            "content": kwargs['prompt']
        })
        
        response = await self.api_client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            max_tokens=kwargs['max_tokens'],
            temperature=kwargs['temperature']
        )
        
        return response.choices[0].message.content
    
    async def _generate_text_stream(self, **kwargs) -> AsyncIterator[str]:
        """Stream text generation"""
        
        messages = []
        
        if kwargs.get('system_prompt'):
            messages.append({
                "role": "system",
                "content": kwargs['system_prompt']
            })
        
        messages.append({
            "role": "user",
            "content": kwargs['prompt']
        })
        
        stream = await self.api_client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            max_tokens=kwargs['max_tokens'],
            temperature=kwargs['temperature'],
            stream=True
        )
        
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    
    def get_supported_types(self) -> list:
        return ["text", "completion", "chat", "analysis", "summarization", "translation"]
```

### Claude Generator

```python
class ClaudeGenerator(TextGenerator):
    """Anthropic Claude text generator"""
    
    def __init__(self, api_key: str, model: str = "claude-3-sonnet", **kwargs):
        self.api_key = api_key
        self.model_name = model
        super().__init__(
            model_id=model,
            api_client=self._create_api_client(),
            **kwargs
        )
    
    def _create_api_client(self):
        """Create Anthropic API client"""
        import anthropic
        return anthropic.AsyncAnthropic(api_key=self.api_key)
    
    async def _generate_text(self, **kwargs) -> str:
        """Generate text using Claude"""
        
        system_prompt = kwargs.get('system_prompt', '')
        user_prompt = kwargs['prompt']
        
        message = await self.api_client.messages.create(
            model=self.model_name,
            max_tokens=kwargs['max_tokens'],
            temperature=kwargs['temperature'],
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )
        
        return message.content[0].text
    
    async def _generate_text_stream(self, **kwargs) -> AsyncIterator[str]:
        """Stream text generation"""
        
        system_prompt = kwargs.get('system_prompt', '')
        user_prompt = kwargs['prompt']
        
        async with self.api_client.messages.stream(
            model=self.model_name,
            max_tokens=kwargs['max_tokens'],
            temperature=kwargs['temperature'],
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        ) as stream:
            async for text in stream.text_stream:
                yield text
    
    def get_supported_types(self) -> list:
        return ["text", "completion", "chat", "analysis", "reasoning"]
```

---

## 🔧 Custom Generators

### Creating Custom Generator

```python
class CustomImageGenerator(ImageGenerator):
    """Custom image generator example"""
    
    def __init__(self, custom_api_url: str, api_key: str = None, **kwargs):
        self.custom_api_url = custom_api_url
        self.api_key = api_key
        super().__init__(
            model_id="custom-model",
            api_client=self._create_api_client(),
            **kwargs
        )
    
    def _create_api_client(self):
        """Create custom API client"""
        import httpx
        headers = {"User-Agent": "BlossomAI-Client"}
        
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        return httpx.AsyncClient(
            base_url=self.custom_api_url,
            headers=headers,
            timeout=60.0
        )
    
    async def _generate_image(self, **kwargs) -> bytes:
        """Custom image generation logic"""
        
        # Prepare request payload
        payload = {
            "prompt": kwargs['prompt'],
            "width": kwargs['width'],
            "height": kwargs['height'],
            "parameters": {
                "guidance": kwargs.get('guidance_scale', 7.5),
                "seed": kwargs.get('seed'),
                "negative_prompt": kwargs.get('negative_prompt', "")
            }
        }
        
        # Make API request
        response = await self.api_client.post(
            "/api/generate",
            json=payload
        )
        
        # Handle response
        result = response.json()
        
        if result.get("status") != "success":
            raise Exception(f"Generation failed: {result.get('error', 'Unknown error')}")
        
        # Extract image data
        import base64
        return base64.b64decode(result["image"])
    
    def get_supported_types(self) -> list:
        return ["image", "art", "custom_style"]
    
    def supports_custom_style(self, style: str) -> bool:
        """Check support for custom styles"""
        supported_styles = [
            "watercolor", "oil_painting", "digital_art",
            "sketch", "photorealistic", "fantasy"
        ]
        return style in supported_styles

# Register custom generator
generator_factory.register_generator(
    name="custom_image",
    generator_class=CustomImageGenerator,
    default_config={
        "custom_api_url": "https://api.custom-ai.com",
        "api_key": None
    }
)
```

### Multi-Model Generator

```python
class MultiModelGenerator(BaseGenerator):
    """Generator that can use multiple models"""
    
    def __init__(self, models: Dict[str, BaseGenerator], default_model: str = None):
        self.models = models
        self.default_model = default_model or list(models.keys())[0]
        
        # Use first model as primary for protocol compliance
        first_model = list(models.values())[0]
        super().__init__(
            model_id="multi-model",
            api_client=first_model.api_client,
            cache=first_model.cache,
            logger=first_model.logger
        )
    
    def get_model(self, model_name: str = None) -> BaseGenerator:
        """Get specific model by name"""
        model_name = model_name or self.default_model
        
        if model_name not in self.models:
            raise ValueError(f"Unknown model: {model_name}")
        
        return self.models[model_name]
    
    async def generate(self, prompt: str, model: str = None, **kwargs) -> bytes:
        """Generate using specified model"""
        
        selected_model = self.get_model(model)
        return await selected_model.generate(prompt, **kwargs)
    
    def supports(self, prompt_type: str) -> bool:
        """Check if any model supports the type"""
        return any(model.supports(prompt_type) for model in self.models.values())
    
    def get_supported_types(self) -> list:
        """Get all supported types from all models"""
        all_types = set()
        for model in self.models.values():
            all_types.update(model.get_supported_types())
        return list(all_types)
    
    async def generate_ensemble(
        self,
        prompt: str,
        models: list = None,
        strategy: str = "best_of_n"
    ) -> bytes:
        """Generate using multiple models and combine results"""
        
        models = models or list(self.models.keys())
        results = []
        
        # Generate with each model
        for model_name in models:
            model = self.get_model(model_name)
            try:
                result = await model.generate(prompt)
                results.append({"model": model_name, "result": result})
            except Exception as e:
                self.logger.error(f"Model {model_name} failed: {e}")
        
        if not results:
            raise Exception("All models failed")
        
        # Apply ensemble strategy
        if strategy == "best_of_n":
            # Return first successful result
            return results[0]["result"]
        elif strategy == "vote":
            # Implement voting mechanism
            return await self._vote_results(results)
        else:
            raise ValueError(f"Unknown ensemble strategy: {strategy}")
    
    async def _vote_results(self, results: list) -> bytes:
        """Implement voting mechanism for ensemble"""
        # Simplified voting - return most common result
        # In practice, you'd implement quality scoring
        return results[0]["result"]
```

---

## 🔄 Generator Composition

### Generator Pipeline

```python
class GeneratorPipeline:
    """Pipeline for chaining multiple generators"""
    
    def __init__(self, generators: list):
        self.generators = generators
    
    async def process(self, initial_prompt: str, **kwargs) -> Any:
        """Process prompt through generator pipeline"""
        
        result = initial_prompt
        
        for i, generator in enumerate(self.generators):
            self.logger.info(f"Pipeline step {i+1}: {generator.__class__.__name__}")
            
            if isinstance(generator, BaseGenerator):
                result = await generator.generate(result, **kwargs)
            else:
                # Custom processor
                result = await generator.process(result, **kwargs)
        
        return result

# Example: Text enhancement pipeline
class TextEnhancer:
    """Enhance text before generation"""
    
    def __init__(self, enhancement_rules: list):
        self.rules = enhancement_rules
    
    async def process(self, text: str, **kwargs) -> str:
        enhanced = text
        
        for rule in self.rules:
            enhanced = rule(enhanced)
        
        return enhanced

# Create pipeline
text_enhancer = TextEnhancer([
    lambda x: x.strip(),
    lambda x: x.capitalize(),
    lambda x: x + " in high quality, detailed"
])

image_generator = DalleGenerator(api_key="sk-...")

pipeline = GeneratorPipeline([
    text_enhancer,
    image_generator
])

# Use pipeline
result = await pipeline.process("a cat")
# Enhancer: "a cat" -> "A cat in high quality, detailed"
# Generator: Creates image from enhanced prompt
```

### Conditional Generator

```python
class ConditionalGenerator(BaseGenerator):
    """Generator that chooses implementation based on conditions"""
    
    def __init__(self, generators: Dict[str, BaseGenerator], conditions: Dict[str, Callable]):
        self.generators = generators
        self.conditions = conditions
        
        # Use first generator as default
        first_generator = list(generators.values())[0]
        super().__init__(
            model_id="conditional",
            api_client=first_generator.api_client,
            cache=first_generator.cache,
            logger=first_generator.logger
        )
    
    def select_generator(self, prompt: str, **kwargs) -> BaseGenerator:
        """Select appropriate generator based on conditions"""
        
        for condition_name, condition_func in self.conditions.items():
            if condition_func(prompt, **kwargs):
                return self.generators[condition_name]
        
        # Return default/first generator
        return list(self.generators.values())[0]
    
    async def generate(self, prompt: str, **kwargs) -> bytes:
        """Generate using conditionally selected generator"""
        
        generator = self.select_generator(prompt, **kwargs)
        return await generator.generate(prompt, **kwargs)
    
    def supports(self, prompt_type: str) -> bool:
        return any(gen.supports(prompt_type) for gen in self.generators.values())
    
    def get_supported_types(self) -> list:
        all_types = set()
        for gen in self.generators.values():
            all_types.update(gen.get_supported_types())
        return list(all_types)

# Usage
conditional_gen = ConditionalGenerator(
    generators={
        "photographic": DalleGenerator(api_key="sk-..."),
        "artistic": StableDiffusionGenerator(api_url="https://api.stability.ai")
    },
    conditions={
        "photographic": lambda prompt, **kwargs: "photo" in prompt.lower() or "realistic" in prompt.lower(),
        "artistic": lambda prompt, **kwargs: "art" in prompt.lower() or "painting" in prompt.lower()
    }
)

# Generator will choose based on prompt
photo_result = await conditional_gen.generate("a photo of a mountain")
art_result = await conditional_gen.generate("an oil painting of a sunset")
```

---

## 📚 Further Reading

- [Architecture Overview](ARCHITECTURE.md)
- [Dependency Injection](DEPENDENCY_INJECTION.md)
- [Protocol Interfaces](PROTOCOL_INTERFACES.md)
- [Image Generation](IMAGE_GENERATION.md)
- [Text Generation](TEXT_GENERATION.md)
- [Client Guide](CLIENT.md)