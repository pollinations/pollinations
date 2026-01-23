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
    prompt = "A young woman with straight chestnut hair tucked behind one ear stands in a narrow art studio, wearing an oversized ivory knit sweater and dark jeans. Late afternoon light enters through a high industrial window, grazing the walls and illuminating suspended dust particles. The camera holds a tight medium shot, emphasizing her calm gaze and relaxed shoulders. Warm highlights contrast with cool concrete shadows, creating a restrained cinematic palette. Shallow depth of field isolates her against blurred canvases and paint-stained surfaces, suggesting quiet creative absorption."
    generate_image(prompt, width=2048, height=1152)
    