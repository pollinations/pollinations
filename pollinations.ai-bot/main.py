from dotenv import load_dotenv
import os
import datetime
import discord
from discord.ext import commands, tasks
from api import *
import statistics
import time
import sys
from constants import *
from api import *
from utils import get_prompts_counts


load_dotenv()

start_time = None
latencies = []

commands_ = {
    "</pollinate:1223762317359976519> 🎨": """Generates AI Images based on your prompts
- **prompt** 🗣️ : Your prompt for the Image to be generated
- **model** 🤖 : The model to be used for generating the Image
- **width** ↔️ : The width of your prompted Image
- **height** ↕️ : The height of your prompted Image
- **cached** : specifies whether to return a cached image
- **negative** ❎ : Specifies what not to be in the generated images
- **nologo** 🚫 : Specifies whether to remove the logo from the generated images (deafault False)
- **enhance** 🖼️ : Specifies whether to enhance the image prompt or not (default True)
- **private** 🔒 : when set to True the generated Image will only be visible to you
""",
    "</multi-imagine:1187375074722975837> 🎨": """Generates AI Images using all available models
- **prompt** 🗣️ : Your prompt for the Image to be generated
- **width** ↔️ : The width of your prompted Image
- **height** ↕️ : The height of your prompted Image
- **cached** : specifies whether to return a cached image
- **negative** ❎ : Specifies what not to be in the generated images
- **nologo** 🚫 : Specifies whether to remove the logo from the generated images (deafault False)
- **enhance** 🖼️ : Specifies whether to enhance the image prompt or not (default True)
- **private** 🔒 : when set to True the generated Image will only be visible to you
""",
    "</leaderboard:1188098851807166506> 🏆": "Shows the Global Leaderboard",
    "</help:1187383172992872509> ❓": "Displays this",
    "</invite:1187439448833675286> 📨": "Invite the bot to your server",
    "</about:1187439448833675288> ℹ️": "About the bot",
}


class pollinationsBot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()

        super().__init__(command_prefix="!", intents=intents, help_command=None)
        self.synced = False

    @tasks.loop(minutes=5)
    async def change_status(self):
        count = get_prompts_counts()

        await bot.change_presence(
            activity=discord.CustomActivity(
                name="Custom Status",
                state=f"Generated {count} Images so far...",
            )
        )

    async def on_ready(self):
        await load()

        global start_time
        start_time = datetime.datetime.now(datetime.UTC)

        await self.wait_until_ready()
        if not self.synced:
            await self.tree.sync()
            self.change_status.start()
            self.synced = True

        print(f"Logged in as {self.user.name} (ID: {self.user.id})")
        print(f"Connected to {len(self.guilds)} guilds")


bot = pollinationsBot()


async def load():
    for filename in os.listdir("./cogs"):
        if filename.endswith(".py"):
            await bot.load_extension(f"cogs.{filename[:-3]}")


@bot.event
async def on_message(message):
    if message.author == bot.user:
        return

    if bot.user in message.mentions:
        if message.type is not discord.MessageType.reply:
            embed = discord.Embed(
                description="Hello, I am the Pollinations.ai Bot. I am here to help you with your AI needs. Type `!help` or click </help:1187383172992872509> to get started.",
                color=discord.Color.og_blurple(),
            )

            await message.reply(embed=embed)

    await bot.process_commands(message)


@bot.command()
@commands.is_owner()
async def sync(ctx):
    await bot.tree.sync()
    synced = await bot.tree.sync()
    if len(synced) > 0:
        await ctx.send(f"Successfully Synced {len(synced)} Commands ✔️")
    else:
        await ctx.send("No Slash Commands to Sync :/")


@bot.event
async def on_command_completion(ctx):
    end = time.perf_counter()
    start = ctx.start
    latency = (end - start) * 1000
    latencies.append(latency)
    if len(latencies) > 10:
        latencies.pop(0)


@bot.before_invoke
async def before_invoke(ctx):
    start = time.perf_counter()
    ctx.start = start


