# 📱 Telegram Bot Example

> Complete example of a Telegram bot with AI capabilities using Blossom AI

---

## 🚀 Overview

This example shows how to create a Telegram bot that can:
- 🎨 Generate images from text descriptions
- 💬 Chat with users using AI
- 👁️ Analyze photos sent by users
- 🔄 Handle multiple conversations
- 📊 Track usage statistics

### Features

- ✅ Async/await pattern for high performance
- ✅ Rate limiting per user
- ✅ Error handling and recovery
- ✅ Conversation persistence
- ✅ Inline keyboard support

---

## 📋 Prerequisites

### Install Required Packages

```bash
pip install eclips-blossom-ai python-telegram-bot python-dotenv
```

### Create Telegram Bot

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Create a new bot with `/newbot`
3. Copy the bot token
4. Set bot description and profile picture (optional)

---

## 🔧 Setup

### Project Structure

```
telegram_bot/
├── bot.py
├── handlers.py
├── utils.py
├── .env
├── requirements.txt
└── README.md
```

### Environment Variables (.env)

```env
# Telegram Bot Token
TELEGRAM_TOKEN=your_telegram_bot_token_here

# Blossom AI API Key (optional for free tier)
BLOSSOM_API_KEY=your_blossom_api_key_here

# Configuration
BLOSSOM_CACHE_ENABLED=true
BLOSSOM_RATE_LIMIT_PER_MINUTE=30
ADMIN_USER_ID=your_admin_user_id
```

### requirements.txt

```txt
eclips-blossom-ai>=0.7.0
python-telegram-bot>=20.0
python-dotenv>=1.0.0
```

---

## 🤖 Bot Implementation

### Main Bot File (bot.py)

```python
import os
import asyncio
import logging
from dotenv import load_dotenv
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ConversationHandler,
    filters,
    ContextTypes
)
from telegram.constants import ParseMode

# Import handlers
from handlers import (
    start_command,
    help_command,
    generate_command,
    chat_command,
    handle_photo,
    handle_text,
    button_callback,
    stats_command,
    cancel_command
)

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Conversation states
GENERATE_PROMPT, GENERATE_OPTIONS = range(2)
CHAT_MESSAGE = range(1)

def main():
    """Start the bot."""
    # Get token from environment
    token = os.getenv("TELEGRAM_TOKEN")
    if not token:
        raise ValueError("TELEGRAM_TOKEN environment variable is required")
    
    # Create application
    application = Application.builder().token(token).build()
    
    # Add handlers
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("stats", stats_command))
    
    # Generate conversation
    generate_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("generate", generate_command)],
        states={
            GENERATE_PROMPT: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, handle_generate_prompt)
            ],
            GENERATE_OPTIONS: [
                CallbackQueryHandler(handle_generate_options)
            ]
        },
        fallbacks=[CommandHandler("cancel", cancel_command)]
    )
    application.add_handler(generate_conv_handler)
    
    # Chat conversation
    chat_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("chat", chat_command)],
        states={
            CHAT_MESSAGE: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, handle_chat_message)
            ]
        },
        fallbacks=[CommandHandler("cancel", cancel_command)]
    )
    application.add_handler(chat_conv_handler)
    
    # Photo handler
    application.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    
    # Text handler for direct messages
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    
    # Callback query handler
    application.add_handler(CallbackQueryHandler(button_callback))
    
    # Start bot
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()
```

### Handlers (handlers.py)

