import datetime
import discord
from discord import app_commands, ui
from discord.ext import commands

from utils import *
from constants import *


class ImagineButtonView(discord.ui.View):
    def __init__(self, link: str = None):
        super().__init__(timeout=None)
        self.link = link

        if link is not None:
            self.add_item(discord.ui.Button(label="Link", url=self.link))

    @discord.ui.button(
        style=discord.ButtonStyle.secondary,
        custom_id="regenerate-button",
        emoji="<:redo:1187101382101180456>",
    )
    async def regenerate(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ):
        message_id = interaction.message.id
        await interaction.response.send_message(
            embed=discord.Embed(
                title="Regenerating Your Image",
                description="Please wait while we generate your image",
                color=discord.Color.blurple(),
            ),
            ephemeral=True,
        )

        message_data = get_prompt_data(message_id)

        if not message_data:
            await interaction.followup.send(
                embed=discord.Embed(
                    title="Error",
                    description="Message not found",
                    color=discord.Color.red(),
                ),
                ephemeral=True,
            )
            return

        start = datetime.datetime.now()

        prompt = message_data["prompt"]
        width = message_data["width"]
        height = message_data["height"]
        model = message_data["model"]
        negative = message_data["negative"]
        cached = message_data["cached"]
        nologo = message_data["nologo"]
        enhance = message_data["enhance"]

        try:
            dic, image, is_nsfw = await generate_image(
                prompt, width, height, model, negative, cached, nologo, enhance
            )
        except Exception as e:
            print(e)
            await interaction.followup.send(
                embed=discord.Embed(
                    title="Error",
                    description=f"Error generating image : {e}",
                    color=discord.Color.red(),
                ),
                ephemeral=True,
            )
            return

        image_file = discord.File(image, filename="image.png")

        if is_nsfw:
            image_file.filename = f"SPOILER_{image_file.filename}"

        time_taken = datetime.datetime.now() - start

        context = f"## {prompt} - {interaction.user.mention}\n### Model - `{model}`  |  Time Taken - `{round(time_taken.total_seconds(), 2)} s`\n### Width - `{width} px`  |  Height - `{height} px`\n### Enchance - `{enhance}`"

        response = await interaction.channel.send(
            context, file=image_file, view=ImagineButtonView(link=dic["bookmark_url"])
        )

        dic["_id"] = response.id
        dic["channel_id"] = interaction.channel.id
        dic["user_id"] = interaction.user.id
        dic["guild_id"] = interaction.guild.id
        dic["author"] = interaction.user.id
        dic["bookmarks"] = []
        dic["likes"] = []

        user_data = get_user_data(interaction.user.id)
        if user_data is None:
            user_data = {
                "_id": interaction.user.id,
                "bookmarks": [],
                "likes": [],
                "prompts": [],
                "last_prompt": None,
            }
            save_user_data(interaction.user.id, user_data)

        user_data["prompts"].append(response.id)

        update_user_data(interaction.user.id, user_data)
        save_prompt_data(message_id, dic)

    @discord.ui.button(
        label="0",
        style=discord.ButtonStyle.secondary,
        custom_id="like-button",
        emoji="<:like:1187101385230143580>",
    )
    async def like(self, interaction: discord.Interaction, button: discord.ui.Button):
        try:
            id = interaction.message.id
            message_data = get_prompt_data(id)
            likes = message_data["likes"]

            user_data = get_user_data(interaction.user.id)
            if user_data is None:
                user_data = {
                    "_id": interaction.user.id,
                    "bookmarks": {},
                    "likes": {},
                    "prompts": {},
                    "last_prompt": None,
                }
                save_user_data(interaction.user.id, user_data)

            if interaction.user.id in likes:
                likes.remove(interaction.user.id)
                update_prompt_data(id, {"likes": likes})
                button.label = f"{len(likes)}"
                await interaction.response.edit_message(view=self)

                user_data["likes"].remove(id)
                update_user_data(interaction.user.id, user_data)

                return
            else:
                likes.append(interaction.user.id)
                update_prompt_data(id, {"likes": likes})
                button.label = f"{len(likes)}"
                await interaction.response.edit_message(view=self)

                user_data["likes"].append(id)
                update_user_data(interaction.user.id, user_data)

                return
        except Exception as e:
            print(e)
            interaction.response.send_message(
                embed=discord.Embed(
                    title="Error Liking the Image",
                    description=f"{e}",
                    color=discord.Color.red(),
                ),
                ephemeral=True,
            )

    @discord.ui.button(
        label="0",
        style=discord.ButtonStyle.secondary,
        custom_id="bookmark-button",
        emoji="<:save:1187101389822902344>",
    )
    async def bookmark(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ):
        try:
            id = interaction.message.id
            message_data = get_prompt_data(id)
            bookmarks = message_data["bookmarks"]

            if interaction.user.id in bookmarks:
                await interaction.response.send_message(
                    embed=discord.Embed(
                        title="Error",
                        description="You have already bookmarked this image",
                        color=discord.Color.red(),
                    ),
                    ephemeral=True,
                )
            else:
                bookmarks.append(interaction.user.id)
                update_prompt_data(id, {"bookmarks": bookmarks})
                button.label = f"{len(bookmarks)}"
                await interaction.response.edit_message(view=self)

                embed = discord.Embed(
                    title=f"Prompt : {message_data['prompt']}",
                    description=f"url : {message_data['bookmark_url']}",
                    color=discord.Color.og_blurple(),
                )
                embed.set_image(url=message_data["bookmark_url"])

                await interaction.user.send(embed=embed)

                user_data = get_user_data(interaction.user.id)
                if user_data is None:
                    user_data = {
                        "_id": interaction.user.id,
                        "bookmarks": [],
                        "likes": [],
                        "prompts": [],
                        "last_prompt": None,
                    }
                    save_user_data(interaction.user.id, user_data)

                user_data["bookmarks"].append(id)
                update_user_data(interaction.user.id, user_data)

                return

        except Exception as e:
            print(e)
            await interaction.response.send_message(
                embed=discord.Embed(
                    title="Error Bookmarking the Image",
                    description=f"{e}",
                    color=discord.Color.red(),
                ),
                ephemeral=True,
            )

    @discord.ui.button(
        style=discord.ButtonStyle.red,
        custom_id="delete-button",
        emoji="<:delete:1187102382312652800>",
    )
    async def delete(self, interaction: discord.Interaction, button: discord.ui.Button):
        try:
            data = get_prompt_data(interaction.message.id)
            author_id = data["author"]
            likes = data["likes"]
            bookmarks = data["bookmarks"]
            try:
                int(author_id)
            except:
                pass

            if interaction.user.id != author_id:
                await interaction.response.send_message(
                    embed=discord.Embed(
                        title="Error",
                        description="You can only delete your own images",
                        color=discord.Color.red(),
                    ),
                    ephemeral=True,
                )
                return

            delete_prompt_data(interaction.message.id)
            await interaction.message.delete()

            user_data = get_user_data(interaction.user.id)
            if user_data is None:
                return

            user_data["prompts"].remove(interaction.message.id)
            update_user_data(interaction.user.id, user_data)

            for i in likes:
                try:
                    user_data = get_user_data(i)
                    user_data["likes"].remove(interaction.message.id)
                    update_user_data(i, user_data)
                except:
                    pass

            for i in bookmarks:
                try:
                    user_data = get_user_data(i)
                    user_data["bookmarks"].remove(interaction.message.id)
                    update_user_data(i, user_data)
                except:
                    pass

        except Exception as e:
            print(e)
            await interaction.response.send_message(
                embed=discord.Embed(
                    title="Error Deleting the Image",
                    description=f"{e}",
                    color=discord.Color.red(),
                ),
                ephemeral=True,
            )


