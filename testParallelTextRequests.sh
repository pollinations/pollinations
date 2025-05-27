#!/bin/bash

# Script to make 10 parallel requests to text.pollinations.ai and measure total time
# Usage: ./testParallelTextRequests.sh

echo "Starting 10 parallel requests to text.pollinations.ai..."
echo "Timestamp: $(date)"
echo ""

# Record start time
start_time=$(date +%s.%N)

# Function to make a single request
make_request() {
    local i=$1
    local url="https://text.pollinations.ai/dasda${i}?token=v1_rblx_access"
    
    echo "Request $i: Starting..."
    
    # Make the request and capture response time
    response=$(curl -s -w "Request $i: HTTP %{http_code} - Time: %{time_total}s - Size: %{size_download} bytes\n" \
                   -o /dev/null \
                   "$url")
    
    echo "$response"
}

# Export the function so it can be used by parallel processes
export -f make_request

# Run 10 requests in parallel using background processes
for i in {1..10}; do
    make_request $i &
done

# Wait for all background processes to complete
wait

# Record end time
end_time=$(date +%s.%N)

# Calculate total time
total_time=$(echo "$end_time - $start_time" | bc -l)

echo ""
echo "All requests completed!"
echo "Total time: ${total_time} seconds"
echo "Average time per request: $(echo "scale=3; $total_time / 10" | bc -l) seconds"
echo "Timestamp: $(date)"
