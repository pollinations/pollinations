# 🤖 Discord Bot Example

> Complete example of a Discord bot with image generation using Blossom AI

---

## 🚀 Overview

This example shows how to create a Discord bot that can:
- 🎨 Generate images from text prompts
- 💬 Generate text responses
- 👁️ Analyze uploaded images
- 🔄 Handle multiple users concurrently

### Features

- ✅ Thread-safe operations
- ✅ Rate limiting per user
- ✅ Error handling
- ✅ Caching for efficiency
- ✅ Slash commands

---

## 📋 Prerequisites

### Install Required Packages

```bash
pip install eclips-blossom-ai discord.py python-dotenv
```

### Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section
4. Copy the bot token
5. Enable necessary intents (Message Content, Server Members)

---

## 🔧 Setup

### Project Structure

```
discord_bot/
├── bot.py
├── .env
├── requirements.txt
└── README.md
```

### Environment Variables (.env)

```env
# Discord Bot Token
DISCORD_TOKEN=your_discord_bot_token_here

# Blossom AI API Key (optional for free tier)
BLOSSOM_API_KEY=your_blossom_api_key_here

# Configuration
BLOSSOM_CACHE_ENABLED=true
BLOSSOM_RATE_LIMIT_PER_MINUTE=30
```

### requirements.txt

```txt
eclips-blossom-ai>=0.7.0
discord.py>=2.3.0
python-dotenv>=1.0.0
```

---

## 🤖 Bot Implementation

### Complete Bot Code (bot.py)

