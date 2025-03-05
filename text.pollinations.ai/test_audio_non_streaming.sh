#!/bin/bash

# Test non-streaming audio generation using the openai-audio model
curl -X POST "https://text.pollinations.ai/openai/chat/completions" \
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
        "content": "Say the following: Hello, this is a test of the audio generation without streaming. The format should be mp3."
      }
    ]
  }' \
  --output test_audio_non_streaming.mp3

echo "Audio saved to test_audio_non_streaming.mp3"
