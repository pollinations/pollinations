#!/bin/bash

# Test using the exact OpenAI standard format
curl "https://text.pollinations.ai/openai/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai-audio",
    "modalities": ["text", "audio"],
    "audio": { "voice": "alloy", "format": "wav" },
    "messages": [
      {
        "role": "user",
        "content": "Is a golden retriever a good family dog?"
      }
    ]
  }' \
  --output test_audio_wav_format.wav

echo "Audio saved to test_audio_wav_format.wav"
