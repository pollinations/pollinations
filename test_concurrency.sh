#!/bin/bash

# Test script for concurrent requests to text.pollinations.ai
# Usage: ./test_concurrency.sh

TOKEN="BpigHXfbVA0xQFQ1"
ENDPOINT="http://localhost:16385/openai"
NUM_REQUESTS=10
LOG_FILE="concurrency_test_$(date +%Y%m%d_%H%M%S).log"

echo "Starting concurrency test with $NUM_REQUESTS requests"
echo "Token: $TOKEN"
echo "Endpoint: $ENDPOINT"
echo "Log file: $LOG_FILE"
echo "Start time: $(date)"
echo ""

# Create log file with headers
echo "request_id,start_time,end_time,duration_ms,http_code,response_size,prompt" > "$LOG_FILE"

# Function to make a single request
make_request() {
    local request_id=$1
    local prompt="$2"
    local start_time=$(date +%s.%3N)
    
    # Make the request and capture response details
    local response=$(curl -w "%{http_code},%{size_download},%{time_total}" \
        -s -o /tmp/response_${request_id}.json \
        -X POST "$ENDPOINT" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TOKEN" \
        -d "{
            \"model\": \"openai-fast\",
            \"messages\": [
                {\"role\": \"user\", \"content\": \"$prompt\"}
            ]
        }")
    
    local end_time=$(date +%s.%3N)
    local duration=$(echo "($end_time - $start_time) * 1000" | bc -l)
    local http_code=$(echo "$response" | cut -d',' -f1)
    local response_size=$(echo "$response" | cut -d',' -f2)
    local curl_time=$(echo "$response" | cut -d',' -f3)
    
    # Log the result
    echo "$request_id,$start_time,$end_time,$duration,$http_code,$response_size,\"$prompt\"" >> "$LOG_FILE"
    
    # Print progress
    echo "Request $request_id completed: ${duration}ms (HTTP $http_code)"
    
    # Clean up temp file
    rm -f /tmp/response_${request_id}.json
}

# Array of different prompts to test with
prompts=(
    "What is artificial intelligence?"
    "Explain quantum computing in simple terms"
    "Write a haiku about technology"
    "What are the benefits of renewable energy?"
    "Describe the process of photosynthesis"
    "What is machine learning?"
    "Explain blockchain technology"
    "Write a short story about robots"
    "What is climate change?"
    "Describe the solar system"
    "What is DNA?"
    "Explain how the internet works"
    "What are the principles of democracy?"
    "Describe the water cycle"
    "What is cryptocurrency?"
    "Explain the theory of evolution"
    "What is artificial neural networks?"
    "Describe how vaccines work"
    "What is sustainable development?"
    "Explain the concept of gravity"
    "What is gene editing?"
    "Describe how computers process information"
    "What is renewable energy?"
    "Explain the greenhouse effect"
    "What is nanotechnology?"
    "Describe how the human brain works"
    "What is space exploration?"
    "Explain the concept of time"
    "What is biotechnology?"
    "Describe how ecosystems function"
)

# Record overall start time
overall_start=$(date +%s.%3N)

echo "Launching $NUM_REQUESTS concurrent requests..."

# Launch all requests in parallel
for i in $(seq 1 $NUM_REQUESTS); do
    prompt_index=$((($i - 1) % ${#prompts[@]}))
    prompt="${prompts[$prompt_index]} (Request #$i)"
    make_request $i "$prompt" &
done

# Wait for all background jobs to complete
wait

# Record overall end time
overall_end=$(date +%s.%3N)
overall_duration=$(echo "($overall_end - $overall_start) * 1000" | bc -l)

echo ""
echo "All requests completed!"
echo "Total time: ${overall_duration}ms"
echo "End time: $(date)"

# Generate summary statistics
echo ""
echo "=== SUMMARY STATISTICS ==="

# Count successful requests
successful=$(tail -n +2 "$LOG_FILE" | awk -F',' '$5 == 200 {count++} END {print count+0}')
total=$(tail -n +2 "$LOG_FILE" | wc -l)

echo "Successful requests: $successful/$total"

if [ $successful -gt 0 ]; then
    # Calculate timing statistics
    echo ""
    echo "Response time statistics (ms):"
    tail -n +2 "$LOG_FILE" | awk -F',' '$5 == 200 {print $4}' | sort -n > /tmp/durations.txt
    
    min_time=$(head -n1 /tmp/durations.txt)
    max_time=$(tail -n1 /tmp/durations.txt)
    avg_time=$(awk '{sum+=$1} END {print sum/NR}' /tmp/durations.txt)
    median_time=$(awk 'NR==int((NR+1)/2) {print $1}' /tmp/durations.txt)
    
    printf "  Min: %.2f ms\n" $min_time
    printf "  Max: %.2f ms\n" $max_time
    printf "  Avg: %.2f ms\n" $avg_time
    printf "  Median: %.2f ms\n" $median_time
    
    rm -f /tmp/durations.txt
fi

# Show HTTP status code distribution
echo ""
echo "HTTP Status Codes:"
tail -n +2 "$LOG_FILE" | awk -F',' '{print $5}' | sort | uniq -c | while read count code; do
    echo "  $code: $count requests"
done

echo ""
echo "Detailed results saved to: $LOG_FILE"
echo "You can analyze the data with: cat $LOG_FILE | column -t -s','"
