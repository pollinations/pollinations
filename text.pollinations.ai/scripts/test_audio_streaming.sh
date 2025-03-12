#!/bin/bash

# Test streaming audio generation using the openai-audio model
# Note: Streaming responses are event streams, so we need to handle them differently
curl -X POST "https://text.pollinations.ai/openai/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "model": "openai-audio",
    "modalities": ["text", "audio"],
    "audio": {
      "voice": "alloy",
      "format": "pcm16"
    },
    "messages": [
      {
        "role": "user",
        "content": "Say the following: Hello, this is a test of the audio generation with streaming. The format should be pcm16."
      }
    ],
    "stream": true
  }' \
  > test_audio_streaming_response.txt

echo "Streaming response saved to test_audio_streaming_response.txt"
