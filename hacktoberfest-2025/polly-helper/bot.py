"""
Pollinations Helper Bot - Discord bot for API support

A Discord bot that helps users with Pollinations API questions and
automatically creates GitHub issues for server-side problems.
"""

import asyncio
import discord
from discord.ext import commands, tasks
from config import DISCORD_TOKEN, HELPER_CHANNEL_ID, ISSUE_CHECK_INTERVAL
from pollinations_client import pollinations_client
from github_manager import github_manager


# Bot setup with required intents
intents = discord.Intents.default()
intents.message_content = True  # Privileged intent: enable in the Discord developer portal
intents.dm_messages = True

bot = commands.Bot(command_prefix="!", intents=intents)

# Store conversation history per user (limited to last 10 messages)
conversation_history = {}
MAX_HISTORY = 10


@bot.event
async def on_ready():
    """Called when the bot is ready."""
    print(f"🤖 {bot.user} is now online!")
    print(f"📺 Listening in channel ID: {HELPER_CHANNEL_ID}")
    print(f"🔗 Connected to {len(bot.guilds)} guild(s)")
    
    # Start the issue checker task
    if not check_closed_issues.is_running():
        check_closed_issues.start()


@bot.event
async def on_message(message: discord.Message):
    """Handle incoming messages."""
    # Ignore messages from the bot itself
    if message.author == bot.user:
        return

    # Only respond in the designated helper channel, unless HELPER_CHANNEL_ID == 0
    if HELPER_CHANNEL_ID != 0 and message.channel.id != HELPER_CHANNEL_ID:
        return

    # Ignore messages that start with the command prefix (handled by commands)
    if message.content.startswith("!"):
        await bot.process_commands(message)
        return

    # Process the help request
    await handle_help_request(message)


async def handle_help_request(message: discord.Message):
    """Process a user's help request."""
    user_id = message.author.id
    user_message = message.content

    # Show typing indicator
    async with message.channel.typing():
        # Get conversation history for context
        history = conversation_history.get(user_id, [])
        
        # Get AI response
        response = await pollinations_client.get_ai_response(user_message, history)
        
        # Update conversation history
        if user_id not in conversation_history:
            conversation_history[user_id] = []
        
        conversation_history[user_id].append({"role": "user", "content": user_message})
        conversation_history[user_id].append({"role": "assistant", "content": response})
        
        # Keep only last MAX_HISTORY messages
        if len(conversation_history[user_id]) > MAX_HISTORY * 2:
            conversation_history[user_id] = conversation_history[user_id][-MAX_HISTORY * 2:]

        # Check special responses from AI
        # The AI can prefix its response to indicate a required action:
        # - [IGNORE]: irrelevant message, delete and don't reply
        # - [SERVER_ISSUE]: server-side API problem (create GitHub issue)
        # - [CREATE_ISSUE]: unsolvable/unknown problem, create GitHub issue
        if response.startswith("[IGNORE]"):
            # Delete the irrelevant message and don't respond
            try:
                await message.delete()
            except discord.Forbidden:
                pass  # Bot doesn't have permission to delete
            return
        elif response.startswith("[SERVER_ISSUE]"):
            await handle_server_issue(message, response, user_message)
        elif response.startswith("[CREATE_ISSUE]"):
            await handle_create_issue(message, response, user_message)
        else:
            # Send the response (split if too long)
            await send_long_message(message.channel, response, reference=message)


async def handle_server_issue(message: discord.Message, ai_response: str, original_message: str):
    """Handle a detected server-side issue by creating a GitHub issue."""
    clean_response = ai_response.replace("[SERVER_ISSUE]", "").strip()
    
    # Send brief explanation to user
    await message.channel.send(
        f"🔍 **Server Issue Detected**\n{clean_response}\n\n📝 Creating GitHub issue...",
        reference=message
    )
    
    # Create a GitHub issue
    result = await github_manager.create_issue(
        user_id=message.author.id,
        username=str(message.author),
        issue_description=clean_response,
        original_message=original_message
    )
    
    if result["success"]:
        await message.channel.send(
            f"✅ Issue [#{result['issue_number']}]({result['issue_url']}) created. I'll DM you when resolved."
        )
    else:
        await message.channel.send(
            "⚠️ Couldn't create issue. Report manually: https://github.com/pollinations/pollinations/issues"
        )


