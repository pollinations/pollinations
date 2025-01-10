#!/bin/bash

BASE_URL="http://localhost:16385"
SEED=$((RANDOM % 1000000))  # Random seed between 0 and 999999

echo "=== Testing GET /models ==="
curl -s "${BASE_URL}/models" | jq '.'

echo -e "\n=== Testing OpenAI model (seed: $SEED) ==="
echo "Non-streaming:"
curl -s -X POST "${BASE_URL}/" \
    -H "Content-Type: application/json" \
    -d '{
        "messages": [{"role": "user", "content": "Count from 1 to 3"}],
        "model": "openai",
        "stream": false,
        "cache": false,
        "seed": '"$SEED"'
    }'

echo -e "\n\nStreaming:"
curl -N -X POST "${BASE_URL}/" \
    -H "Content-Type: application/json" \
    -d '{
        "messages": [{"role": "user", "content": "Count from 1 to 3"}],
        "model": "openai",
        "stream": true,
        "cache": false,
        "seed": '"$SEED"'
    }'

echo -e "\n\n=== Testing Qwen model (seed: $SEED) ==="
echo "Non-streaming:"
curl -s -X POST "${BASE_URL}/" \
    -H "Content-Type: application/json" \
    -d '{
        "messages": [{"role": "user", "content": "Count from 1 to 3"}],
        "model": "qwen",
        "stream": false,
        "cache": false,
        "seed": '"$SEED"'
    }'

echo -e "\n\nStreaming:"
curl -N -X POST "${BASE_URL}/" \
    -H "Content-Type: application/json" \
    -d '{
        "messages": [{"role": "user", "content": "Count from 1 to 3"}],
        "model": "qwen",
        "stream": true,
        "cache": false,
        "seed": '"$SEED"'
    }'

echo -e "\n\n=== Testing Qwen-Coder model (seed: $SEED) ==="
echo "Non-streaming:"
curl -s -X POST "${BASE_URL}/" \
    -H "Content-Type: application/json" \
    -d '{
        "messages": [{"role": "user", "content": "Count from 1 to 3"}],
        "model": "qwen-coder",
        "stream": false,
        "cache": false,
        "seed": '"$SEED"'
    }'

echo -e "\n\nStreaming:"
curl -N -X POST "${BASE_URL}/" \
    -H "Content-Type: application/json" \
    -d '{
        "messages": [{"role": "user", "content": "Count from 1 to 3"}],
        "model": "qwen-coder",
        "stream": true,
        "cache": false,
        "seed": '"$SEED"'
    }'

echo -e "\n\n=== Testing Mistral model (seed: $SEED) ==="
echo "Non-streaming:"
curl -s -X POST "${BASE_URL}/" \
    -H "Content-Type: application/json" \
    -d '{
        "messages": [{"role": "user", "content": "Count from 1 to 3"}],
        "model": "mistral",
        "stream": false,
        "cache": false,
        "seed": '"$SEED"'
    }'

echo -e "\n\nStreaming:"
curl -N -X POST "${BASE_URL}/" \
    -H "Content-Type: application/json" \
    -d '{
        "messages": [{"role": "user", "content": "Count from 1 to 3"}],
        "model": "mistral",
        "stream": true,
        "cache": false,
        "seed": '"$SEED"'
    }'

echo -e "\n\n=== Testing Invalid model (seed: $SEED) ==="
curl -s -X POST "${BASE_URL}/" \
    -H "Content-Type: application/json" \
    -d '{
        "messages": [{"role": "user", "content": "Hello"}],
        "model": "invalid-model",
        "stream": false,
        "cache": false,
        "seed": '"$SEED"'
    }'
