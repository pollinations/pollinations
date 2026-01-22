import requests
import sys
from pathlib import Path

def generate_image(prompt: str, output_path: str = "output.jpg") -> str:
    url = ""
    
    payload = {"prompt": prompt}
    
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
    prompt = "a cute bear"
    generate_image(prompt)