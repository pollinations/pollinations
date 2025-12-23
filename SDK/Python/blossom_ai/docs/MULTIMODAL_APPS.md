# 🎭 Multimodal Applications Guide

> Build powerful applications that combine text, images, and vision AI

---

## 🎯 Overview

Multimodal applications use multiple types of AI generation and analysis:
- **Text + Image**: Generate images from text descriptions
- **Image + Text**: Analyze images and generate text descriptions
- **Conversational Vision**: Chat about images
- **Content Creation**: Create rich media content

---

## 🚀 Getting Started

### Basic Multimodal Flow

```python
from blossom_ai import ai

# 1. Generate an image
image = ai.image.generate("a beautiful landscape")

# 2. Analyze the generated image
analysis = ai.vision.analyze(
    image_bytes=image.bytes,
    prompt="describe this landscape in detail"
)

# 3. Use analysis in further text generation
story = ai.text.generate(
    f"Write a short story about this scene: {analysis.description}"
)

print(f"Image analysis: {analysis.description}")
print(f"Generated story: {story.text}")
```

---

## 🎨 Visual Content Creator

### Instagram Post Generator

```python
from blossom_ai import ai
from PIL import Image, ImageDraw, ImageFont
import textwrap

class InstagramPostGenerator:
    def __init__(self):
        self.template_size = (1080, 1080)
    
    async def create_post(self, topic: str, style: str = "modern"):
        """Create a complete Instagram post."""
        
        # 1. Generate engaging caption
        caption_prompt = f"""
        Write an engaging Instagram caption about {topic}.
        Include relevant hashtags and emojis.
        Make it shareable and inspiring.
        """
        
        caption_response = ai.text.generate(caption_prompt)
        caption = caption_response.text
        
        # 2. Generate image based on topic
        image_prompt = f"""
        Create a visually stunning {style} image about {topic}.
        Perfect for Instagram, vibrant colors, eye-catching composition.
        """
        
        image = ai.image.generate(
            image_prompt,
            width=1024,
            height=1024,
            quality="hd",
            style="vivid"
        )
        
        # 3. Analyze image for alt text
        analysis = ai.vision.analyze(
            image_bytes=image.bytes,
            prompt="create an SEO-friendly alt text description for this image"
        )
        alt_text = analysis.description
        
        return {
            "image": image,
            "caption": caption,
            "alt_text": alt_text,
            "hashtags": self.extract_hashtags(caption),
            "suggested_posting_time": self.get_optimal_posting_time(topic)
        }
    
    def extract_hashtags(self, text: str) -> list:
        """Extract hashtags from caption."""
        import re
        hashtags = re.findall(r'#\w+', text)
        return hashtags[:10]  # Max 10 hashtags
    
    def get_optimal_posting_time(self, topic: str) -> str:
        """Get optimal posting time based on topic."""
        # This could use AI to analyze when posts about this topic perform best
        prompt = f"When is the best time to post about {topic} on Instagram? Give time in HH:MM format."
        response = ai.text.generate(prompt)
        return response.text.strip()

# Usage
generator = InstagramPostGenerator()
post = generator.create_post("sustainable living", "minimalist")

print(f"Caption: {post['caption']}")
print(f"Hashtags: {post['hashtags']}")
print(f"Alt text: {post['alt_text']}")
post['image'].save("instagram_post.png")
```

---

## 🛍️ E-commerce Product Enhancer

### Automatic Product Description Generator

