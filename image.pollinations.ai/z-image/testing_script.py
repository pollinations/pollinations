import requests

url = "http://localhost:10002/generate"
payload = {
    "prompts": ["a cat wearing sunglasses"],
    "width": 1024,
    "height": 1024,
    "steps": 9
}
headers = {
    "Content-Type": "application/json"
}

response = requests.post(url, json=payload, headers=headers)
print(response.text)