import datetime
import discord
from discord import app_commands, ui
from discord.ext import commands

from utils import *
from constants import *


class Multi_pollinate(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    async def cog_load(self):
        await self.bot.wait_until_ready()
        self.bot.add_view(self.multiImagineButtonView())

    async def get_info(interaction: discord.Interaction, index: int):

        indexes = ["1st", "2nd", "3rd", "4th"]

        data = get_multi_imagined_prompt_data(interaction.message.id)
        seed = data["urls"][index].split("?")[-1].split("&")[0]

        url = f"https://image.pollinations.ai/prompt/{data['prompt']}"
        url += f"?{seed}"
        url += f"&width={data['width']}"
        url += f"&height={data['height']}"
        url += f"&negative={data['negative']}" if 'negative' in data and data['negative'] else ''
        url += f"&nologo=true"
        url += f"&enhance={data['enhance']}" if 'enhance' in data and data['enhance'] else ''

        if index % 2 == 0:
            url += f"&model=turbo"
        else:
            url += f"&model=flux"

        async with aiohttp.ClientSession() as session:
            async with session.get(data['urls'][index]) as response:
                response.raise_for_status()
                image_data = await response.read()

                if image_data:
                    user_comment = extract_user_comment(image_data)

                image_file = io.BytesIO(image_data)
                image_file.seek(0)

        image_file = discord.File(image_file, "image.png")

        try:
            user_comment = user_comment[user_comment.find("{") :]
            user_comment = json.loads(user_comment)

            if user_comment["0"]["has_nsfw_concept"]:
                image_file.filename = f"SPOILER_{image_file.filename}"
                data["nsfw"] = True

            enhanced_prompt = user_comment["0"]["prompt"]
            enhanced_prompt = enhanced_prompt[: enhanced_prompt.rfind("\n")]
            data["enhanced_prompt"] = enhanced_prompt

        except Exception as e:
            print(e)
            pass

        embed = discord.Embed(
                title=f"{indexes[index]} Image",
                description="",
            )

        embed.set_image(url=f"attachment://image.png")

        if len(data["urls"][index]) < 512:
            embed.url = data["urls"][index]

        if "enhanced_prompt" in data:
            embed.add_field(name="Enhanced Prompt", value=f"```{data['enhanced_prompt'][:1020]+"..." if len(data['enhanced_prompt']) > 1024 else data['enhanced_prompt']}```", inline=False)

        return embed, image_file

    class multiImagineButtonView(discord.ui.View):
        def __init__(self, image_count=4):
            super().__init__(timeout=None)

            self.image_count = image_count
            self.create_buttons()

        def create_buttons(self):
            for i in range(self.image_count):
                self.add_item(
                    discord.ui.Button(
                        label=f"U{i+1}",
                        style=discord.ButtonStyle.secondary,
                        custom_id=f"U{i+1}"
                    )
                )
            self.add_item(
                discord.ui.Button(
                    label="",
                    style=discord.ButtonStyle.danger,
                    custom_id="multiimagine_delete",
                    emoji="<:delete:1187102382312652800>",
                )
            )

        async def interaction_check(self, interaction: discord.Interaction) -> bool:
            custom_id = interaction.data['custom_id']
            if custom_id.startswith("U"):
                index = int(custom_id[1]) - 1
                await self.regenerate_image(interaction, index)
                await self.disable_button(interaction, custom_id)
                return True
            elif custom_id == "multiimagine_delete":
                await self.delete_image(interaction)
                return True
            return False

        async def regenerate_image(self, interaction: discord.Interaction, index: int):
            await interaction.response.defer(ephemeral=True)
            embed, image = await Multi_pollinate.get_info(interaction, index)
            await interaction.followup.send(embed=embed, file=image)

        async def disable_button(self, interaction: discord.Interaction, custom_id: str):
            for item in self.children:
                if isinstance(item, discord.ui.Button) and item.custom_id == custom_id:
                    item.disabled = True
                    break

            await interaction.message.edit(view=self)

        async def delete_image(self, interaction: discord.Interaction):
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

    @app_commands.command(name="multi-pollinate", description="Imagine multiple prompts")
    @app_commands.checks.cooldown(1, 30)
    @app_commands.guild_only()
    @app_commands.describe(
        prompt="Prompt of the Image you want want to generate",
        height="Height of the Image",
        width="Width of the Image",
        enhance="Enables AI Prompt Enhancement",
        negative="The things not to include in the Image",
        cached="Uses the Default seed",
        nologo="Remove the Logo",
        private="Only you can see the generated Image if set to True",
    )
    async def multiimagine_command(
        self,
        interaction: discord.Interaction,
        prompt: str,
        width: int = 1000,
        height: int = 1000,
        enhance: bool | None = None,
        negative: str | None = None,
        cached: bool = False,
        nologo: bool = False,
        private: bool = False,
    ):

        await interaction.response.send_message(
            embed=discord.Embed(
                title="Generating Image",
                description="Please wait while we generate your image",
                color=discord.Color.blurple(),
            ),
            ephemeral=True if private else False,
        )

        response = await interaction.original_response()

        if len(prompt) > 2000:
            raise PromptTooLongError("Prompt must be less than 2000 characters")

        if width < 16 or height < 16:
            raise DimensionTooSmallError("Width and Height must be greater than 16")

        image_urls = []

        start = datetime.datetime.now()

        embeds = []
        files = []
        positions = ["1st", "2nd", "3rd", "4th"]

        for i in range(4):
            try:
                time = datetime.datetime.now()
                if i % 2 == 0:
                    model = "turbo"
                else:
                    model = "flux"

                dic, image = await generate_image(
                    prompt, width, height, model, negative, cached, nologo, enhance, private
                )

                image_urls.append(dic["bookmark_url"])

                time_taken = datetime.datetime.now() - time

                if private:
                    await interaction.followup.send(
                        f"Generated **{positions[i]} Image** in `{round(time_taken.total_seconds(), 2)}` seconds ✅",
                        ephemeral=True,
                    )
                else:
                    embed = discord.Embed(title="Generating Image", description=f"Generated **{positions[i]} Image** in `{round(time_taken.total_seconds(), 2)}` seconds ✅", color=discord.Color.blurple())
                    await response.edit(embeds=[embed])

                image_file = discord.File(image, f"image_{i}.png")
                files.append(image_file)

                embed = discord.Embed(timestamp=datetime.datetime.now(datetime.timezone.utc), description=f"", title="")
                embed.set_image(url=f"attachment://image_{i}.png")
                embeds.append(embed)

            except Exception as e:
                print(e)
                if private:
                    await interaction.followup.send(
                        embed=discord.Embed(
                            title=f"Error generating image of `{i}` model",
                            description=f"{e}",
                            color=discord.Color.red(),
                        ),
                        ephemeral=True,
                    )
                else:
                    await response.edit(
                        embeds=[discord.Embed(
                            title=f"Error generating image of `{i}` model",
                            description=f"{e}",
                            color=discord.Color.red(),
                        )])

        multi_imagine_view = self.multiImagineButtonView(image_count=len(embeds))

        time_taken = datetime.datetime.now() - start

        for i in range(len(embeds)):
            embeds[i].url = image_urls[0]

        embeds[0].add_field(name="Prompt", value=f"```{prompt}```", inline=False)
        embeds[0].add_field(name="Total Time Taken", value=f"```{round(time_taken.total_seconds(), 2)} s```", inline=True)

        embeds[0].set_footer(text=f"Generated by {interaction.user}")


        if not len(files) == 0:
            if private:
                response = await interaction.followup.send(
                    embeds=embeds, files=files, ephemeral=True
                )
            else:
                await response.edit(embeds=embeds, view=multi_imagine_view, attachments=files)
        else:
            if private:
                await interaction.followup.send(
                    embed=discord.Embed(
                        title="Error",
                        description="No images were generated",
                        color=discord.Color.red(),
                    ),
                    ephemeral=True,
                )
            else:
                await response.edit(
                    embeds=[discord.Embed(
                        title="Error",
                        description="No images were generated",
                        color=discord.Color.red(),
                    )])
            return

        message_id = response.id
        dic["_id"] = message_id
        dic["channel_id"] = interaction.channel.id
        dic["user_id"] = interaction.user.id
        dic["guild_id"] = interaction.guild.id
        dic["urls"] = image_urls
        dic["author"] = interaction.user.id

        del dic["bookmark_url"]
        del dic["seed"]
        try:
            del dic["enhanced_prompt"]
        except:
            pass

        save_multi_imagined_prompt_data(message_id, dic)

    @multiimagine_command.error
    async def multiimagine_command_error(
        self, interaction: discord.Interaction, error: app_commands.AppCommandError
    ):
        if isinstance(error, app_commands.CommandOnCooldown):
            embed = await generate_error_message(
                interaction,
                error,
                cooldown_configuration=["- ```1 time every 30 seconds```"],
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)
        else:
            embed = discord.Embed(
                title="An error occurred while generating the image",
                description=f"```cmd\n{error}\n```",
                color=discord.Color.red(),
            )
            try:
                await interaction.followup.send(embed=embed, ephemeral=True)
            except:
                try:
                    await interaction.edit_original_response(embed=embed)
                except:
                    await interaction.response.send_message(embed=embed, ephemeral=True)


async def setup(bot):
    await bot.add_cog(Multi_pollinate(bot))
    print("Multi-Imagine cog loaded")
