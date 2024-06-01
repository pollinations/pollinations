#!/bin/bash

# Create the output directory if it doesn't exist
mkdir -p ./testOutput

# Function to fetch images in parallel and save each request
function fetch_image() {
  local index=$1
  local url="https://image.pollinations.ai/prompt/b_${index}_balaal0a90oons"
  local output_file="./testOutput/image_${index}.jpg"
  
  # Time the request
  local start_time=$(date +%s%3N)
  curl -s -o "$output_file" "$url"
  local end_time=$(date +%s%3N)
  
  # Calculate duration in milliseconds
  local duration=$(( end_time - start_time ))
  
  echo "Fetch for index ${index} took ${duration} ms"
  sleep 0.1
}

# Loop to initiate parallel fetches
for i in {0..10}; do
  fetch_image "$i" &
done

# Wait for all background processes to complete
wait
echo "All fetches completed."
