#!/bin/bash

# Test non-streaming audio generation using the openai-audio model
curl -X POST "http://localhost:16385/openai/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai-audio",
    "modalities": ["text", "audio"],
    "audio": {
      "voice": "alloy",
      "format": "mp3"
    },
    "messages": [
      {
        "role": "user",
        "content": "Say just: hello"
      }
    ]
  }'

echo "Audio saved to test_audio_non_streaming.mp3"
