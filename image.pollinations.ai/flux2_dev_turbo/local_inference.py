import requests
import base64
import time

url = "http://localhost:10003/generate"
start_time = time.time()
payload = {
    "prompts": ["joyous clipart of a cute corgi puppy playing with a colorful ball in a sunny park, vibrant colors, cartoon style"],
    "width":2048,   
    "height": 2048,   
    "steps": 9
}

response = requests.post(url, json=payload)
result = response.json()

img_data = base64.b64decode(result[0]["image"])
with open("output_16_9.jpg", "wb") as f:
    f.write(img_data)

print(f"Image saved as output_16_9.jpg in {time.time() - start_time} seconds")