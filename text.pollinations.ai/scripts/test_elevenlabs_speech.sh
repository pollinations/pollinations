#!/bin/bash

# Test the Eleven Labs TTS implementation through the OpenAI-compatible endpoint
# This script demonstrates how to use the new /audio/speech endpoint

echo "Testing Eleven Labs Text-to-Speech API..."

# Test the /audio/speech endpoint with Eleven Labs
curl -X POST "http://localhost:16385/audio/speech" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "elevenlabs",
    "input": "Hello, this is a test of the Eleven Labs text to speech API integration with Pollinations.",
    "voice": "Rachel",
    "response_format": "mp3"
  }' \
  --output test_elevenlabs_speech.mp3

echo "Audio saved to test_elevenlabs_speech.mp3"

# Test the /audio/voices endpoint to get available voices
echo "Getting available voices..."
curl -X GET "http://localhost:16385/audio/voices?model=elevenlabs" \
  -H "Content-Type: application/json"

echo -e "\nOr try it with the standard OpenAI client library:"
echo '
// Example using OpenAI JavaScript client library
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://text.pollinations.ai/v1",
  apiKey: "not-needed-for-pollinations"
});

async function generateSpeech() {
  const mp3 = await openai.audio.speech.create({
    model: "elevenlabs",
    voice: "Rachel",
    input: "Hello world! This is Eleven Labs on Pollinations.",
    response_format: "mp3"
  });
  
  // Convert to ArrayBuffer
  const buffer = Buffer.from(await mp3.arrayBuffer());
  
  // Save to file
  await fs.promises.writeFile("speech.mp3", buffer);
  console.log("Audio saved to speech.mp3");
}

generateSpeech();
'