```python
from blossom_ai import ai
from typing import List, Dict

class ProductEnhancer:
    def __init__(self):
        pass
    
    async def enhance_product(
        self,
        product_name: str,
        product_image_path: str,
        category: str
    ) -> Dict[str, any]:
        """Enhance product with AI-generated content."""
        
        # 1. Analyze product image
        with open(product_image_path, 'rb') as f:
            image_bytes = f.read()
        
        analysis = ai.vision.analyze(
            image_bytes=image_bytes,
            prompt="describe this product in detail, including color, material, style, and key features"
        )
        
        # 2. Generate compelling product description
        description_prompt = f"""
        Write a compelling product description for a {category} called "{product_name}".
        
        Product details from image analysis:
        {analysis.description}
        
        Make it persuasive, highlight benefits, and include relevant keywords for SEO.
        """
        
        description = ai.text.generate(description_prompt)
        
        # 3. Generate SEO keywords
        keywords_prompt = f"""
        Generate 10 SEO keywords for this {category} product:
        {product_name}
        
        Product features: {analysis.objects}
        
        Focus on long-tail keywords that customers would search for.
        """
        
        keywords_response = ai.text.generate(keywords_prompt)
        keywords = [kw.strip() for kw in keywords_response.text.split(',')]
        
        # 4. Generate lifestyle image
        lifestyle_prompt = f"""
        Create a lifestyle image showing {product_name} being used in a real home setting.
        Cozy, inviting atmosphere, natural lighting, Instagram-worthy composition.
        """
        
        lifestyle_image = ai.image.generate(
            lifestyle_prompt,
            width=1536,
            height=1024,
            quality="hd"
        )
        
        return {
            "original_analysis": analysis,
            "description": description.text,
            "seo_keywords": keywords,
            "lifestyle_image": lifestyle_image,
            "suggested_price": await self.suggest_price(product_name, analysis),
            "target_audience": await self.identify_audience(analysis)
        }
    
    async def suggest_price(self, product_name: str, analysis) -> str:
        """Suggest price based on product analysis."""
        prompt = f"""
        Based on the product "{product_name}" with these features:
        {analysis.description}
        
        Suggest a competitive price range in USD. Consider:
        - Quality and materials
        - Market positioning
        - Target audience
        
        Return only the price range (e.g., "$50-75").
        """
        
        response = ai.text.generate(prompt)
        return response.text.strip()
    
    async def identify_audience(self, analysis) -> str:
        """Identify target audience."""
        prompt = f"""
        Based on this product analysis:
        {analysis.description}
        
        Identify the target audience. Be specific about:
        - Age range
        - Gender (if applicable)
        - Lifestyle
        - Income level
        - Interests
        """
        
        response = ai.text.generate(prompt)
        return response.text.strip()

# Usage
enhancer = ProductEnhancer()
enhanced = enhancer.enhance_product(
    product_name="Vintage Leather Backpack",
    product_image_path="backpack.jpg",
    category="bags"
)

print(f"Description: {enhanced['description']}")
print(f"Keywords: {enhanced['seo_keywords']}")
print(f"Suggested price: {enhanced['suggested_price']}")
print(f"Target audience: {enhanced['target_audience']}")
enhanced['lifestyle_image'].save("lifestyle_image.png")
```

---

## 📚 Educational Content Creator

### Interactive Learning Module

```python
from blossom_ai import ai
from typing import List

class LearningModuleGenerator:
    def __init__(self):
        pass
    
    async def create_learning_module(
        self,
        topic: str,
        grade_level: str,
        learning_objectives: List[str]
    ) -> dict:
        """Create a complete interactive learning module."""
        
        module = {}
        
        # 1. Generate engaging introduction
        intro_prompt = f"""
        Write an engaging introduction for {grade_level} students about {topic}.
        
        Learning objectives:
        {chr(10).join(f"- {obj}" for obj in learning_objectives)}
        
        Make it exciting and relatable for students. Include a hook that grabs their attention.
        """
        
        introduction = ai.text.generate(intro_prompt)
        module["introduction"] = introduction.text
        
        # 2. Generate concept explanation
        concept_prompt = f"""
        Explain {topic} to {grade_level} students in simple, understandable language.
        
        Break it down into 3-4 key concepts, each with:
        - Clear explanation
        - Real-world example
        - Why it matters
        
        Make it interactive and engaging.
        """
        
        concept_explanation = ai.text.generate(concept_prompt)
        module["concept_explanation"] = concept_explanation.text
        
        # 3. Generate visual aids
        visual_prompt = f"""
        Create an educational diagram about {topic} for {grade_level} students.
            
        Make it colorful, clear, and easy to understand. Include labels and arrows.
        Visual learning style, infographic-like design.
        """
        
        visual_aid = ai.image.generate(
            visual_prompt,
            width=1536,
            height=1024,
            quality="hd",
            style="natural"
        )
        module["visual_aid"] = visual_aid
        
        # 4. Generate practice questions
        questions_prompt = f"""
        Create 5 practice questions about {topic} for {grade_level} students.
        
        Mix different types:
        - 2 multiple choice
        - 2 short answer
        - 1 critical thinking
        
        Include answer key with explanations.
        """
        
        practice_questions = ai.text.generate(questions_prompt)
        module["practice_questions"] = practice_questions.text
        
        # 5. Generate assessment rubric
        rubric_prompt = f"""
        Create a simple assessment rubric for {topic} at {grade_level} level.
        
        Include:
        - Understanding (1-4 points)
        - Application (1-4 points)
        - Critical thinking (1-4 points)
        
        Clear criteria for each level.
        """
        
        rubric = ai.text.generate(rubric_prompt)
        module["assessment_rubric"] = rubric.text
        
        # 6. Generate extension activities
        extension_prompt = f"""
        Create 3 extension activities for students who finish early with {topic}.
        
        Activities should be:
        - Creative
        - Challenging but achievable
        - Related to the topic
        - Fun and engaging
        """
        
        extension_activities = ai.text.generate(extension_prompt)
        module["extension_activities"] = extension_activities.text
        
        return module

# Usage
module_generator = LearningModuleGenerator()
learning_module = module_generator.create_learning_module(
    topic="Photosynthesis",
    grade_level="middle school",
    learning_objectives=[
        "Understand how plants make food",
        "Identify the role of sunlight",
        "Explain the importance of chlorophyll"
    ]
)

print(f"Introduction: {learning_module['introduction']}")
print(f"Practice Questions: {learning_module['practice_questions']}")
learning_module['visual_aid'].save("photosynthesis_diagram.png")
```

