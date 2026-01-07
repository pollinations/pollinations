import requests
from pathlib import Path
import time 

BASE_URL = "http://localhost:8001"
RESULTS_DIR = Path("test_outputs")
RESULTS_DIR.mkdir(exist_ok=True)

def test_tts():
    start_time = time.time()
    payload = {
        "input": "This is a test combining voice, speed, format, and expressive parameters!",
        "voice": "alloy",
        "response_format": "mp3",
        "instructions": "Speak with warmth and enthusiasm"
    }
    
    response = requests.post(f"{BASE_URL}/synthesize", json=payload, timeout=30)
    
    if response.status_code == 200:
        request_id = response.headers.get('X-Request-ID', 'unknown')
        output_path = RESULTS_DIR / f"test_{request_id}.wav"
        with open(output_path, 'wb') as f:
            f.write(response.content)
        print(f"✓ Success: {output_path}")
        print(f"Time taken: {time.time() - start_time:.2f} seconds")
        return True
    else:
        print(f"✗ Failed: {response.status_code}")
        return False

if __name__ == "__main__":
    test_tts()
