import requests
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
    params = {
        "prompt": prompt,
        "width": width,
        "height": height
    }
    
    try:
        response = requests.get(url + "/generate", params=params, timeout=300)
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
    prompt = "A young Asian woman, wearing a yellow cardigan and a white necklace, rests her hands on her knees, her expression serene. The background is a rough brick wall, bathed in the warm afternoon sun, creating a tranquil and inviting atmosphere. The mid-distance shot emphasizes her expression and the details of her clothing. Soft light falls on her face, highlighting her features and the texture of her accessories, adding depth and approachability to the image. The overall composition is simple; the texture of the brick wall and the interplay of sunlight complement each other, highlighting the woman's elegance and composure."
    generate_image(prompt, width=2048, height=1152)
    