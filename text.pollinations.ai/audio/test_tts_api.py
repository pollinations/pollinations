import requests
import json
import sys
import time
from pathlib import Path

BASE_URL = "http://localhost:8001"
RESULTS_DIR = Path("test_outputs")
RESULTS_DIR.mkdir(exist_ok=True)

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def print_header(msg):
    print(f"\n{Colors.BLUE}{'='*60}")
    print(f"  {msg}")
    print(f"{'='*60}{Colors.END}\n")

def print_success(msg):
    print(f"{Colors.GREEN}✓ {msg}{Colors.END}")

def print_error(msg):
    print(f"{Colors.RED}✗ {msg}{Colors.END}")

def print_warning(msg):
    print(f"{Colors.YELLOW}⚠ {msg}{Colors.END}")

def test_health_check():
    """Test the health check endpoint"""
    print_header("Test 1: Health Check")
    try:
        response = requests.get(f"{BASE_URL}/")
        if response.status_code == 200:
            data = response.json()
            print_success(f"Health check passed: {data['status']}")
            print(f"  Message: {data['message']}")
            return True
        else:
            print_error(f"Health check failed with status {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Failed to reach API: {e}")
        return False

def test_basic_synthesis():
    """Test basic TTS synthesis with minimal parameters"""
    print_header("Test 2: Basic Synthesis")
    payload = {
        "input": "Hello, this is a test of the text to speech API."
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/synthesize",
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            request_id = response.headers.get('X-Request-ID', 'unknown')
            audio_size = len(response.content)
            output_path = RESULTS_DIR / f"test_basic_{request_id}.wav"
            
            with open(output_path, 'wb') as f:
                f.write(response.content)
            
            print_success(f"Basic synthesis successful")
            print(f"  Request ID: {request_id}")
            print(f"  Audio size: {audio_size} bytes")
            print(f"  Saved to: {output_path}")
            return True
        else:
            print_error(f"Synthesis failed with status {response.status_code}")
            print(f"  Response: {response.text}")
            return False
    except Exception as e:
        print_error(f"Test failed: {e}")
        return False

def test_with_voice():
    print_header("Test 3: Synthesis with Different Voices")
    voice = "alloy"
    results = []
    
    
    payload = {
    "input": "This is a test combining voice, speed, format, and expressive parameters!",
    "voice": "alloy",
    "response_format": "mp3",
    "speed": 0.7,
    "exaggeration": 0.6,
    "cfg_weight": 2.0,
    "instructions": "Speak with warmth and enthusiasm"
}
    
    try:
        response = requests.post(
            f"{BASE_URL}/synthesize",
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            request_id = response.headers.get('X-Request-ID', 'unknown')
            output_path = RESULTS_DIR / f"test_voice_{voice}_{request_id}.wav"
            
            with open(output_path, 'wb') as f:
                f.write(response.content)
            
            print_success(f"Voice '{voice}' synthesis successful ({len(response.content)} bytes)")
            results.append(True)
        else:
            print_error(f"Voice '{voice}' synthesis failed: {response.status_code}")
            results.append(False)
    except Exception as e:
        print_error(f"Voice '{voice}' test failed: {e}")
        results.append(False)

    return all(results)

def run_all_tests():
    """Run all tests and report results"""
    print(f"\n{Colors.BLUE}{'='*60}")
    print(f"  TTS API Test Suite")
    print(f"  Base URL: {BASE_URL}")
    print(f"  Results Directory: {RESULTS_DIR.absolute()}")
    print(f"{'='*60}{Colors.END}\n")
    
    tests = [
        ("TTS Test", test_with_voice),
    ]
    
    results = []
    start_time = time.time()
    
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print_error(f"Test '{test_name}' crashed: {e}")
            results.append((test_name, False))
    
    elapsed = time.time() - start_time
    
    # Summary
    print_header("Test Summary")
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = f"{Colors.GREEN}PASS{Colors.END}" if result else f"{Colors.RED}FAIL{Colors.END}"
        print(f"  {test_name}: {status}")
    
    print(f"\n  Total: {passed}/{total} tests passed")
    print(f"  Time: {elapsed:.2f}s")
    print(f"  Output: {RESULTS_DIR.absolute()}\n")
    
    return passed == total

if __name__ == "__main__":
    try:
        success = run_all_tests()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print_warning("\nTests interrupted by user")
        sys.exit(130)
    except Exception as e:
        print_error(f"Unexpected error: {e}")
        sys.exit(1)
