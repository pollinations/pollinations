import datetime
from discord import app_commands, ui
from discord.ext import commands
import discord
from utils import *
from constants import *


class leaderboard(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(
        name="leaderboard", description="Shows the leaderboard of the server"
    )
    @app_commands.guild_only()
    async def leaderboard_command(self, interaction):
        await interaction.response.defer()

        leaderboard = generate_global_leaderboard()

        leaderboard_ = {}

        for i in list(leaderboard.keys())[1:]:
            user = await self.bot.fetch_user(i)
            leaderboard_[i] = {"name": user.name, "points": leaderboard[i]}

        top_user = await self.bot.fetch_user(list(leaderboard.keys())[0])
        top_user_id = top_user.id

        try:
            top_user_avatar = top_user.avatar.url
        except Exception as e:
            top_user_avatar = top_user.default_avatar.url

        embed = discord.Embed(
            title="Top 10 prompters",
            color=discord.Color.gold(),
            description="This Shows the top 10 bot users across all of the servers the bot is in.",
            timestamp=datetime.datetime.now(datetime.UTC),
        )
        embed.set_thumbnail(url=top_user_avatar)

        embed.add_field(
            name=f"{NUMBER_EMOJIES[1]}  {top_user.name} - {leaderboard[top_user_id]} points",
            value="** **",
        )

        for i, user in enumerate(leaderboard_):
            embed.add_field(
                name=f"{NUMBER_EMOJIES[i+2]}  {leaderboard_[user]['name']} - {leaderboard_[user]['points']} points",
                inline=False,
                value="** **",
            )

        try:
            embed.set_footer(
                text=f"Requested by {interaction.user.name}",
                icon_url=interaction.user.avatar.url,
            )
        except Exception as e:
            embed.set_footer(
                text=f"Requested by {interaction.user.name}",
                icon_url=interaction.user.default_avatar.url,
            )

        await interaction.followup.send(embed=embed)


async def setup(bot):
    await bot.add_cog(leaderboard(bot))
    print("leaderboard cog loaded")