async def handle_create_issue(message: discord.Message, ai_response: str, original_message: str):
    """Handle AI responses that request creating a GitHub issue because the issue is unsolvable."""
    clean_response = ai_response.replace("[CREATE_ISSUE]", "").strip()
    
    # Send brief explanation
    await message.channel.send(
        f"🔧 **Can't resolve this**\n{clean_response}\n\n📝 Creating GitHub issue...",
        reference=message
    )

    # Create a GitHub issue
    result = await github_manager.create_issue(
        user_id=message.author.id,
        username=str(message.author),
        issue_description=clean_response,
        original_message=original_message
    )

    if result["success"]:
        await message.channel.send(
            f"✅ Issue [#{result['issue_number']}]({result['issue_url']}) created. I'll DM you when resolved."
        )
    else:
        await message.channel.send(
            "⚠️ Couldn't create issue. Report manually: https://github.com/pollinations/pollinations/issues"
        )


async def send_long_message(channel, content: str, reference=None):
    """Send a message, splitting if it exceeds Discord's character limit."""
    max_length = 2000
    
    if len(content) <= max_length:
        await channel.send(content, reference=reference)
        return
    
    # Split into chunks
    chunks = []
    while content:
        if len(content) <= max_length:
            chunks.append(content)
            break
        
        # Find a good split point
        split_point = content.rfind("\n", 0, max_length)
        if split_point == -1:
            split_point = content.rfind(" ", 0, max_length)
        if split_point == -1:
            split_point = max_length
        
        chunks.append(content[:split_point])
        content = content[split_point:].lstrip()
    
    # Send chunks
    for i, chunk in enumerate(chunks):
        ref = reference if i == 0 else None
        await channel.send(chunk, reference=ref)


@tasks.loop(seconds=ISSUE_CHECK_INTERVAL)
async def check_closed_issues():
    """Periodically check for closed issues and notify users."""
    closed_issues = await github_manager.check_closed_issues()
    
    for issue_info in closed_issues:
        try:
            user = await bot.fetch_user(issue_info["user_id"])
            
            dm_message = (
                f"🎉 **Good news!** The issue you reported has been resolved!\n\n"
                f"**Issue:** [#{issue_info['issue_number']}]({issue_info['issue_url']})\n"
                f"**Resolution:** {issue_info['resolution'][:500]}\n\n"
                f"Thank you for helping improve Pollinations.AI! 🌸"
            )
            
            await user.send(dm_message)
            print(f"Notified user {issue_info['username']} about closed issue #{issue_info['issue_number']}")
            
        except discord.Forbidden:
            print(f"Could not DM user {issue_info['username']} - DMs may be disabled")
        except discord.NotFound:
            print(f"Could not find user {issue_info['user_id']}")
        except Exception as e:
            print(f"Error notifying user: {e}")


@check_closed_issues.before_loop
async def before_check_closed_issues():
    """Wait for the bot to be ready before starting the task."""
    await bot.wait_until_ready()


# Commands

