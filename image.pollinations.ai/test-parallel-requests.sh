#!/bin/bash

# Test script to make two parallel requests to the same image endpoint
# This will help verify if duplicate requests are being created or if caching is working

URL="http://localhost:16384/prompt/hello_world?model=gptimage&referer=pollinations.github.io&quality=low"

echo "Starting parallel requests test at $(date +%Y-%m-%d\ %H:%M:%S.%3N)"
echo "URL: $URL"
echo "----------------------------------------"

# Function to make a request with timing
make_request() {
    local request_id=$1
    echo "[Request $request_id] Starting at $(date +%Y-%m-%d\ %H:%M:%S.%3N)"
    
    # Make the request and capture response headers and status
    response=$(curl -s -w "\n[Request $request_id] HTTP Status: %{http_code}\n[Request $request_id] Total time: %{time_total}s\n" \
        -H "User-Agent: ParallelTest/Request$request_id" \
        -o /dev/null \
        "$URL")
    
    echo "$response"
    echo "[Request $request_id] Completed at $(date +%Y-%m-%d\ %H:%M:%S.%3N)"
}

# Start both requests in parallel
make_request 1 &
PID1=$!

make_request 2 &
PID2=$!

# Wait for both requests to complete
wait $PID1
wait $PID2

echo "----------------------------------------"
echo "Both requests completed at $(date +%Y-%m-%d\ %H:%M:%S.%3N)"
echo ""
echo "Check your server logs to see if:"
echo "1. Two separate image generation requests were made (bad - cache not working)"
echo "2. Only one image generation request was made (good - cache is working)"
