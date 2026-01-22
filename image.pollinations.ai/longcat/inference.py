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
    prompt = "A young Asian woman, wearing a yellow knitted sweater and a white necklace, sits with her hands resting on her knees, her expression serene. Behind her is a rough brick wall, and the warm afternoon sunlight falls gently upon her, creating a peaceful and inviting atmosphere. The camera uses a medium shot, highlighting her expression and the details of her clothing. Soft light illuminates her face, emphasizing her features and the texture of her accessories, adding depth and warmth to the image. The overall composition is simple, with the texture of the brick wall and the interplay of light and shadow complementing each other, emphasizing the woman's elegance and composure."
    # 16:9 aspect ratio (1024x576)
    generate_image(prompt, width=1024, height=576)