```python
import os
import logging
from typing import Optional
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from telegram.constants import ParseMode
from blossom_ai import (
    BlossomClient,
    SessionConfig,
    ValidationError,
    RateLimitError,
    AuthenticationError,
    NetworkError
)
from blossom_ai.utils.cache import CacheManager, CacheConfig
from utils import (
    rate_limit_check,
    log_usage,
    format_response,
    create_progress_bar
)

logger = logging.getLogger(__name__)

# Initialize Blossom AI configuration
blossom_config = SessionConfig(
    api_key=os.getenv("BLOSSOM_API_KEY", ""),
    cache_enabled=os.getenv("BLOSSOM_CACHE_ENABLED", "true").lower() == "true",
    rate_limit_per_minute=int(os.getenv("BLOSSOM_RATE_LIMIT_PER_MINUTE", "30"))
)

# Bot statistics
bot_stats = {
    "total_messages": 0,
    "text_generations": 0,
    "image_generations": 0,
    "image_analyses": 0,
    "active_users": set()
}

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send a message when the command /start is issued."""
    user = update.effective_user
    welcome_message = f"""
🌸 <b>Welcome to Blossom AI Bot!</b>

Hello {user.first_name}! I'm an AI-powered bot that can:

🎨 <b>Generate Images</b> - Use /generate to create images from text
💬 <b>Chat with AI</b> - Use /chat to have conversations  
👁️ <b>Analyze Photos</b> - Send me a photo to analyze it
📊 <b>View Stats</b> - Use /stats to see bot statistics

<b>Commands:</b>
• /generate - Generate an image
• /chat - Start a conversation
• /help - Show this help message
• /stats - Bot statistics
• /cancel - Cancel current operation

Let's start creating! 🚀
    """
    
    await update.message.reply_html(welcome_message)
    
    # Add user to stats
    bot_stats["active_users"].add(user.id)
    bot_stats["total_messages"] += 1

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send a message when the command /help is issued."""
    help_message = """
🌸 <b>Blossom AI Bot Help</b>

<b>🎨 Image Generation:</b>
• /generate - Start image generation wizard
• Choose size, quality, and style
• Get high-quality AI-generated images

<b>💬 AI Chat:</b>
• /chat - Start conversation with AI
• Choose personality (helpful, creative, professional)
• Get intelligent responses

<b>👁️ Image Analysis:</b>
• Send any photo to the bot
• AI will analyze and describe the image
• Get detailed information about objects, colors, and more

<b>⚙️ Tips:</b>
• Be descriptive in your prompts
• Use /cancel to stop any operation
• Bot has rate limiting to ensure fair usage

Need more help? Contact the bot administrator!
    """
    
    await update.message.reply_html(help_message)
    bot_stats["total_messages"] += 1

async def generate_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Start image generation conversation."""
    user = update.effective_user
    
    # Check rate limit
    if not await rate_limit_check(user.id):
        await update.message.reply_text(
            "⏰ You're sending requests too quickly. Please wait a moment.",
            parse_mode=ParseMode.HTML
        )
        return ConversationHandler.END
    
    await update.message.reply_html(
        "🎨 <b>Image Generation</b>\n\n"
        "Please describe the image you want to generate:\n\n"
        "💡 <i>Example: A beautiful sunset over mountains with birds flying</i>"
    )
    
    bot_stats["total_messages"] += 1
    return GENERATE_PROMPT

async def handle_generate_prompt(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle the image generation prompt."""
    prompt = update.message.text.strip()
    
    if len(prompt) < 10:
        await update.message.reply_html(
            "❌ Prompt too short. Please provide a more detailed description."
        )
        return GENERATE_PROMPT
    
    if len(prompt) > 1000:
        await update.message.reply_html(
            "❌ Prompt too long. Please keep it under 1000 characters."
        )
        return GENERATE_PROMPT
    
    # Store prompt in context
    context.user_data['prompt'] = prompt
    
    # Show options
    keyboard = [
        [
            InlineKeyboardButton("🖼️ Square (1024x1024)", callback_data="size_square"),
            InlineKeyboardButton("🖼️ Landscape (1536x1024)", callback_data="size_landscape")
        ],
        [
            InlineKeyboardButton("🖼️ Portrait (1024x1536)", callback_data="size_portrait")
        ],
        [
            InlineKeyboardButton("⚡ Standard Quality", callback_data="quality_standard"),
            InlineKeyboardButton("🌟 HD Quality", callback_data="quality_hd")
        ],
        [
            InlineKeyboardButton("🎨 Vivid Style", callback_data="style_vivid"),
            InlineKeyboardButton("🌿 Natural Style", callback_data="style_natural")
        ],
        [
            InlineKeyboardButton("✅ Generate!", callback_data="generate_start")
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_html(
        f"📝 <b>Prompt:</b> {prompt}\n\n"
        "Choose options below and click 'Generate!' when ready:",
        reply_markup=reply_markup
    )
    
    return GENERATE_OPTIONS

async def handle_generate_options(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle generate options callback."""
    query = update.callback_query
    await query.answer()
    
    data = query.data
    user_data = context.user_data
    
    # Initialize options if not exists
    if 'options' not in user_data:
        user_data['options'] = {
            'width': 1024,
            'height': 1024,
            'quality': 'standard',
            'style': 'vivid'
        }
    
    # Update options based on callback
    if data == "size_square":
        user_data['options'].update({'width': 1024, 'height': 1024})
        await query.edit_message_text("✅ Size set to Square")
    elif data == "size_landscape":
        user_data['options'].update({'width': 1536, 'height': 1024})
        await query.edit_message_text("✅ Size set to Landscape")
    elif data == "size_portrait":
        user_data['options'].update({'width': 1024, 'height': 1536})
        await query.edit_message_text("✅ Size set to Portrait")
    elif data == "quality_standard":
        user_data['options']['quality'] = 'standard'
        await query.edit_message_text("✅ Quality set to Standard")
    elif data == "quality_hd":
        user_data['options']['quality'] = 'hd'
        await query.edit_message_text("✅ Quality set to HD")
    elif data == "style_vivid":
        user_data['options']['style'] = 'vivid'
        await query.edit_message_text("✅ Style set to Vivid")
    elif data == "style_natural":
        user_data['options']['style'] = 'natural'
        await query.edit_message_text("✅ Style set to Natural")
    elif data == "generate_start":
        # Start generation
        await generate_image_final(update, context)
        return ConversationHandler.END
    
    return GENERATE_OPTIONS

async def generate_image_final(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Generate the final image."""
    query = update.callback_query
    user = update.effective_user
    
    await query.edit_message_text("🎨 Generating your image... This may take up to 60 seconds.")
    
    try:
        prompt = context.user_data.get('prompt', 'beautiful image')
        options = context.user_data.get('options', {})
        
        async with BlossomClient(config=blossom_config) as client:
            image = await client.image.generate(
                prompt=prompt,
                width=options.get('width', 1024),
                height=options.get('height', 1024),
                quality=options.get('quality', 'standard'),
                style=options.get('style', 'vivid'),
                model="dall-e-3"
            )
            
            # Save image
            temp_file = f"/tmp/telegram_gen_{user.id}_{update.update_id}.png"
            image.save(temp_file)
            
            # Send image
            with open(temp_file, 'rb') as photo:
                await context.bot.send_photo(
                    chat_id=user.id,
                    photo=photo,
                    caption=f"🎨 <b>Generated Image</b>\n\n"
                           f"📋 <b>Prompt:</b> {prompt}\n"
                           f"📏 <b>Size:</b> {options.get('width', 1024)}x{options.get('height', 1024)}\n"
                           f"🌟 <b>Quality:</b> {options.get('quality', 'standard').upper()}\n"
                           f"🎨 <b>Style:</b> {options.get('style', 'vivid').title()}",
                    parse_mode=ParseMode.HTML
                )
            
            # Clean up
            os.remove(temp_file)
            
            # Update stats
            bot_stats["image_generations"] += 1
            await log_usage(user.id, "image_generation", prompt)
            
    except ValidationError as e:
        await query.edit_message_text(f"❌ Invalid parameters: {e}")
    except RateLimitError:
        await query.edit_message_text("⏰ Rate limit exceeded. Please wait and try again.")
    except NetworkError:
        await query.edit_message_text("🌐 Network error. Please try again later.")
    except Exception as e:
        await query.edit_message_text(f"❌ Error generating image: {str(e)[:100]}")
        logger.error(f"Image generation error: {e}")

async def chat_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Start chat conversation."""
    user = update.effective_user
    
    # Check rate limit
    if not await rate_limit_check(user.id):
        await update.message.reply_text(
            "⏰ You're sending requests too quickly. Please wait a moment.",
            parse_mode=ParseMode.HTML
        )
        return ConversationHandler.END
    
    # Show personality options
    keyboard = [
        [
            InlineKeyboardButton("🤖 Helpful Assistant", callback_data="personality_helpful"),
            InlineKeyboardButton("🎨 Creative Writer", callback_data="personality_creative")
        ],
        [
            InlineKeyboardButton("💼 Professional", callback_data="personality_professional"),
            InlineKeyboardButton("🤗 Friendly Friend", callback_data="personality_friendly")
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_html(
        "💬 <b>AI Chat</b>\n\n"
        "Choose your AI personality:",
        reply_markup=reply_markup
    )
    
    bot_stats["total_messages"] += 1
    return CHAT_MESSAGE

async def handle_chat_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle chat messages."""
    user_message = update.message.text.strip()
    user = update.effective_user
    
    # Get personality from context
    personality = context.user_data.get('personality', 'helpful')
    
    # Set system prompt based on personality
    personalities = {
        "helpful": "You are a helpful assistant. Answer concisely and accurately.",
        "creative": "You are a creative writer. Be imaginative and engaging in your responses.",
        "professional": "You are a professional consultant. Provide detailed, formal responses.",
        "friendly": "You are a friendly companion. Be warm, conversational, and supportive."
    }
    
    system_prompt = personalities.get(personality, personalities["helpful"])
    
    # Show typing indicator
    await context.bot.send_chat_action(chat_id=user.id, action="typing")
    
    try:
        async with BlossomClient(config=blossom_config) as client:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ]
            
            response = await client.text.chat(
                messages=messages,
                model="gpt-4",
                max_tokens=1000,
                temperature=0.7
            )
            
            # Format and send response
            formatted_response = format_response(response.text)
            
            if len(formatted_response) > 4096:
                # Split long messages
                parts = [formatted_response[i:i+4000] for i in range(0, len(formatted_response), 4000)]
                
                for i, part in enumerate(parts):
                    if i == 0:
                        await update.message.reply_html(part)
                    else:
                        await context.bot.send_message(
                            chat_id=user.id,
                            text=part,
                            parse_mode=ParseMode.HTML
                        )
            else:
                await update.message.reply_html(formatted_response)
            
            # Update stats
            bot_stats["text_generations"] += 1
            await log_usage(user.id, "chat", user_message[:50])
            
    except RateLimitError:
        await update.message.reply_text(
            "⏰ Rate limit exceeded. Please wait and try again.",
            parse_mode=ParseMode.HTML
        )
    except NetworkError:
        await update.message.reply_text(
            "🌐 Network error. Please try again later.",
            parse_mode=ParseMode.HTML
        )
    except Exception as e:
        await update.message.reply_text(
            f"❌ Error: {str(e)[:100]}",
            parse_mode=ParseMode.HTML
        )
        logger.error(f"Chat error: {e}")

async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle photos sent to the bot."""
    user = update.effective_user
    photo = update.message.photo[-1]  # Get highest quality photo
    
    # Check rate limit
    if not await rate_limit_check(user.id):
        await update.message.reply_text(
            "⏰ You're sending requests too quickly. Please wait a moment.",
            parse_mode=ParseMode.HTML
        )
        return
    
    # Show typing indicator
    await context.bot.send_chat_action(chat_id=user.id, action="typing")
    
    try:
        # Get photo file
        photo_file = await context.bot.get_file(photo.file_id)
        
        # Download photo
        photo_bytes = await photo_file.download_as_bytearray()
        
        # Analyze image
        async with BlossomClient(config=blossom_config) as client:
            analysis = await client.vision.analyze(
                image_bytes=bytes(photo_bytes),
                prompt="analyze this image in detail",
                detail="high",
                max_tokens=500
            )
            
            # Format analysis
            response_text = f"""👁️ <b>Image Analysis</b>

📝 <b>Description:</b> {analysis.description}
"""
            
            if analysis.objects:
                objects_str = ", ".join(analysis.objects[:10])
                if len(analysis.objects) > 10:
                    objects_str += f" and {len(analysis.objects) - 10} more"
                response_text += f"\n🔍 <b>Objects:</b> {objects_str}\n"
            
            if analysis.colors:
                colors_str = ", ".join(analysis.colors[:5])
                response_text += f"🎨 <b>Colors:</b> {colors_str}\n"
            
            await update.message.reply_html(response_text)
            
            # Update stats
            bot_stats["image_analyses"] += 1
            await log_usage(user.id, "image_analysis", "photo")
            
    except ValidationError as e:
        await update.message.reply_html(f"❌ Invalid image: {e}")
    except NetworkError:
        await update.message.reply_html("🌐 Network error. Please try again.")
    except Exception as e:
        await update.message.reply_html(f"❌ Error analyzing image: {str(e)[:100]}")
        logger.error(f"Image analysis error: {e}")

async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle text messages when not in conversation."""
    user = update.effective_user
    text = update.message.text.strip()
    
    # Check if it's a command
    if text.startswith('/'):
        return
    
    # Quick help for direct messages
    await update.message.reply_html(
        f"💬 Hi {user.first_name}!\n\n"
        "I can help you with AI generation!\n\n"
        "🎨 Use /generate to create images\n"
        "💬 Use /chat to start a conversation\n"
        "👁️ Send me a photo to analyze it\n"
        "❓ Use /help for more information"
    )
    
    bot_stats["total_messages"] += 1

async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle button callbacks."""
    query = update.callback_query
    await query.answer()
    
    data = query.data
    
    if data.startswith("personality_"):
        personality = data.split("_")[1]
        context.user_data['personality'] = personality
        
        await query.edit_message_text(
            f"✅ Personality set to {personality.title()}\n\n"
            "Now send me a message to start chatting!"
        )
        
    # Add more callback handlers as needed

async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show bot statistics."""
    user = update.effective_user
    
    # Only allow admin to see stats
    admin_id = os.getenv("ADMIN_USER_ID")
    if admin_id and str(user.id) != admin_id:
        await update.message.reply_html("❌ You don't have permission to view statistics.")
        return
    
    stats_message = f"""📊 <b>Blossom AI Bot Statistics</b>

📈 <b>Usage Statistics:</b>
• Total Messages: {bot_stats["total_messages"]}
• Text Generations: {bot_stats["text_generations"]}
• Image Generations: {bot_stats["image_generations"]}
• Image Analyses: {bot_stats["image_analyses"]}

👥 <b>Users:</b>
• Active Users: {len(bot_stats["active_users"])}

⚙️ <b>Configuration:</b>
• Cache Enabled: {blossom_config.cache_enabled}
• Rate Limit: {blossom_config.rate_limit_per_minute} req/min
"""
    
    await update.message.reply_html(stats_message)

async def cancel_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Cancel the current conversation."""
    await update.message.reply_html(
        "✅ Operation cancelled.\n\n"
        "What would you like to do next?\n"
        "• /generate - Generate an image\n"
        "• /chat - Start a conversation\n"
        "• /help - Show help"
    )
    return ConversationHandler.END

# Export handlers
__all__ = [
    'start_command',
    'help_command',
    'generate_command',
    'chat_command',
    'handle_photo',
    'handle_text',
    'button_callback',
    'stats_command',
    'cancel_command',
    'handle_generate_prompt',
    'handle_generate_options',
    'generate_image_final',
    'handle_chat_message'
]
```

