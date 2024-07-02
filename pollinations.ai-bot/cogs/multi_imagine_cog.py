import datetime
import discord
from discord import app_commands, ui
from discord.ext import commands

from utils import *
from constants import *


class Multi_imagine(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    async def cog_load(self):
        await self.bot.wait_until_ready()
        self.bot.add_view(self.multiImagineButtonView())

    async def regenerate(
        interaction: discord.Interaction,
        button: discord.ui.Button,
        data: dict,
        model_no: int,
    ):
        data["model"] = MODELS[model_no]

        start = datetime.datetime.now()

        dic, img, is_nsfw = await generate_image(**data)

        image_file = discord.File(img, "image.png")
        if is_nsfw:
            image_file.filename = f"SPOILER_{image_file.filename}"

        time_taken = datetime.datetime.now() - start

        context = f"## {data['prompt']} - {interaction.user.mention}\n### Model - `{MODELS[model_no]}`  |  Time Taken - `{round(time_taken.total_seconds(), 2)} s`\n### Width - `{data['width']} px`  |  Height - `{data['height']} px`\n### Enchance - `{data['enhance']}`"

        response = await interaction.channel.send(context, file=image_file)

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

    class multiImagineButtonView(discord.ui.View):
        def __init__(self):
            super().__init__(timeout=None)

        @discord.ui.button(
            label="V1", style=discord.ButtonStyle.secondary, custom_id="v1"
        )
        async def regerate_1(
            self, interaction: discord.Interaction, button: discord.ui.Button
        ):
            await interaction.response.send_message(
                embed=discord.Embed(
                    title="Regenerating Image with model 1",
                    description="Please wait while we regenerate your image",
                    color=discord.Color.blurple(),
                ),
                ephemeral=True,
            )
            data = get_multi_imagined_prompt_data(interaction.message.id)

            await Multi_imagine.regenerate(interaction, button, data, 0)

        @discord.ui.button(
            label="V2", style=discord.ButtonStyle.secondary, custom_id="v2"
        )
        async def regerate_2(
            self, interaction: discord.Interaction, button: discord.ui.Button
        ):
            await interaction.response.send_message(
                embed=discord.Embed(
                    title="Regenerating Image with model 2",
                    description="Please wait while we regenerate your image",
                    color=discord.Color.blurple(),
                ),
                ephemeral=True,
            )
            data = get_multi_imagined_prompt_data(interaction.message.id)

            await Multi_imagine.regenerate(interaction, button, data, 1)

        @discord.ui.button(
            label="V3", style=discord.ButtonStyle.secondary, custom_id="v3"
        )
        async def regerate_3(
            self, interaction: discord.Interaction, button: discord.ui.Button
        ):
            await interaction.response.send_message(
                embed=discord.Embed(
                    title="Regenerating Image with model 3",
                    description="Please wait while we regenerate your image",
                    color=discord.Color.blurple(),
                ),
                ephemeral=True,
            )
            data = get_multi_imagined_prompt_data(interaction.message.id)

            await Multi_imagine.regenerate(interaction, button, data, 2)

        @discord.ui.button(
            label="V4", style=discord.ButtonStyle.secondary, custom_id="v4"
        )
        async def regerate_4(
            self, interaction: discord.Interaction, button: discord.ui.Button
        ):
            await interaction.response.send_message(
                embed=discord.Embed(
                    title="Regenerating Image with model 4",
                    description="Please wait while we regenerate your image",
                    color=discord.Color.blurple(),
                ),
                ephemeral=True,
            )
            data = get_multi_imagined_prompt_data(interaction.message.id)

            await Multi_imagine.regenerate(interaction, button, data, 3)

        # @discord.ui.button(label="V5", style=discord.ButtonStyle.secondary, custom_id="v5")
        # async def regerate_5(self, interaction: discord.Interaction, button: discord.ui.Button):
        #     await interaction.response.send_message(embed=discord.Embed(title="Regenerating Image with model 5", description="Please wait while we regenerate your image", color=discord.Color.blurple()), ephemeral=True)
        #     data = get_multi_imagined_prompt_data(interaction.message.id)

        #     await Multi_imagine.regenerate(interaction, button, data, 4)

        # @discord.ui.button(label="V6", style=discord.ButtonStyle.secondary, custom_id="v6")
        # async def regerate_6(self, interaction: discord.Interaction, button: discord.ui.Button):
        #     await interaction.response.send_message(embed=discord.Embed(title="Regenerating Image with model 6", description="Please wait while we regenerate your image", color=discord.Color.blurple()), ephemeral=True)
        #     data = get_multi_imagined_prompt_data(interaction.message.id)

        #     await Multi_imagine.regenerate(interaction, button, data, 5)

        # @discord.ui.button(label="V7", style=discord.ButtonStyle.secondary, custom_id="v7")
        # async def regerate_7(self, interaction: discord.Interaction, button: discord.ui.Button):
        #     await interaction.response.send_message(embed=discord.Embed(title="Regenerating Image with model 7", description="Please wait while we regenerate your image", color=discord.Color.blurple()), ephemeral=True)
        #     data = get_multi_imagined_prompt_data(interaction.message.id)

        #     await Multi_imagine.regenerate(interaction, button, data, 6)

        # @discord.ui.button(label="V8", style=discord.ButtonStyle.secondary, custom_id="v8")
        # async def regerate_8(self, interaction: discord.Interaction, button: discord.ui.Button):
        #     await interaction.response.send_message(embed=discord.Embed(title="Regenerating Image with model 8", description="Please wait while we regenerate your image", color=discord.Color.blurple()), ephemeral=True)
        #     data = get_multi_imagined_prompt_data(interaction.message.id)

        #     await Multi_imagine.regenerate(interaction, button, data, 7)

        @discord.ui.button(
            style=discord.ButtonStyle.red,
            custom_id="multiimagine_delete",
            emoji="<:delete:1187102382312652800>",
        )
        async def delete(
            self, interaction: discord.Interaction, button: discord.ui.Button
        ):
            try:
                data = get_multi_imagined_prompt_data(interaction.message.id)
                author_id = data["author"]

                try:
                    author_id = int(author_id)
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

                delete_multi_imagined_prompt_data(interaction.message.id)
                await interaction.message.delete()
                return

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

    @app_commands.command(name="multi-imagine", description="Imagine multiple prompts")
    @app_commands.checks.cooldown(1, 30)
    @app_commands.guild_only()
    @app_commands.describe(
        prompt="Imagine a prompt",
        height="Height of the image",
        width="Width of the image",
        negative="The things not to include in the image",
        cached="Removes the image seed",
        nologo="Remove the logo",
        enhance="Disables Prompt enhancing if set to False",
        private="Only you can see the generated Image if set to True",
    )
    async def multiimagine_command(
        self,
        interaction,
        prompt: str,
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

        images = []
        image_urls = {}
        description = ""
        counter = 1

        start = datetime.datetime.now()

        for i in MODELS:
            try:
                time = datetime.datetime.now()
                dic, image, is_nsfw = await generate_image(
                    prompt, width, height, i, negative, cached, nologo, enhance, private
                )

                image_urls[i] = dic["bookmark_url"]

                time_taken = datetime.datetime.now() - time
                await interaction.followup.send(
                    f"Generated `{i} model` Image in `{round(time_taken.total_seconds(), 2)}` seconds ✅",
                    ephemeral=True,
                )

                description += f"**Image {counter} model** :  `{i}`\n"
                counter += 1

                images.append(image)
            except Exception as e:
                print(e)
                await interaction.followup.send(
                    embed=discord.Embed(
                        title=f"Error generating image of `{i}` model",
                        description=f"{e}",
                        color=discord.Color.red(),
                    ),
                    ephemeral=True,
                )

        files = []

        for idx, img in enumerate(images):
            file_name = (
                f"{prompt}_{idx}.png" if not is_nsfw else f"SPOILER_{prompt}_{idx}.png"
            )
            files.append(discord.File(img, file_name))

        multi_imagine_view = self.multiImagineButtonView()

        time_taken = datetime.datetime.now() - start

        context = f"## {prompt} - {interaction.user.mention}\n{description}### Total Time Taken - `{round(time_taken.total_seconds(), 2)} s`  |  Enchance - `{enhance}`\n### Width - `{width} px`  |  Height - `{height} px`"

        if not len(files) == 0:
            if private:
                response = await interaction.followup.send(
                    context, files=files, ephemeral=True
                )
            else:
                response = await interaction.channel.send(
                    context, files=files, view=multi_imagine_view
                )
        else:
            await interaction.followup.send(
                embed=discord.Embed(
                    title="Error",
                    description="No images were generated",
                    color=discord.Color.red(),
                ),
                ephemeral=True,
            )
            return

        message_id = response.id
        dic["_id"] = message_id
        dic["channel_id"] = interaction.channel.id
        dic["user_id"] = interaction.user.id
        dic["guild_id"] = interaction.guild.id
        dic["urls"] = image_urls
        dic["author"] = interaction.user.id
        dic["nsfw"] = is_nsfw

        del dic["bookmark_url"]
        del dic["seed"]
        del dic["model"]

        save_multi_imagined_prompt_data(message_id, dic)

    @multiimagine_command.error
    async def multiimagine_command_error(
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
                description=f"You have to wait until **{end_time_ts}** ({time_left}) before using the </multi-imagine:1187375074722975837> again.",
                color=discord.Color.red(),
            )

            await interaction.response.send_message(embed=embed, ephemeral=True)


async def setup(bot):
    await bot.add_cog(Multi_imagine(bot))
    print("Multi-Imagine cog loaded")
