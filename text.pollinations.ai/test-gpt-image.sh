#!/bin/bash


AZURE_GPT_IMAGE_API_KEY="D558ZFVSuyMMFiaf4zN7UwQ6GG9Uf1ZgUIHLnoGzX1mlyWMoi9ytJQQJ99BEACMsfrFXJ3w3AAAAACOGtgbG"

curl -X POST "https://thoma-mab1yuam-westus3.openai.azure.com/openai/deployments/gpt-image-1/images/generations?api-version=2025-04-01-preview" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AZURE_GPT_IMAGE_API_KEY" \
  -d '{
     "prompt" : "Ascii art of Pollinations.ai",
     "size" : "1024x1024",
     "quality" : "medium",
     "output_compression" : 100,
     "output_format" : "png",
     "n" : 1
    }' | jq -r '.data[0].b64_json' | base64 --decode > generated_image_2.png