@bot.command(name="status")
async def status_command(ctx: commands.Context):
    """Check the status of Pollinations API services."""
    if HELPER_CHANNEL_ID != 0 and ctx.channel.id != HELPER_CHANNEL_ID:
        return
    
    async with ctx.typing():
        health = await pollinations_client.check_api_health()
        
        status_emoji = lambda ok: "✅" if ok else "❌"
        
        embed = discord.Embed(
            title="🌸 Pollinations API Status",
            description="**enter.pollinations.ai** (current API)",
            color=discord.Color.green() if health['api_reachable'] else discord.Color.red()
        )
        
        embed.add_field(
            name="API Status",
            value=f"{status_emoji(health['api_reachable'])} enter.pollinations.ai",
            inline=True
        )
        embed.add_field(
            name="Image Models",
            value=f"{status_emoji(health['image_models'])} /api/generate/image/models",
            inline=True
        )
        embed.add_field(
            name="Text Models",
            value=f"{status_emoji(health['text_models'])} /api/generate/openai/models",
            inline=True
        )
        
        await ctx.send(embed=embed)


@bot.command(name="clear")
async def clear_command(ctx: commands.Context):
    """Clear your conversation history with the bot."""
    if HELPER_CHANNEL_ID != 0 and ctx.channel.id != HELPER_CHANNEL_ID:
        return
    
    user_id = ctx.author.id
    if user_id in conversation_history:
        del conversation_history[user_id]
    
    await ctx.send("🗑️ Your conversation history has been cleared!", reference=ctx.message)


@bot.command(name="help_api")
async def help_api_command(ctx: commands.Context):
    """Show quick API reference."""
    if HELPER_CHANNEL_ID != 0 and ctx.channel.id != HELPER_CHANNEL_ID:
        return
    
    embed = discord.Embed(
        title="🌸 Pollinations API Quick Reference",
        description="Use **enter.pollinations.ai** - the unified API gateway.\n(Legacy endpoints are being phased out)",
        color=discord.Color.purple()
    )
    
    embed.add_field(
        name="🔑 API Keys",
        value="Get your key at https://enter.pollinations.ai\n• `pk_` keys: client-side, rate limited\n• `sk_` keys: server-side, best limits",
        inline=False
    )
    
    embed.add_field(
        name="🖼️ Image Generation",
        value="```\nGET https://enter.pollinations.ai/api/generate/image/{prompt}\nAuth: ?key=YOUR_KEY or Authorization: Bearer YOUR_KEY\n```",
        inline=False
    )
    
    embed.add_field(
        name="💬 Text Generation (OpenAI-compatible)",
        value="```\nPOST https://enter.pollinations.ai/api/generate/v1/chat/completions\nBody: {\"model\": \"openai\", \"messages\": [...]}\n```",
        inline=False
    )
    
    embed.add_field(
        name="📋 Model Discovery",
        value="• Image: `GET /api/generate/image/models`\n• Text: `GET /api/generate/v1/models`",
        inline=False
    )
    
    embed.add_field(
        name="📚 Documentation",
        value="[API Docs](https://enter.pollinations.ai/api/docs) | [GitHub](https://github.com/pollinations/pollinations)",
        inline=False
    )
    
    await ctx.send(embed=embed)


def main():
    """Run the bot."""
    if not DISCORD_TOKEN:
        print("❌ Error: DISCORD_TOKEN not set in environment variables")
        print("Please copy .env.example to .env and fill in your credentials")
        return
    
    if HELPER_CHANNEL_ID == 0:
        print("⚠️ Warning: HELPER_CHANNEL_ID is 0 — the bot will respond in any channel. To restrict to one channel, set HELPER_CHANNEL_ID to the numeric channel ID in your .env file.")
    
    print("🚀 Starting Pollinations Helper Bot...")
    try:
        bot.run(DISCORD_TOKEN)
    except discord.errors.PrivilegedIntentsRequired:
        print("\n⚠️ Privileged Intents Required: The bot requires the Message Content Intent to read channel messages.")
        print("Please enable the Message Content Intent in the Discord Developer Portal: https://discord.com/developers/applications")
        print("Go to your application → Bot → Privileged Gateway Intents → Enable 'Message Content Intent' and save changes.")
        print("Also ensure the bot has the proper permissions in your server and that you restarted the bot after enabling the intent.")


if __name__ == "__main__":
    main()