```python
import os
import asyncio
import discord
from discord.ext import commands
from dotenv import load_dotenv
from blossom_ai import (
    BlossomClient,
    SessionConfig,
    ValidationError,
    RateLimitError,
    AuthenticationError,
    NetworkError
)
from blossom_ai.utils.cache import CacheManager, CacheConfig

# Load environment variables
load_dotenv()

# Discord bot configuration
intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True

class BlossomDiscordBot(commands.Bot):
    def __init__(self):
        super().__init__(
            command_prefix='!',
            intents=intents,
            description='Blossom AI Discord Bot - Generate images and text with AI'
        )
        
        # Initialize Blossom AI client
        self.blossom_config = SessionConfig(
            api_key=os.getenv("BLOSSOM_API_KEY", ""),
            cache_enabled=os.getenv("BLOSSOM_CACHE_ENABLED", "true").lower() == "true",
            rate_limit_per_minute=int(os.getenv("BLOSSOM_RATE_LIMIT_PER_MINUTE", "30"))
        )
        
        # Per-user rate limiting cache
        self.user_rate_limits = {}
        
    async def setup_hook(self):
        """Called when the bot is starting up."""
        print(f'{self.user} has connected to Discord!')
        
        # Sync slash commands
        try:
            synced = await self.tree.sync()
            print(f"Synced {len(synced)} command(s)")
        except Exception as e:
            print(f"Failed to sync commands: {e}")

    async def close(self):
        """Clean shutdown."""
        await super().close()

# Initialize bot
bot = BlossomDiscordBot()

@bot.event
async def on_ready():
    """Called when bot is ready."""
    print(f'{bot.user} is ready and connected!')
    await bot.change_presence(
        activity=discord.Activity(
            type=discord.ActivityType.watching,
            name="for /generate and /chat commands"
        )
    )

@bot.event
async def on_command_error(ctx, error):
    """Handle command errors."""
    if isinstance(error, commands.CommandNotFound):
        await ctx.send("❓ Unknown command. Try `/generate` or `/chat`")
    elif isinstance(error, commands.MissingRequiredArgument):
        await ctx.send(f"❗ Missing required argument: {error.param}")
    else:
        await ctx.send(f"❌ An error occurred: {str(error)[:100]}")
        print(f"Error: {error}")

# Slash Command: Generate Image
@bot.tree.command(
    name="generate",
    description="Generate an image from text description"
)
@discord.app_commands.describe(
    prompt="Description of the image to generate",
    size="Image size (square, landscape, portrait)",
    quality="Image quality (standard or HD)",
    style="Image style (vivid or natural)"
)
async def generate_image(
    interaction: discord.Interaction,
    prompt: str,
    size: str = "square",
    quality: str = "standard",
    style: str = "vivid"
):
    """Generate an image from text description."""
    await interaction.response.defer()  # Defer response to avoid timeout
    
    try:
        # Map size options to dimensions
        size_map = {
            "square": (1024, 1024),
            "landscape": (1536, 1024),
            "portrait": (1024, 1536)
        }
        
        width, height = size_map.get(size, (1024, 1024))
        
        # Generate image
        async with BlossomClient(config=bot.blossom_config) as client:
            image = await client.image.generate(
                prompt=prompt,
                width=width,
                height=height,
                quality=quality,
                style=style,
                model="dall-e-3"
            )
            
            # Save image to temporary file
            temp_file = f"/tmp/generated_{interaction.id}.png"
            image.save(temp_file)
            
            # Create embed
            embed = discord.Embed(
                title="🎨 Generated Image",
                description=f"**Prompt:** {prompt}",
                color=discord.Color.purple()
            )
            embed.set_image(url=f"attachment://generated.png")
            embed.add_field(name="Size", value=f"{width}x{height}", inline=True)
            embed.add_field(name="Quality", value=quality, inline=True)
            embed.add_field(name="Style", value=style, inline=True)
            
            # Send image
            file = discord.File(temp_file, filename="generated.png")
            await interaction.followup.send(embed=embed, file=file)
            
            # Clean up
            os.remove(temp_file)
            
    except ValidationError as e:
        await interaction.followup.send(f"❌ Invalid parameters: {e}")
    except RateLimitError:
        await interaction.followup.send(
            "⏰ Rate limit exceeded. Please wait a moment and try again."
        )
    except AuthenticationError:
        await interaction.followup.send(
            "🔑 Authentication failed. Please contact the bot administrator."
        )
    except NetworkError:
        await interaction.followup.send(
            "🌐 Network error. Please try again later."
        )
    except Exception as e:
        await interaction.followup.send(f"❌ Error generating image: {str(e)[:100]}")
        print(f"Image generation error: {e}")

# Slash Command: Chat with AI
@bot.tree.command(
    name="chat",
    description="Chat with AI assistant"
)
@discord.app_commands.describe(
    message="Your message to the AI",
    model="AI model to use",
    personality="AI personality"
)
async def chat_with_ai(
    interaction: discord.Interaction,
    message: str,
    model: str = "gpt-4",
    personality: str = "helpful"
):
    """Chat with AI assistant."""
    await interaction.response.defer()
    
    try:
        # Set personality
        personalities = {
            "helpful": "You are a helpful assistant. Answer concisely.",
            "creative": "You are a creative writer. Be imaginative and engaging.",
            "professional": "You are a professional consultant. Be formal and detailed.",
            "friendly": "You are a friendly companion. Be warm and conversational."
        }
        
        system_prompt = personalities.get(personality, personalities["helpful"])
        
        # Create messages
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message}
        ]
        
        # Generate response
        async with BlossomClient(config=bot.blossom_config) as client:
            response = await client.text.chat(
                messages=messages,
                model=model,
                max_tokens=1000,
                temperature=0.7
            )
            
            # Split long responses
            text = response.text
            if len(text) > 2000:
                # Discord message limit is 2000 characters
                parts = [text[i:i+1900] for i in range(0, len(text), 1900)]
                
                await interaction.followup.send(f"**AI Response (Part 1):**\n{parts[0]}")
                for i, part in enumerate(parts[1:], 2):
                    await interaction.channel.send(f"**Part {i}:**\n{part}")
            else:
                embed = discord.Embed(
                    title="💬 AI Chat",
                    description=response.text,
                    color=discord.Color.blue()
                )
                embed.set_footer(
                    text=f"Model: {model} | Personality: {personality} | "
                         f"Tokens: {response.total_tokens}"
                )
                await interaction.followup.send(embed=embed)
                
    except RateLimitError:
        await interaction.followup.send(
            "⏰ Rate limit exceeded. Please wait and try again."
        )
    except NetworkError:
        await interaction.followup.send(
            "🌐 Network error. Please try again later."
        )
    except Exception as e:
        await interaction.followup.send(f"❌ Error: {str(e)[:100]}")
        print(f"Chat error: {e}")

# Slash Command: Analyze Image
@bot.tree.command(
    name="analyze",
    description="Analyze an uploaded image"
)
@discord.app_commands.describe(
    attachment="Image to analyze",
    prompt="What to look for in the image"
)
async def analyze_image(
    interaction: discord.Interaction,
    attachment: discord.Attachment,
    prompt: str = "describe this image"
):
    """Analyze an uploaded image."""
    await interaction.response.defer()
    
    try:
        # Check if attachment is an image
        if not attachment.content_type or not attachment.content_type.startswith('image/'):
            await interaction.followup.send("❌ Please upload a valid image file.")
            return
        
        # Download image
        image_bytes = await attachment.read()
        
        # Analyze image
        async with BlossomClient(config=bot.blossom_config) as client:
            analysis = await client.vision.analyze(
                image_bytes=image_bytes,
                prompt=prompt,
                detail="high",
                max_tokens=500
            )
            
            # Create embed
            embed = discord.Embed(
                title="👁️ Image Analysis",
                description=f"**Analysis:** {analysis.description}",
                color=discord.Color.green()
            )
            embed.set_thumbnail(url=attachment.url)
            
            # Add analysis details
            if analysis.objects:
                objects_str = ", ".join(analysis.objects[:10])
                if len(analysis.objects) > 10:
                    objects_str += f" and {len(analysis.objects) - 10} more"
                embed.add_field(name="Objects", value=objects_str, inline=False)
            
            if analysis.colors:
                colors_str = ", ".join(analysis.colors[:5])
                embed.add_field(name="Colors", value=colors_str, inline=True)
            
            await interaction.followup.send(embed=embed)
            
    except ValidationError as e:
        await interaction.followup.send(f"❌ Invalid image: {e}")
    except NetworkError:
        await interaction.followup.send("🌐 Network error. Please try again.")
    except Exception as e:
        await interaction.followup.send(f"❌ Error analyzing image: {str(e)[:100]}")
        print(f"Image analysis error: {e}")

# Help Command
@bot.tree.command(
    name="help",
    description="Show bot help and commands"
)
async def show_help(interaction: discord.Interaction):
    """Show help information."""
    embed = discord.Embed(
        title="🌸 Blossom AI Bot Help",
        description="AI-powered image and text generation bot",
        color=discord.Color.purple()
    )
    
    embed.add_field(
        name="/generate",
        value="Generate images from text descriptions",
        inline=False
    )
    embed.add_field(
        name="/chat",
        value="Chat with AI assistant",
        inline=False
    )
    embed.add_field(
        name="/analyze",
        value="Analyze uploaded images",
        inline=False
    )
    embed.add_field(
        name="/help",
        value="Show this help message",
        inline=False
    )
    
    embed.set_footer(text="Powered by Blossom AI")
    
    await interaction.response.send_message(embed=embed)

# Run the bot
if __name__ == "__main__":
    discord_token = os.getenv("DISCORD_TOKEN")
    if not discord_token:
        raise ValueError("DISCORD_TOKEN environment variable is required")
    
    bot.run(discord_token)
```