---

## 🎮 Game Asset Generator

### Procedural Game Content

```python
from blossom_ai import ai
import json

class GameAssetGenerator:
    def __init__(self):
        pass
    
    async def generate_game_character(
        self,
        character_type: str,
        game_style: str,
        attributes: dict
    ) -> dict:
        """Generate a complete game character with lore and image."""
        
        # 1. Generate character backstory and stats
        character_prompt = f"""
        Create a {character_type} character for a {game_style} video game.
        
        Attributes: {json.dumps(attributes, indent=2)}
        
        Provide:
        - Name
        - Backstory (2-3 paragraphs)
        - Personality traits
        - Special abilities
        - Weaknesses
        - Motivations
        
        Make it compelling and game-appropriate.
        """
        
        character_lore = ai.text.generate(character_prompt)
        
        # 2. Generate character image
        image_prompt = f"""
        Create a {game_style} style character portrait of a {character_type}.
        
        Key features from attributes: {attributes}
        
        Game character design, concept art style, detailed, professional quality.
        """
        
        character_image = ai.image.generate(
            image_prompt,
            width=1024,
            height=1024,
            quality="hd",
            style="vivid"
        )
        
        # 3. Generate character abilities
        abilities_prompt = f"""
        Create game abilities for this {character_type} character:
        
        {character_lore.text}
        
        Provide 4 abilities:
        - 1 basic attack
        - 2 special abilities
        - 1 ultimate ability
        
        For each ability:
        - Name
        - Description
        - Damage/effect
        - Cooldown
        - Mana cost (if applicable)
        """
        
        abilities = ai.text.generate(abilities_prompt)
        
        # 4. Generate character voice lines
        voice_prompt = f"""
        Create 10 character voice lines for a {character_type} in {game_style} style.
        
        Include:
        - 2 greeting lines
        - 2 combat taunts
        - 2 victory lines
        - 2 defeat lines
        - 2 special ability callouts
        
        Match the character personality from the lore.
        """
        
        voice_lines = ai.text.generate(voice_prompt)
        
        return {
            "lore": character_lore.text,
            "image": character_image,
            "abilities": abilities.text,
            "voice_lines": voice_lines.text,
            "character_stats": self.parse_character_stats(character_lore.text)
        }
    
    def parse_character_stats(self, lore_text: str) -> dict:
        """Parse character stats from lore text."""
        # This could use AI to extract structured data
        # For now, return basic structure
        return {
            "health": 100,
            "mana": 50,
            "attack": 10,
            "defense": 5,
            "speed": 7
        }
    
    async def generate_game_environment(
        self,
        environment_type: str,
        mood: str,
        game_style: str
    ) -> dict:
        """Generate a game environment with description and assets."""
        
        # 1. Generate environment description
        env_prompt = f"""
        Create a {environment_type} environment for a {game_style} game.
        
        Mood: {mood}
        
        Provide:
        - Detailed atmospheric description
        - Key landmarks or features
        - Ambient sounds suggestions
        - Lighting conditions
        - Weather/atmosphere
        - Potential hazards or interactive elements
        """
        
        environment_description = ai.text.generate(env_prompt)
        
        # 2. Generate environment background
        bg_prompt = f"""
        Create a {game_style} style background environment of {environment_type}.
        
        Mood: {mood}
        
        Game background, panoramic view, suitable for side-scroller or top-down game.
        Seamless, tileable if possible.
        """
        
        environment_image = ai.image.generate(
            bg_prompt,
            width=1536,
            height=1024,
            quality="hd"
        )
        
        # 3. Generate ambient sound description
        sound_prompt = f"""
        Describe the ambient soundscape for a {environment_type} environment in a {game_style} game.
        
        Mood: {mood}
        
        Include:
        - Background ambient sounds
        - Occasional sound effects
        - Musical mood suggestions
        - How sounds change based on time/weather
        """
        
        soundscape = ai.text.generate(sound_prompt)
        
        return {
            "description": environment_description.text,
            "background_image": environment_image,
            "soundscape": soundscape.text,
            "interactive_elements": await self.generate_interactive_elements(environment_type, mood)
        }
    
    async def generate_interactive_elements(self, env_type: str, mood: str) -> str:
        """Generate interactive elements for the environment."""
        prompt = f"""
        List interactive elements for a {env_type} environment with {mood} mood.
        
        Include 5-7 elements like:
        - Collectible items
        - Obstacles
        - NPCs
        - Hidden areas
        - Interactive objects
        
        Brief description for each.
        """
        
        response = ai.text.generate(prompt)
        return response.text

# Usage
game_generator = GameAssetGenerator()

# Generate a character
character = game_generator.generate_game_character(
    character_type="mystical forest guardian",
    game_style="fantasy RPG",
    attributes={
        "magic_power": "high",
        "wisdom": "ancient",
        "connection_to_nature": "deep"
    }
)

print(f"Character Lore: {character['lore']}")
character['image'].save("forest_guardian.png")

# Generate an environment
environment = game_generator.generate_game_environment(
    environment_type="enchanted forest",
    mood="mysterious",
    game_style="fantasy RPG"
)

environment['background_image'].save("enchanted_forest_bg.png")
```