### Utilities (utils.py)

```python
import time
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Optional
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)

# Rate limiting storage
user_requests: Dict[int, list] = defaultdict(list)
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = 5

async def rate_limit_check(user_id: int) -> bool:
    """Check if user is within rate limits."""
    now = datetime.now()
    window_start = now - timedelta(seconds=RATE_LIMIT_WINDOW)
    
    # Clean old requests
    user_requests[user_id] = [
        req_time for req_time in user_requests[user_id]
        if req_time > window_start
    ]
    
    # Check if under limit
    if len(user_requests[user_id]) >= RATE_LIMIT_MAX_REQUESTS:
        return False
    
    # Add current request
    user_requests[user_id].append(now)
    return True

async def log_usage(user_id: int, operation: str, details: str):
    """Log user usage for analytics."""
    logger.info(
        "User operation",
        extra={
            "user_id": user_id,
            "operation": operation,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
    )

def format_response(text: str) -> str:
    """Format AI response for Telegram."""
    # Escape special characters for HTML
    escape_chars = ['<', '>', '&']
    for char in escape_chars:
        text = text.replace(char, f"&#{ord(char)};")
    
    # Add formatting for code blocks
    if "```" in text:
        text = text.replace("```python", "<pre><code class=\"language-python\">")
        text = text.replace("```", "</code></pre>")
    
    # Bold important terms
    important_terms = ["AI", "machine learning", "neural network", "algorithm"]
    for term in important_terms:
        text = text.replace(term, f"<b>{term}</b>")
    
    return text

