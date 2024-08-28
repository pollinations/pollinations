import random
import aiohttp
import io
from urllib.parse import quote
import sys
import json
from PIL import Image
import piexif
import discord
import datetime

# Load user data from JSON file
def load_user_data():
    with open('users_data.json', 'r') as file:
        return json.load(file)

# Save user data to JSON file
def save_user_data(data):
    with open('users_data.json', 'w') as file:
        json.dump(data, file, indent=4)

# Load data initially
user_data = load_user_data()

NUMBER_EMOJIES = {
    1: "🥇",
    2: "🥈",
    3: "🥉",
    4: "4️⃣",
    5: "5️⃣",
    6: "6️⃣",
    7: "7️⃣",
    8: "8️⃣",
    9: "9️⃣",
    10: "🔟",
}

waiting_gifs = [
    "https://media3.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif?cid=ecf05e475p246q1gdcu96b5mkqlqvuapb7xay2hywmki7f5q&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media2.giphy.com/media/QBd2kLB5qDmysEXre9/giphy.gif?cid=ecf05e47ha6xwa7rq38dcst49nefabwwrods631hvz67ptfg&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media2.giphy.com/media/ZgqJGwh2tLj5C/giphy.gif?cid=ecf05e47gflyso481izbdcrw7y8okfkgdxgc7zoh34q9rxim&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://media0.giphy.com/media/EWhLjxjiqdZjW/giphy.gif?cid=ecf05e473fifxe2bg4act0zq73nkyjw0h69fxi52t8jt37lf&ep=v1_gifs_search&rid=giphy.gif&ct=g",
    "https://i.giphy.com/26BRuo6sLetdllPAQ.webp",
    "https://i.giphy.com/tXL4FHPSnVJ0A.gif",
]


class PromptTooLongError(discord.app_commands.AppCommandError):
    pass


class DimensionTooSmallError(discord.app_commands.AppCommandError):
    pass


def get_prompt_data(message_id: int):
    try:
        for user in user_data:
            for prompt in user.get("prompts", []):
                if prompt == message_id:
                    return prompt
        return None
    except Exception as e:
        print(e)
        return None


def save_prompt_data(message_id: int, data: dict):
    try:
        for user in user_data:
            if user["_id"] == data["_id"]:
                user["prompts"].append(message_id)
                save_user_data(user_data)
                return
        user_data.append(data)
        save_user_data(user_data)
    except Exception as e:
        print(e)


def update_prompt_data(message_id: int, data: dict):
    try:
        for user in user_data:
            for i, prompt in enumerate(user.get("prompts", [])):
                if prompt == message_id:
                    user["prompts"][i] = data
                    save_user_data(user_data)
                    return
    except Exception as e:
        print(e)


def delete_prompt_data(message_id: int):
    try:
        for user in user_data:
            if message_id in user.get("prompts", []):
                user["prompts"].remove(message_id)
                save_user_data(user_data)
                return
    except Exception as e:
        print(e)


def get_prompts_counts():
    try:
        return sum(len(user.get("prompts", [])) for user in user_data)
    except Exception as e:
        print(e)
        return None


def get_user_data(user_id: int):
    try:
        for user in user_data:
            if user["_id"] == user_id:
                return user
        return None
    except Exception as e:
        print(e)
        return None


def save_user_data(user_id: int, data: dict):
    try:
        for user in user_data:
            if user["_id"] == user_id:
                user.update(data)
                save_user_data(user_data)
                return
        user_data.append(data)
        save_user_data(user_data)
    except Exception as e:
        print(e)


def update_user_data(user_id: int, data: dict):
    try:
        for user in user_data:
            if user["_id"] == user_id:
                user.update(data)
                save_user_data(user_data)
                return
    except Exception as e:
        print(e)



def generate_global_leaderboard():
    try:
        top_10_users = sorted(user_data, key=lambda x: len(x.get("prompts", [])), reverse=True)[:10]
        top_10_users = {user["_id"]: len(user.get("prompts", [])) for user in top_10_users}
        return top_10_users
    except Exception as e:
        print(e)
        return None


async def generate_error_message(
    interaction: discord.Interaction,
    error,
    cooldown_configuration=[
        "- ```1 time every 10 seconds```",
        "- ```5 times every 60 seconds```",
        "- ```200 times every 24 hours```",
    ],
):
    end_time = datetime.datetime.now() + datetime.timedelta(seconds=error.retry_after)
    end_time_ts = int(end_time.timestamp())

    embed = discord.Embed(
        title="⏳ Cooldown",
        description=f"### You can use this command again <t:{end_time_ts}:R>",
        color=discord.Color.red(),
        timestamp=interaction.created_at,
    )
    embed.set_image(url=random.choice(waiting_gifs))

    embed.add_field(
        name="How many times can I use this command?",
        value="\n".join(cooldown_configuration),
        inline=False,
    )

    try:
        embed.set_footer(
            text=f"{interaction.user} used /{interaction.command.name}",
            icon_url=interaction.user.avatar,
        )
    except:
        embed.set_footer(
            text=f"{interaction.user} used /{interaction.command.name}",
            icon_url=interaction.user.default_avatar,
        )

    return embed


def extract_user_comment(image_bytes):
    image = Image.open(io.BytesIO(image_bytes))
    exif_data = piexif.load(image.info["exif"])
    user_comment = exif_data.get("Exif", {}).get(piexif.ExifIFD.UserComment, None)

    if user_comment:
        try:
            return user_comment.decode("utf-8")
        except UnicodeDecodeError:
            return "No user comment found."
    else:
        return "No user comment found."


async def generate_image(
    prompt: str,
    width: int = 800,
    height: int = 800,
    model: str = "flux",
    negative: str | None = None,
    cached: bool = False,
    nologo: bool = False,
    enhance: bool = False,
    private: bool = False,
    **kwargs,
):
    print(
        f"Generating image with prompt: {prompt}, width: {width}, height: {height}, negative: {negative}, cached: {cached}, nologo: {nologo}, enhance: {enhance}",
        file=sys.stderr,
    )

    seed = str(random.randint(0, 1000000000))

    url = f"https://image.pollinations.ai/prompt/{prompt}"
    url += f"?seed={seed}" if not cached else ""
    url += f"&width={width}"
    url += f"&height={height}"
    url += f"&model={model}"
    url += f"&negative={negative}" if negative else ""
    url += f"&nologo={nologo}" if nologo else ""
    url += f"&enhance={enhance}" if enhance else ""
    url += f"&nofeed={private}" if private else ""
    url += "&referer=discordbot"

    dic = {
        "prompt": prompt,
        "width": width,
        "height": height,
        "negative": negative,
        "cached": cached,
        "nologo": nologo,
        "enhance": enhance,
        "bookmark_url": quote(url, safe=":/&=?"),
    }

    dic["seed"] = seed if not cached else None

    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            response.raise_for_status()  # Raise an exception for non-2xx status codes
            image_data = await response.read()

            if image_data:
                user_comment = extract_user_comment(image_data)

            image_file = io.BytesIO(image_data)
            image_file.seek(0)

            try:
                user_comment = user_comment[user_comment.find("{") :]
                user_comment = json.loads(user_comment)
                dic["nsfw"] = user_comment["has_nsfw_concept"]
                if enhance or len(prompt) < 80:
                    enhance_prompt = user_comment["prompt"]
                    enhance_prompt = enhance_prompt[: enhance_prompt.rfind("\n")]
                    dic["enhanced_prompt"] = enhance_prompt
            except Exception as e:
                print(e)
                dic["nsfw"] = False

    return (dic, image_file)
