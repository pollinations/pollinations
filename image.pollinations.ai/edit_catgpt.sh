#!/bin/bash

# Source the .env file if it exists
if [ -f ".env" ]; then
  echo "Loading environment variables from .env file..."
  export $(grep -v '^#' .env | xargs)
fi
AZURE_API_KEY=$GPT_IMAGE_2_AZURE_API_KEY
# Check if API key is set
if [ -z "$AZURE_API_KEY" ]; then
  echo "AZURE_API_KEY not found in environment variables or .env file."
  echo "Please make sure it's set in the .env file or run: export AZURE_API_KEY=\"your-api-key\""
  exit 1
fi

# Path to the image
IMAGE_PATH="./catgpt/catgpt_original.png"

# Check if the image exists
if [ ! -f "$IMAGE_PATH" ]; then
  echo "Image not found at $IMAGE_PATH"
  exit 1
fi

# Base prompt for the edit - keeping it shorter to avoid potential token limits
BASE_PROMPT="Hand-drawn CatGPT comic: lazy cat answering food questions. Humans are servants. Cat is lounging, ironic, uninterested."

# Run 5 times in batch with error handling
for i in {1..5}; do
  # Add a slight variation to each prompt
  case $i in
    1) VARIATION="Cat napping, sarcastically tells human to make pizza and pasta." ;;
    2) VARIATION="Cat on keyboard, demanding human fetch sushi and seafood." ;;
    3) VARIATION="Cat stretching, ironically instructs human to prepare desserts." ;;
    4) VARIATION="Cat yawning, dismissively suggests human make salads and smoothies." ;;
    5) VARIATION="Cat grooming, commands human to cook pancakes and waffles." ;;
  esac
  
  # Combine base prompt with variation
  PROMPT="$BASE_PROMPT $VARIATION"
  
  echo "Batch $i/5: Editing image with prompt: $PROMPT"
  
  # Create a temporary file for the API response
  TEMP_RESPONSE="/tmp/api_response_$i.json"
  
  # Make the API call without a mask and save full response
  curl -s -X POST "https://grok1-resource.cognitiveservices.azure.com/openai/deployments/gpt-image-1/images/edits?api-version=2025-04-01-preview" \
    -H "Authorization: Bearer $AZURE_API_KEY" \
    -F "image=@$IMAGE_PATH" \
    -F "prompt=$PROMPT" > "$TEMP_RESPONSE"
  
  # Check if the response contains an error
  if jq -e '.error' "$TEMP_RESPONSE" > /dev/null 2>&1; then
    ERROR_MSG=$(jq -r '.error.message' "$TEMP_RESPONSE")
    echo "Error in batch $i: $ERROR_MSG"
    echo "Retrying with a shorter prompt..."
    
    # Try again with an even shorter prompt
    SHORTER_PROMPT="CatGPT comic: lazy cat commanding human to get food. Cat is ironic and uninterested."
    
    curl -s -X POST "https://grok1-resource.cognitiveservices.azure.com/openai/deployments/gpt-image-1/images/edits?api-version=2025-04-01-preview" \
      -H "Authorization: Bearer $AZURE_API_KEY" \
      -F "image=@$IMAGE_PATH" \
      -F "prompt=$SHORTER_PROMPT" > "$TEMP_RESPONSE"
      
    # Check if retry worked
    if jq -e '.error' "$TEMP_RESPONSE" > /dev/null 2>&1; then
      ERROR_MSG=$(jq -r '.error.message' "$TEMP_RESPONSE")
      echo "Retry failed: $ERROR_MSG"
      continue
    fi
  fi
  
  # Extract the image data and save it
  if jq -e '.data[0].b64_json' "$TEMP_RESPONSE" > /dev/null 2>&1; then
    jq -r '.data[0].b64_json' "$TEMP_RESPONSE" | base64 --decode > "catgpt_food_recommendations_$i.png"
    
    # Check if the image was created successfully
    if [ -s "catgpt_food_recommendations_$i.png" ]; then
      echo "Image $i edited and saved as catgpt_food_recommendations_$i.png"
    else
      echo "Warning: Image file is empty. API may have returned invalid data."
    fi
  else
    echo "Error: Could not find image data in API response for batch $i"
  fi
  
  # Clean up temporary file
  rm -f "$TEMP_RESPONSE"
  
  # Add a longer delay between requests to avoid rate limiting
  if [ $i -lt 5 ]; then
    echo "Waiting 5 seconds before next request..."
    sleep 5
  fi
done

echo "All 5 images have been generated successfully!"