def create_progress_bar(current: int, total: int, length: int = 20) -> str:
    """Create a text-based progress bar."""
    filled = int(length * current // total)
    bar = "█" * filled + "░" * (length - filled)
    percentage = int(100 * current // total)
    return f"[{bar}] {percentage}%"

def get_user_friendly_error(error: Exception) -> str:
    """Convert technical errors to user-friendly messages."""
    error_messages = {
        "RateLimitError": "⏰ I'm getting too many requests. Please wait a moment and try again.",
        "NetworkError": "🌐 I'm having trouble connecting. Please try again later.",
        "AuthenticationError": "🔑 There's a problem with my AI connection. Please contact support.",
        "ValidationError": "❌ The request doesn't look right. Please check your input.",
        "TimeoutError": "⏱️ The request took too long. Please try something simpler."
    }
    
    error_type = type(error).__name__
    return error_messages.get(error_type, "❌ Something went wrong. Please try again.")

class ConversationTracker:
    """Track conversation history for context."""
    
    def __init__(self, max_history: int = 10):
        self.conversations: Dict[int, list] = defaultdict(list)
        self.max_history = max_history
    
    def add_message(self, user_id: int, role: str, content: str):
        """Add message to conversation history."""
        self.conversations[user_id].append({
            "role": role,
            "content": content,
            "timestamp": datetime.now()
        })
        
        # Keep only recent messages
        if len(self.conversations[user_id]) > self.max_history:
            self.conversations[user_id] = self.conversations[user_id][-self.max_history:]
    
    def get_history(self, user_id: int) -> list:
        """Get conversation history for user."""
        return self.conversations[user_id]
    
    def clear_history(self, user_id: int):
        """Clear conversation history for user."""
        self.conversations[user_id] = []

# Global conversation tracker
conversation_tracker = ConversationTracker()

async def download_file(file, destination: str) -> bool:
    """Download file from Telegram."""
    try:
        await file.download_to_drive(destination)
        return True
    except Exception as e:
        logger.error(f"Failed to download file: {e}")
        return False

def format_file_size(size_bytes: int) -> str:
    """Format file size in human readable format."""
    if size_bytes == 0:
        return "0B"
    
    size_names = ["B", "KB", "MB", "GB"]
    i = 0
    size = float(size_bytes)
    
    while size >= 1024.0 and i < len(size_names) - 1:
        size /= 1024.0
        i += 1
    
    return f"{size:.1f} {size_names[i]}"

# Export utilities
__all__ = [
    'rate_limit_check',
    'log_usage',
    'format_response',
    'create_progress_bar',
    'get_user_friendly_error',
    'ConversationTracker',
    'conversation_tracker',
    'download_file',
    'format_file_size'
]
```

---

## 🚀 Running the Bot

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Set Up Environment

Create `.env` file:
```env
TELEGRAM_TOKEN=your_bot_token_here
BLOSSOM_API_KEY=your_blossom_api_key_here
ADMIN_USER_ID=your_telegram_user_id
```

### 3. Run Bot

```bash
python bot.py
```

---

## 🔧 Advanced Features

### 1. Add Custom Commands

```python
# Add to bot.py
from handlers import custom_command

application.add_handler(CommandHandler("custom", custom_command))

# In handlers.py
async def custom_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Custom command example."""
    await update.message.reply_text("This is a custom command!")
```

### 2. Database Integration

```python
import sqlite3

class UserDatabase:
    def __init__(self, db_path="users.db"):
        self.conn = sqlite3.connect(db_path)
        self.create_tables()
    
    def create_tables(self):
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                join_date TIMESTAMP,
                total_requests INTEGER DEFAULT 0
            )
        """)
        self.conn.commit()
    
    def add_user(self, user):
        self.conn.execute("""
            INSERT OR IGNORE INTO users 
            (user_id, username, first_name, join_date)
            VALUES (?, ?, ?, ?)
        """, (user.id, user.username, user.first_name, datetime.now()))
        self.conn.commit()
    
    def increment_requests(self, user_id):
        self.conn.execute("""
            UPDATE users SET total_requests = total_requests + 1
            WHERE user_id = ?
        """, (user_id,))
        self.conn.commit()
```

### 3. Webhook Deployment

```python
# For production deployment
from telegram.ext import Application

app = Application.builder().token(token).build()

# Set webhook
await app.bot.set_webhook(
    url="https://your-domain.com/webhook",
    secret_token="your_secret_token"
)

# Handle webhook updates
@app.webhook_handler
async def webhook(update):
    await app.process_update(update)
```

---

## 📊 Monitoring and Analytics

### Add Analytics

```python
import matplotlib.pyplot as plt
import io

async def generate_analytics_chart():
    """Generate usage analytics chart."""
    
    # Create chart
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
    
    # Usage over time
    dates = [...]  # Get from database
    usage = [...]  # Get from database
    
    ax1.plot(dates, usage)
    ax1.set_title("Daily Usage")
    ax1.set_ylabel("Requests")
    
    # Command distribution
    commands = ["text", "image", "analysis"]
    counts = [100, 50, 30]  # Get from database
    
    ax2.pie(counts, labels=commands, autopct='%1.1f%%')
    ax2.set_title("Command Distribution")
    
    # Save to bytes
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png')
    buffer.seek(0)
    
    return buffer
```

---

## 🎓 Best Practices

### 1. Handle Timeouts Gracefully

```python
# Use conversation timeouts
conv_handler = ConversationHandler(
    entry_points=[CommandHandler("generate", generate_command)],
    states={
        GENERATE_PROMPT: [
            MessageHandler(filters.TEXT & ~filters.COMMAND, handle_generate_prompt),
            MessageHandler(~filters.TEXT, timeout_handler)
        ]
    },
    fallbacks=[CommandHandler("cancel", cancel_command)],
    conversation_timeout=300  # 5 minutes
)
```

### 2. Validate User Input

```python
def validate_prompt(prompt: str) -> tuple[bool, str]:
    """Validate image generation prompt."""
    if len(prompt) < 10:
        return False, "Prompt too short. Minimum 10 characters."
    
    if len(prompt) > 1000:
        return False, "Prompt too long. Maximum 1000 characters."
    
    # Check for forbidden content
    forbidden_words = ["forbidden", "content", "here"]
    for word in forbidden_words:
        if word.lower() in prompt.lower():
            return False, f"Prompt contains forbidden word: {word}"
    
    return True, "Valid prompt"
```

### 3. Use Proper Error Handling

```python
async def safe_send_message(bot, chat_id, text, **kwargs):
    """Safely send message with error handling."""
    try:
        await bot.send_message(chat_id=chat_id, text=text, **kwargs)
        return True
    except Exception as e:
        logger.error(f"Failed to send message: {e}")
        return False
```

---

## 🔗 Related Documentation

- [🎨 Image Generation](IMAGE_GENERATION.md)
- [💬 Text Generation](TEXT_GENERATION.md)
- [👁️ Vision Analysis](VISION.md)
- [💾 Caching System](CACHING.md)
- [⏱️ Rate Limiting](RATE_LIMITING.md)
- [🚀 Deployment Guide](DEPLOYMENT.md)