class Imagine(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    async def cog_load(self):
        await self.bot.wait_until_ready()
        self.bot.add_view(ImagineButtonView())

    @app_commands.command(name="pollinate", description="Generate AI Images")
    @app_commands.choices(
        model=[app_commands.Choice(name=choice, value=choice) for choice in MODELS],
    )
    @app_commands.guild_only()
    @app_commands.checks.cooldown(1, 15)
    @app_commands.describe(
        prompt="Imagine a prompt",
        model=f"The AI model to use for generating the image. Default is {MODELS[0]}",
        height="Height of the image",
        width="Width of the image",
        negative="The things not to include in the image",
        cached="Removes the image seed",
        nologo="Remove the logo",
        enhance="Disables Prompt enhancing if set to False",
        private="Only you can see the generated Image if set to True",
    )
    async def imagine_command(
        self,
        interaction,
        prompt: str,
        model: app_commands.Choice[str] = MODELS[0],
        width: int = 1000,
        height: int = 1000,
        negative: str | None = None,
        cached: bool = False,
        nologo: bool = False,
        enhance: bool = True,
        private: bool = False,
    ):
        await interaction.response.send_message(
            embed=discord.Embed(
                title="Generating Image",
                description="Please wait while we generate your image",
                color=discord.Color.blurple(),
            ),
            ephemeral=True,
        )

        if len(prompt) > 1500:
            await interaction.channel.send(
                embed=discord.Embed(
                    title="Error",
                    description="Prompt must be less than 1500 characters",
                    color=discord.Color.red(),
                )
            )
            return

        if width < 16 or height < 16:
            await interaction.channel.send(
                embed=discord.Embed(
                    title="Error",
                    description="Width and Height must be greater than 16",
                    color=discord.Color.red(),
                )
            )
            return

        try:
            model = model.value
        except:
            pass

        start = datetime.datetime.now()

        try:
            dic, image, is_nsfw = await generate_image(
                prompt, width, height, model, negative, cached, nologo, enhance, private
            )
        except Exception as e:
            import traceback
            print("Error in Imagine Cog")
            traceback.print_exc()
            await interaction.followup.send(
                embed=discord.Embed(
                    title="Error",
                    description=f"Error generating image : {e}",
                    color=discord.Color.red(),
                ),
                ephemeral=True,
            )
            return

        image_file = discord.File(image, filename="image.png")

        if is_nsfw:
            image_file.filename = f"SPOILER_{image_file.filename}"

        view = ImagineButtonView(link=dic["bookmark_url"])

        time_taken = datetime.datetime.now() - start

        context = f"## {prompt} - {interaction.user.mention}\n### Model - `{model}`  |  Time Taken - `{round(time_taken.total_seconds(), 2)} s`\n### Width - `{width} px`  |  Height - `{height} px`\n### Enchance - `{enhance}`"

        if private:
            response = await interaction.followup.send(
                context, file=image_file, ephemeral=True
            )
            return
        else:
            response = await interaction.channel.send(
                context, file=image_file, view=view
            )

        message_id = response.id
        dic["_id"] = message_id
        dic["channel_id"] = interaction.channel.id
        dic["user_id"] = interaction.user.id
        dic["guild_id"] = interaction.guild.id
        dic["bookmarks"] = []
        dic["author"] = interaction.user.id
        dic["likes"] = []

        user_data = get_user_data(interaction.user.id)
        if user_data is None:
            user_data = {
                "_id": interaction.user.id,
                "bookmarks": [],
                "likes": [],
                "prompts": [],
                "last_prompt": None,
            }
            save_user_data(interaction.user.id, user_data)

        user_data["prompts"].append(message_id)
        user_data["last_prompt"] = message_id

        update_user_data(interaction.user.id, user_data)
        save_prompt_data(message_id, dic)

    @imagine_command.error
    async def imagine_command_error(
        self, interaction: discord.Interaction, error: app_commands.AppCommandError
    ):
        if isinstance(error, app_commands.CommandOnCooldown):
            end_time = datetime.datetime.now() + datetime.timedelta(
                seconds=error.retry_after
            )
            end_time_str = end_time.strftime("%Y-%m-%d %H:%M:%S UTC")
            end_time_ts = f"<t:{int(end_time.timestamp())}>"

            hours, remainder = divmod(error.retry_after, 3600)
            minutes, seconds = divmod(remainder, 60)
            seconds = round(seconds)
            time_left = f"{ hours + ' hour, ' if not hours<1 else ''}{int(minutes)} minute{'s' if minutes != 1 else ''} and {seconds} second{'s' if seconds != 1 else ''}"

            embed = discord.Embed(
                title="⏳ Cooldown",
                description=f"You have to wait until **{end_time_ts}** ({time_left}) before using the </imagine:1123582901544558612> command again.",
                color=discord.Color.red(),
            )

            await interaction.response.send_message(embed=embed, ephemeral=True)


async def setup(bot):
    await bot.add_cog(Imagine(bot))
    print("Imagine cog loaded")