---

## 🏗️ Best Practices for Multimodal Apps

### 1. Chain Operations Efficiently

```python
# Good: Chain operations logically
async def create_content_package(topic):
    # Generate text first
    text_content = await ai.text.generate(f"Write about {topic}")
    
    # Use text to inform image generation
    image = await ai.image.generate(
        f"Create image illustrating: {text_content.text[:200]}"
    )
    
    # Analyze the generated image
    analysis = await ai.vision.analyze(image_bytes=image.bytes)
    
    return text_content, image, analysis

# Bad: Unrelated operations
async def inefficient_content(topic):
    # These operations don't build on each other
    text_task = ai.text.generate(f"Write about {topic}")
    image_task = ai.image.generate("Random abstract art")
    analysis_task = ai.vision.analyze(image_url="https://example.com/unrelated.jpg")
    
    return await asyncio.gather(text_task, image_task, analysis_task)
```

### 2. Cache Multimodal Results

```python
from blossom_ai.utils.cache import CacheManager, CacheConfig

# Cache configuration for multimodal results
config = CacheConfig(
    backend="redis",
    ttl=7200  # 2 hours - longer for complex multimodal results
)
cache = CacheManager(config)

async def cached_multimodal_content(topic: str):
    cache_key = f"multimodal:{hash(topic)}"
    
    # Check cache
    cached = cache.get(cache_key)
    if cached:
        return cached
    
    # Generate new content
    result = await create_content_package(topic)
    
    # Cache the result (serialize as needed)
    cache.set(cache_key, {
        "text": result[0].text,
        "image_metadata": "metadata",  # Don't cache full image bytes
        "analysis": result[2].description
    })
    
    return result
```

### 3. Handle Errors Gracefully

```python
async def robust_multimodal_flow(topic: str):
    result = {}
    
    try:
        # Text generation
        result["text"] = await ai.text.generate(f"Write about {topic}")
    except Exception as e:
        result["text"] = f"Error generating text: {e}"
        result["text_success"] = False
    else:
        result["text_success"] = True
    
    try:
        # Image generation (only if text succeeded)
        if result.get("text_success"):
            result["image"] = await ai.image.generate(
                f"Illustrate: {result['text'].text[:100]}"
            )
    except Exception as e:
        result["image"] = None
        result["image_success"] = False
    else:
        result["image_success"] = True
    
    try:
        # Analysis (only if image succeeded)
        if result.get("image_success") and result.get("image"):
            result["analysis"] = await ai.vision.analyze(
                image_bytes=result["image"].bytes
            )
    except Exception as e:
        result["analysis"] = None
        result["analysis_success"] = False
    else:
        result["analysis_success"] = True
    
    return result
```

---

## 📚 Related Documentation

- [🎨 Image Generation](IMAGE_GENERATION.md)
- [💬 Text Generation](TEXT_GENERATION.md)
- [👁️ Vision Analysis](VISION.md)
- [💾 Caching System](CACHING.md)
- [⚙️ Configuration System](CONFIGURATION.md)

---

## 🎓 Tips for Multimodal Applications

1. **Plan the flow**: Design how different AI capabilities will work together
2. **Build incrementally**: Start with one modality, then add others
3. **Cache strategically**: Multimodal results can be expensive to generate
4. **Monitor performance**: Track response times for each modality
5. **Handle failures**: Each step can fail independently
6. **Consider costs**: Image generation is typically more expensive than text
7. **Think about UX**: How will users interact with multimodal content?
8. **Test thoroughly**: Each combination of modalities needs testing