---

## 🚀 Running the Bot

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Set Up Environment

Create `.env` file with your tokens:
```env
DISCORD_TOKEN=your_discord_bot_token
BLOSSOM_API_KEY=your_blossom_api_key  # Optional
```

### 3. Run Bot

```bash
python bot.py
```

---

## 🔧 Advanced Features

### User Rate Limiting

Add per-user rate limiting:

```python
from datetime import datetime, timedelta

class UserRateLimiter:
    def __init__(self):
        self.user_requests = {}
    
    def is_allowed(self, user_id: str, limit: int = 5, window_minutes: int = 1):
        now = datetime.now()
        window = timedelta(minutes=window_minutes)
        
        # Clean old requests
        self.user_requests[user_id] = [
            req_time for req_time in self.user_requests.get(user_id, [])
            if now - req_time < window
        ]
        
        # Check if under limit
        if len(self.user_requests.get(user_id, [])) >= limit:
            return False
        
        # Add current request
        self.user_requests.setdefault(user_id, []).append(now)
        return True

# Use in commands
rate_limiter = UserRateLimiter()

@bot.tree.command(name="generate")
async def generate_image(interaction: discord.Interaction, prompt: str):
    if not rate_limiter.is_allowed(str(interaction.user.id)):
        await interaction.response.send_message(
            "⏰ You're sending requests too quickly. Please wait a moment.",
            ephemeral=True
        )
        return
    
    # Continue with generation...
```

