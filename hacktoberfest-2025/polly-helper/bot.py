"""
Polly Helper Bot - Discord bot for creating GitHub issues

When @mentioned with an issue description, the bot uses AI to parse and enhance
the description, then creates a well-formatted GitHub issue.
"""

import discord
from discord.ext import commands
from config import DISCORD_TOKEN
from pollinations_client import pollinations_client
from github_manager import github_manager


# Bot setup with required intents
intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)


@bot.event
async def on_ready():
    """Called when the bot is ready."""
    print(f"🤖 {bot.user} is now online!")
    print(f"🔗 Connected to {len(bot.guilds)} guild(s)")
    print("📝 Mention me with an issue to create a GitHub issue!")


@bot.event
async def on_message(message: discord.Message):
    """Handle incoming messages."""
    # Ignore messages from the bot itself
    if message.author == bot.user:
        return

    # Only respond when the bot is @mentioned
    if not bot.user.mentioned_in(message):
        return
    
    # Ignore @everyone/@here mentions
    if message.mention_everyone:
        return

    # Get the issue text (remove the bot mention)
    issue_text = message.content
    for mention in message.mentions:
        issue_text = issue_text.replace(f"<@{mention.id}>", "").replace(f"<@!{mention.id}>", "")
    issue_text = issue_text.strip()

    # Check if this is a reply to another message (someone reporting another user's issue)
    referenced_message = None
    referenced_author = None
    if message.reference and message.reference.message_id:
        try:
            referenced_message = await message.channel.fetch_message(message.reference.message_id)
            referenced_author = referenced_message.author
            # If no issue text provided, use the referenced message content
            if not issue_text:
                issue_text = referenced_message.content
        except:
            pass

    if not issue_text:
        await message.reply("❌ Please describe the issue you want to report.")
        return

    # Show typing indicator while processing
    async with message.channel.typing():
        # Use AI to enhance the issue description
        enhanced = await pollinations_client.enhance_issue(issue_text)
        
        if not enhanced:
            await message.reply("❌ Couldn't process the issue. Please try again.")
            return

        # Determine the author to credit
        if referenced_author and referenced_author != message.author:
            # Someone is reporting another user's issue
            reporter = str(message.author)
            original_author = str(referenced_author)
        else:
            reporter = str(message.author)
            original_author = None

        # Create the GitHub issue
        result = await github_manager.create_issue(
            title=enhanced["title"],
            description=enhanced["description"],
            original_message=issue_text,
            reporter=reporter,
            original_author=original_author
        )

        if result["success"]:
            embed = discord.Embed(
                title="✅ Issue Created",
                description=f"**{enhanced['title']}**",
                color=discord.Color.green(),
                url=result["issue_url"]
            )
            embed.add_field(
                name="Issue",
                value=f"[View on GitHub]({result['issue_url']})",
                inline=True
            )
            embed.add_field(
                name="Reporter",
                value=reporter,
                inline=True
            )
            if original_author:
                embed.add_field(
                    name="Original Author",
                    value=original_author,
                    inline=True
                )
            embed.set_footer(text="Thank you for your report!")
            await message.reply(embed=embed)
        else:
            # Enhanced error handling with similar embed design
            error_msg = result.get('error', 'Unknown error')
            
            # Parse common error types for user-friendly messages
            if "403" in error_msg:
                friendly_error = "Permission denied - bot token may lack required access"
            elif "404" in error_msg:
                friendly_error = "Repository not found - check GITHUB_REPO setting"
            elif "401" in error_msg:
                friendly_error = "Authentication failed - check bot token"
            elif "not configured" in error_msg.lower():
                friendly_error = error_msg
            elif "timeout" in error_msg.lower():
                friendly_error = "Request timed out - GitHub may be slow"
            else:
                friendly_error = "Failed to create issue"
            
            embed = discord.Embed(
                title="❌ Issue Creation Failed",
                description=f"**{enhanced['title']}**",
                color=discord.Color.red()
            )
            embed.add_field(
                name="Error",
                value=friendly_error,
                inline=False
            )
            embed.add_field(
                name="Reporter",
                value=reporter,
                inline=True
            )
            if original_author:
                embed.add_field(
                    name="Original Author",
                    value=original_author,
                    inline=True
                )
            embed.add_field(
                name="Manual Report",
                value=f"[Create issue manually](https://github.com/{github_manager.repo}/issues/new)",
                inline=False
            )
            embed.set_footer(text="Please try again or report manually")
            await message.reply(embed=embed)


def main():
    """Run the bot."""
    if not DISCORD_TOKEN:
        print("❌ Error: DISCORD_TOKEN not set in environment variables")
        print("Please copy .env.example to .env and fill in your credentials")
        return

    print("🚀 Starting Polly Helper Bot...")
    try:
        bot.run(DISCORD_TOKEN)
    except discord.errors.PrivilegedIntentsRequired:
        print("\n⚠️ Privileged Intents Required!")
        print("Enable 'Message Content Intent' in Discord Developer Portal:")
        print("https://discord.com/developers/applications")


if __name__ == "__main__":
    main()