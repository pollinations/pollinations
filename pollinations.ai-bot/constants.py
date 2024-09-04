import os
from dotenv import load_dotenv
import requests
import json

load_dotenv(override=True)

TOKEN = os.environ["TOKEN"]
# MONGODB_URI = os.environ["MONGODB_URI"]

r = requests.get("https://image.pollinations.ai/models")
MODELS = json.loads(r.text)
