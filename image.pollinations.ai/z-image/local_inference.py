import requests
import base64
import time

url = "http://localhost:10002/generate"
start_time = time.time()
payload = {
    "prompts": ["A couple having coffee in a modern cafe, 16:9 aspect ratio"],
    "width": 768,   
    "height":  768,   
    "steps": 9
}

response = requests.post(url, json=payload)
result = response.json()

img_data = base64.b64decode(result[0]["image"])
with open("output_16_9.jpg", "wb") as f:
    f.write(img_data)

print(f"Image saved as output_16_9.jpg in {time.time() - start_time} seconds")