### Persistent Storage

Save generated images permanently:

```python
import os
from datetime import datetime

class ImageStorage:
    def __init__(self, base_dir="generated_images"):
        self.base_dir = base_dir
        os.makedirs(base_dir, exist_ok=True)
    
    def save_image(self, image, prompt, user_id):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{user_id}_{timestamp}.png"
        filepath = os.path.join(self.base_dir, filename)
        
        image.save(filepath)
        
        # Save metadata
        metadata = {
            "prompt": prompt,
            "user_id": user_id,
            "timestamp": timestamp,
            "filepath": filepath
        }
        
        return metadata

# Use in bot
storage = ImageStorage()

@bot.tree.command(name="generate")
async def generate_image(interaction: discord.Interaction, prompt: str):
    # ... generation code ...
    
    # Save permanently
    metadata = storage.save_image(image, prompt, str(interaction.user.id))
    
    # Continue with sending...
```

---

## 📊 Monitoring and Logging

### Add Logging

```python
import logging
from blossom_ai import StructuredLogger

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = StructuredLogger("discord_bot")

# Log command usage
@bot.event
async def on_command_completion(ctx):
    logger.info(
        "Command executed",
        command=ctx.command.name,
        user=str(ctx.author),
        guild=str(ctx.guild)
    )

# Log errors
@bot.event
async def on_command_error(ctx, error):
    logger.error(
        "Command error",
        command=ctx.command.name if ctx.command else "unknown",
        error=str(error),
        user=str(ctx.author)
    )
```

---

## 🎓 Best Practices

### 1. Use Ephemeral Responses for Errors

```python
# Good ✅
await interaction.response.send_message(
    "❌ Invalid input",
    ephemeral=True  # Only user can see
)

# Bad ❌
await interaction.response.send_message("❌ Invalid input")
```

### 2. Defer Long Operations

```python
# Good ✅
await interaction.response.defer()  # Prevents timeout
# ... do long work ...
await interaction.followup.send("Done!")

# Bad ❌
# ... do long work ...
await interaction.response.send_message("Done!")  # May timeout
```

### 3. Handle Errors Gracefully

```python
# Good ✅
try:
    image = await client.image.generate(prompt)
except RateLimitError:
    await interaction.followup.send(
        "⏰ Rate limit exceeded. Please wait and try again."
    )
except Exception as e:
    await interaction.followup.send(
        f"❌ Error: {str(e)[:100]}"
    )
```

---

## 🔗 Related Documentation

- [🎨 Image Generation](IMAGE_GENERATION.md)
- [💬 Text Generation](TEXT_GENERATION.md)
- [👁️ Vision Analysis](VISION.md)
- [💾 Caching System](CACHING.md)
- [⏱️ Rate Limiting](RATE_LIMITING.md)
