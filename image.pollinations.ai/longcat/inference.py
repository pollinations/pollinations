import requests
from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

def generate_image(
    prompt: str,
    width: int = 1024,
    height: int = 576,
    image: str | None = None,
    output_path: str = "output.jpg"
) -> str:
    url = os.getenv("MODAL_ENDPOINT")
    params = {
        "prompt": prompt,
        "width": width,
        "height": height
    }
    
    if image:
        params["image"] = image
    
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
    prompt = "Couple hugging on a beach at sunset, realistic, high detail"
    generate_image(prompt, width=1024, height=576)
    
    # # # I2I with image
    # prompt = "Make the cat wear a red hat and a blue scarf, in the style of a children's book illustration."
    # image_url = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRDCsqRYLAFDdL4Ix_AHai7kNVyoPV9Ssv1xg&s"
    # generate_image(prompt, width=1024, height=576, image=image_url, output_path="output_i2i.jpg")