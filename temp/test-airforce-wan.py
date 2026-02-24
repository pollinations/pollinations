#!/usr/bin/env python3
"""Test script for Airforce wan-2.6 video API"""

import requests
import json
import sys

# API Configuration
API_KEY = "sk-air-UcDlDUVK3yaVZFRvyYELzT1Vnd4AeEkT72Ft3WSWQuj6zMa1mJiV3bgYdRmrbwMP"
url = "https://api.airforce/v1/images/generations"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# Test payload - using a simple test prompt
payload = {
    "model": "wan-2.6",
    "prompt": "A cat walking in a garden",
    "n": 1,
    "size": "1024x1024",
    "response_format": "url",
    "sse": True,
    "aspectRatio": "16:9",
    "duration": 5,
    "resolution": "720P",
    "sound": True
}

print("=" * 60)
print("Testing Airforce wan-2.6 Video API")
print("=" * 60)
print(f"Endpoint: {url}")
print(f"Model: {payload['model']}")
print(f"Prompt: {payload['prompt']}")
print(f"Duration: {payload['duration']}s")
print(f"Resolution: {payload['resolution']}")
print(f"Sound: {payload['sound']}")
print("=" * 60)
print("\nStreaming SSE response:\n")

try:
    # SSE handling
    with requests.post(url, headers=headers, json=payload, stream=True, timeout=300) as response:
        print(f"HTTP Status: {response.status_code}")

        if response.status_code != 200:
            print(f"Error: {response.text}")
            sys.exit(1)

        print("\nSSE Events:")
        print("-" * 60)

        event_count = 0
        for line in response.iter_lines():
            if line:
                line_str = line.decode('utf-8')

                # Skip keepalive and done markers
                if line_str == "data: : keepalive":
                    print("[keepalive]")
                    continue

                if line_str == "data: [DONE]":
                    print("\n[DONE]")
                    break

                # Parse actual data
                if line_str.startswith("data: "):
                    event_count += 1
                    try:
                        data = json.loads(line_str[6:])
                        print(f"\n--- Event {event_count} ---")
                        print(json.dumps(data, indent=2))

                        # Check for video URL
                        if "data" in data and isinstance(data["data"], list):
                            for item in data["data"]:
                                if "url" in item:
                                    print(f"\n🎬 Video URL: {item['url']}")
                                if "revised_prompt" in item:
                                    print(f"📝 Revised prompt: {item['revised_prompt']}")

                    except json.JSONDecodeError as e:
                        print(f"Failed to parse JSON: {line_str}")
                        print(f"Error: {e}")
                else:
                    print(f"Unexpected line: {line_str}")

        print("-" * 60)
        print(f"\nTotal events received: {event_count}")

except requests.exceptions.Timeout:
    print("❌ Request timed out (5 minutes)")
    sys.exit(1)
except requests.exceptions.RequestException as e:
    print(f"❌ Request failed: {e}")
    sys.exit(1)
except KeyboardInterrupt:
    print("\n\n⚠️  Interrupted by user")
    sys.exit(1)

print("\n✅ Test completed successfully")