@bot.command()
async def ping(ctx):
    try:
        embed = discord.Embed(title="Pong!", color=discord.Color.green())
        message = await ctx.send(embed=embed)

        end = time.perf_counter()
        latency = (end - ctx.start) * 1000

        embed.add_field(name="Ping", value=f"{bot.latency * 1000:.2f} ms", inline=False)
        embed.add_field(name="Message Latency", value=f"{latency:.2f} ms", inline=False)

        # Calculate the average ping of the bot in the last 10 minutes
        if latencies:
            average_ping = statistics.mean(latencies)
            embed.add_field(
                name="Average Message Latency",
                value=f"{average_ping:.2f} ms",
                inline=False,
            )

        global start_time
        current_time = datetime.datetime.now(datetime.UTC)
        delta = current_time - start_time

        hours, remainder = divmod(int(delta.total_seconds()), 3600)
        minutes, seconds = divmod(remainder, 60)

        embed.add_field(
            name="Uptime",
            value=f"{hours} hours {minutes} minutes {seconds} seconds",
            inline=False,
        )
        embed.set_footer(
            text="Information requested by: {}".format(ctx.author.name),
            icon_url=ctx.author.avatar.url,
        )
        embed.set_thumbnail(
            url="https://uploads.poxipage.com/7q5iw7dwl5jc3zdjaergjhpat27tws8bkr9fgy45_938843265627717703-webp"
        )

        await message.edit(embed=embed)

    except Exception as e:
        print(e, file=sys.stdout)


@bot.hybrid_command(name="help", description="View the various commands of this server")
async def help(ctx):
    user = bot.get_user(1123551005993357342)
    profilePicture = user.avatar.url

    embed = discord.Embed(
        title="Pollinations.ai Bot Commands",
        description="Here is the list of the available commands:",
        color=discord.Color.og_blurple(),
    )

    embed.set_thumbnail(url=profilePicture)
    for i in commands_.keys():
        embed.add_field(name=i, value=commands_[i], inline=False)

    embed.set_footer(
        text="Information requested by: {}".format(ctx.author.name),
        icon_url=ctx.author.avatar.url,
    )

    await ctx.send(embed=embed)


@bot.hybrid_command(name="invite", description="Invite the bot to your server")
async def invite(ctx):
    embed = discord.Embed(
        title="Invite the bot to your server",
        url="https://discord.com/api/oauth2/authorize?client_id=1123551005993357342&permissions=534791060544&scope=bot%20applications.commands",
        description="Click the link above to invite the bot to your server",
        color=discord.Color.og_blurple(),
    )

    embed.set_footer(
        text="Information requested by: {}".format(ctx.author.name),
        icon_url=ctx.author.avatar.url,
    )

    await ctx.send(embed=embed)


@bot.hybrid_command(name="about", description="About the bot")
async def about(ctx):
    user = bot.get_user(1123551005993357342)
    profilePicture = user.avatar.url

    embed = discord.Embed(
        title="Pollinations.ai Bot",
        url="https://pollinations.ai/",
        description="I am the official Pollinations.ai Bot. I can generate AI Images from your prompts ✨.",
        color=discord.Color.og_blurple(),
    )

    github_emoji = discord.utils.get(bot.emojis, id=1187437992093155338, name="github")

    embed.set_thumbnail(url=profilePicture)
    embed.add_field(
        name=f"What is Pollinations.ai? 🌸",
        value="Pollinations.ai is a platform for creating AI-generated images completely for free. We have a growing collection of AI models that you can use to generate images.",
        inline=False,
    )
    embed.add_field(
        name="What can I do with this bot? 🤖",
        value="You can use this bot to generate AI images using our platform.",
        inline=False,
    )
    embed.add_field(
        name="How do I use this bot? 🤔",
        value="You can use this bot by typing `!help` or clicking </help:1187383172992872509> to get started.",
        inline=False,
    )
    embed.add_field(
        name="How do I report a bug? 🪲",
        value="You can report a bug by joining our [Discord Server](https://discord.gg/SFasNG4n6b).",
        inline=False,
    )
    embed.add_field(
        name=f"How do I contribute to this project? {str(github_emoji)}",
        value="This project is open source. You can contribute to this project by visiting our [GitHub Repository](https://github.com/zingzy/pollinations.ai-bot).",
        inline=False,
    )

    embed.set_footer(
        text="Information requested by: {}".format(ctx.author.name),
        icon_url=ctx.author.avatar.url if ctx.author.avatar else None,
    )
    await ctx.send(embed=embed)


if __name__ == "__main__":
    # keep_alive()  # used for keeping the bot alive if hosten on a cloud platform
    bot.run(token=TOKEN)
