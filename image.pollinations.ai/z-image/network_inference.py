import requests
import io
from PIL import Image
import base64
import os 
from dotenv import load_dotenv
from urllib.parse import quote
load_dotenv()


url = f"https://gen.pollinations.ai/image/{quote('joyous clipart of a cute corgi puppy playing with a colorful ball in a sunny park, vibrant colors, cartoon style')}"
params = {
    "model": "zimage",
    "width": 1024,
    "height": 1024,
    "seed": 42,
    "enhance": "false",
    "negative_prompt": "worst quality, blurry",
    "private": "false",
    "nologo": "false",
    "nofeed": "false",
    "safe": "false",
    "quality": "medium",
    "image": "",
    "transparent": "false",
    "guidance_scale": 1,
    "aspectRatio": "9:16",  
    "audio": "false"
}

header = {
    "Authorization": f"Bearer {os.getenv('TOKEN')}"
}
response = requests.get(url, params=params, headers=header)
print("Status Code:", response.status_code)

if response.status_code == 200:
    img = Image.open(io.BytesIO(response.content))
    img.save("output.jpg", "JPEG")
    print("Width:", img.width)
    print("Height:", img.height)
    print("Image saved as output.jpg")
else:
    print("Response:", response.text)