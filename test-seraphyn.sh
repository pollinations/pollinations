#!/bin/bash
# Test Seraphyn API models

# GPT-5.4 (currently out of credits on their end)
curl -X POST "https://seraphyn.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer sk_gxa9nCZrNvPUNvrDbN4OKmRbWcY0Bd7i" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-5.4", "messages": [{"role": "user", "content": "Say hello in one sentence."}], "max_tokens": 50}'

echo ""
echo "---"

# Qwen3-TTS (working - returns base64 WAV audio)
curl -X POST "https://seraphyn.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer sk_gxa9nCZrNvPUNvrDbN4OKmRbWcY0Bd7i" \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen3-tts", "messages": [{"role": "user", "content": "Hello, welcome to Pollinations!"}]}' | python3 -c '
import json, sys, base64
data = json.loads(sys.stdin.read())
if "audio" in data:
    audio = data["audio"]
    b64 = audio.split(",", 1)[1] if "," in audio else audio
    raw = base64.b64decode(b64)
    with open("/tmp/seraphyn_tts_test.wav", "wb") as f:
        f.write(raw)
    fmt = data.get("output_format", "unknown")
    print(f"OK: saved {len(raw)} bytes to /tmp/seraphyn_tts_test.wav, format: {fmt}")
else:
    print("Error:", json.dumps(data))
'
