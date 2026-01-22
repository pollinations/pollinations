import requests
import sys
from pathlib import Path
import os
from dotenv import load_dotenv
load_dotenv()

def generate_image(
    prompt: str,
    width: int = 1024,
    height: int = 576,
    output_path: str = "output.jpg"
) -> str:
    url = os.getenv("MODAL_ENDPOINT")
    payload = {
        "prompt": prompt,
        "width": width,
        "height": height
    }
    
    try:
        response = requests.post(url, json=payload, timeout=300)
        response.raise_for_status()
        
        # Save the image
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(response.content)
        
        print(f"Image saved to: {output_path}")
        return output_path
        
    except requests.exceptions.RequestException as e:
        print(f"Error generating image: {e}")
        raise

if __name__ == "__main__":
    prompt = "An elderly Japanese man wearing a traditional indigo noragi jacket sits at a wooden table, hands folded around a ceramic teacup. Behind him, a shoji screen diffuses pale daylight into the room. The camera frames him in a centered medium shot, symmetrical and restrained. Soft, even lighting reveals fine wrinkles and wood grain details, lending a tactile realism. The restrained composition conveys quiet dignity and ritual."
    # 16:9 aspect ratio (1024x576)
    generate_image(prompt, width=1024, height=576)