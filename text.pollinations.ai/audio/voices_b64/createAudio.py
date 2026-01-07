import requests
import urllib.parse
from dotenv import load_dotenv
import os 
load_dotenv()

text = """
Say exactly in around 5-8s audio: Welcome to Elixpo, where innovation meets imagination and technology transforms your world into endless possibilities of tomorrow.
"""



voices = ["amuch", "marin", "cedar"]
model = "openai-audio"
token = os.getenv("POLLI_TOKEN")
base_url = "https://gen.pollinations.ai/text/"
encoded_text = urllib.parse.quote(text.strip().replace('\n', ' '))
header = {
    "content-type": "application/json",
    "authorization": f"Bearer {token}"
}
for voice in voices:
    print(f"Generating audio for voice: {voice}")
    url = f"{base_url}{encoded_text}?model={model}&voice={voice}&seed=24"
    response = requests.get(url, headers=header)
    if response.status_code == 200:
        with open(f"voices_b64/raw_wav/{voice}.wav", "wb") as f:
            f.write(response.content)
    else:
        print(f"Request failed with status code {response.status_code}")
print("Audio generation completed for all voices.")