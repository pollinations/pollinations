import requests
from pathlib import Path
import time 

BASE_URL = "http://localhost:8001"
RESULTS_DIR = Path("test_outputs")
RESULTS_DIR.mkdir(exist_ok=True)

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def print_success(msg):
    print(f"{Colors.GREEN}✓ {msg}{Colors.END}")

def print_error(msg):
    print(f"{Colors.RED}✗ {msg}{Colors.END}")

def print_header(msg):
    print(f"\n{Colors.BLUE}{'='*60}")
    print(f"  {msg}")
    print(f"{'='*60}{Colors.END}\n")

def test_tts():
    start_time = time.time()
    payload = {
        "input": "Oh shoot, I can't believe how amazing this new text to speech model is! The expressiveness and clarity are just outstanding. I'm so excited to use it in my projects and share it with everyone I know. This is a game changer for sure!",
        "voice": "alloy",
        "response_format": "mp3",
        "instructions": "Speak with warmth and enthusiasm",
        "speed": 0.7,
        "language_id": "en"
    }
    
    response = requests.post(f"{BASE_URL}/synthesize", json=payload, timeout=30)
    
    if response.status_code == 200:
        request_id = response.headers.get('X-Request-ID', 'unknown')
        output_path = RESULTS_DIR / f"test_{request_id}.wav"
        with open(output_path, 'wb') as f:
            f.write(response.content)
        print_success(f"English synthesis: {output_path}")
        print(f"Time taken: {time.time() - start_time:.2f} seconds")
        return True
    else:
        print_error(f"Failed: {response.status_code}")
        return False

def test_multilingual():
    print_header("Multilingual Synthesis Test")
    
    test_cases = [
        {
            "name": "English",
            "text": "Hello!! this is a test of the multilingual text to speech API.",
            "language_id": "en"
        },
        {
            "name": "Hindi",
            "text": "नमस्ते, यह मल्टीभाषी आवाज़ सिंथेसिस का परीक्षण है।",
            "language_id": "hi"
        },
        {
            "name": "Spanish",
            "text": "Hola, esta es una prueba de la API de síntesis de voz multilingüe.",
            "language_id": "es"
        },
        {
            "name": "French",
            "text": "Bonjour, ceci est un test de l'API de synthèse vocale multilingue.",
            "language_id": "fr"
        },
        {
            "name": "Japanese",
            "text": "こんにちは、これは多言語テキスト音声合成APIのテストです。",
            "language_id": "ja"
        }
    ]
    
    results = []
    
    for test_case in test_cases:
        name = test_case["name"]
        payload = {
            "input": test_case["text"],
            "language_id": test_case["language_id"],
            "voice": "alloy"
        }
        
        try:
            response = requests.post(
                f"{BASE_URL}/synthesize",
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                request_id = response.headers.get('X-Request-ID', 'unknown')
                output_path = RESULTS_DIR / f"test_lang_{test_case['language_id']}_{request_id}.wav"
                
                with open(output_path, 'wb') as f:
                    f.write(response.content)
                
                print_success(f"{name} ({test_case['language_id']}): {len(response.content)} bytes")
                results.append(True)
            else:
                print_error(f"{name} failed: {response.status_code}")
                results.append(False)
        except Exception as e:
            print_error(f"{name} test failed: {e}")
            results.append(False)
    
    return all(results)

if __name__ == "__main__":
    print_header("TTS API Multilingual Tests")
    # test_tts()
    print()
    test_multilingual()
