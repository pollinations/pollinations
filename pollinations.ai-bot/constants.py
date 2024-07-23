import os
from dotenv import load_dotenv

load_dotenv(override=True)

TOKEN = os.environ["TOKEN"]
MONGODB_URI = os.environ["MONGODB_URI"]
MODELS = [
    "dreamshaper",
    "swizz8",
    "deliberate",
    "juggernaut",
]
