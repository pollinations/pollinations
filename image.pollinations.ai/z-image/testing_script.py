import requests
import io
from PIL import Image
import base64
import os

health_url = "http://localhost:10002/health"
health_response = requests.get(health_url)
print("Health:", health_response.json())

url = "http://localhost:10002/generate"
payload = {
    "prompts": ["a cat wearing sunglasses"],
    "width": 1024,
    "height": 1024,
    "steps": 9,
    "seed": None
}

headers = {}
token = os.getenv("ENTER_TOKEN")
if token:
    headers["x-enter-token"] = token

response = requests.post(url, json=payload, headers=headers)
print("Status Code:", response.status_code)
print("Response:", response.text)

if response.status_code == 200:
    result = response.json()[0]
    img_data = base64.b64decode(result["image"])
    img = Image.open(io.BytesIO(img_data))
    img.save("output.jpg", "JPEG")
    print("Width:", img.width)
    print("Height:", img.height)