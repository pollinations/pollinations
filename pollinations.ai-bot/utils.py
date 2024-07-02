import random
from constants import *
import aiohttp
import io
from urllib.parse import quote
from pymongo import MongoClient
import sys
import itertools
import json
from PIL import Image
from PIL.ExifTags import TAGS

client = MongoClient(MONGODB_URI)

try:
    client.admin.command("ping")
    print("\n Pinged your deployment. You successfully connected to MongoDB! \n")
except Exception as e:
    print(e)

db = client["pollinations"]
prompts = db["prompts"]
users = db["users"]
multi_prompts = db["multi_prompts"]

# Write users data to a JSON file on disk
try:
    users_data = list(users.find())
    with open('users_data.json', 'w') as file:
        json.dump(users_data, file, default=str)  # default=str to handle ObjectId serialization
    print("\n Users data has been written to users_data.json \n")
except Exception as e:
    print(e)

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
    10: "1️⃣0️⃣",
}


def get_prompt_data(message_id: int):
    try:
        return prompts.find_one({"_id": message_id})
    except Exception as e:
        print(e)
        return None


def save_prompt_data(message_id: int, data: dict):
    try:
        prompts.insert_one(data)
    except Exception as e:
        print(e)


def update_prompt_data(message_id: int, data: dict):
    try:
        prompts.update_one({"_id": message_id}, {"$set": data})
    except Exception as e:
        print(e)


def delete_prompt_data(message_id: int):
    try:
        prompts.delete_one({"_id": message_id})
    except Exception as e:
        print(e)


def get_multi_imagined_prompt_data(message_id: int):
    try:
        return multi_prompts.find_one({"_id": message_id})
    except Exception as e:
        print(e)
        return None


def save_multi_imagined_prompt_data(message_id: int, data: dict):
    try:
        multi_prompts.insert_one(data)
    except Exception as e:
        print(e)


def update_multi_imagined_prompt_data(message_id: int, data: dict):
    try:
        multi_prompts.update_one({"_id": message_id}, {"$set": data})
    except Exception as e:
        print(e)


def delete_multi_imagined_prompt_data(message_id: int):
    try:
        multi_prompts.delete_one({"_id": message_id})
    except Exception as e:
        print(e)


def get_prompts_counts():
    try:
        return prompts.count_documents({})
    except Exception as e:
        print(e)
        return None


def get_user_data(user_id: int):
    try:
        return users.find_one({"_id": user_id})
    except Exception as e:
        print(e)
        return None


def save_user_data(user_id: int, data: dict):
    try:
        users.insert_one(data)
    except Exception as e:
        print(e)


def update_user_data(user_id: int, data: dict):
    try:
        users.update_one({"_id": user_id}, {"$set": data})
    except Exception as e:
        print(e)


def generate_global_leaderboard():
    try:
        documents = users.find()


        data = {doc["_id"]: len(doc["prompts"]) for doc in documents}

        sorted_data = dict(sorted(data.items(), key=lambda item: item[1], reverse=True))

        top_10_users = dict(itertools.islice(sorted_data.items(), 10))
        return top_10_users

    except Exception as e:
        print(e)
        return None


def read_json_from_exif(file_path):
    # Open the image file
    with Image.open(file_path) as img:
        # Extract EXIF data
        exif_data = img._getexif()

        # Find the 'UserComment' tag key
        user_comment_key = next(
            key for key, value in TAGS.items() if value == "UserComment"
        )

        # Extract the UserComment
        user_comment = exif_data.get(user_comment_key)

        if user_comment:
            try:
                user_comment_decoded = user_comment.decode("ascii")
                user_comment_decoded = user_comment_decoded[
                    user_comment_decoded.find("{") :
                ]
                json_data = json.loads(user_comment_decoded)
                return json_data
            except Exception as e:
                raise e
        else:
            return "No UserComment found in EXIF data."


async def generate_image(
    prompt: str,
    width: int = 500,
    height: int = 500,
    model: str = "turbo",
    negative: str | None = None,
    cached: bool = False,
    nologo: bool = False,
    enhance: bool = True,
    private: bool = False,
    **kwargs,
):
    model = model.lower()

    print(
        f"Generating image with prompt: {prompt}, width: {width}, height: {height}, model: {model}, negative: {negative}, cached: {cached}, nologo: {nologo}, enhance: {enhance}",
        file=sys.stderr,
    )

    seed = str(random.randint(0, 1000000000))

    url = f"https://image.pollinations.ai/prompt/{prompt}"
    url += f"?seed={seed}" if not cached else ""
    url += f"&width={width}"
    url += f"&height={height}"
    url += f"&model={model}" if model else ""
    url += f"&negative={negative}" if negative else ""
    url += f"&nologo={nologo}" if nologo else ""
    url += f"&enhance={enhance}" if enhance == False else ""
    url += f"&nofeed={private}" if private else ""
    url += "&referer=discordbot"

    dic = {
        "prompt": prompt,
        "width": width,
        "height": height,
        "model": model,
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
            image_file = io.BytesIO(image_data)
            image_file.seek(0)

            image_file2 = io.BytesIO(image_data)
            image_file2.seek(0)
    try:
        json_data = read_json_from_exif(image_file2)
        is_nsfw = json_data["0"]["has_nsfw_concept"]
    except Exception as e:
        print(e)
        is_nsfw = False

    return (dic, image_file, is_nsfw)
