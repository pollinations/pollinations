#!/bin/bash

# Parallel image generation test script
echo "Starting parallel image generation test at $(date)"
echo "=========================================="

# Base URL components
BASE_URL="https://image.pollinations.ai/prompt"
COMMON_PARAMS="nologo=true&model=seedream&image=https%3A%2F%2Favatars.githubusercontent.com%2Fu%2F86964862%3Fv%3D4,https%3A%2F%2Fimages.squarespace-cdn.com%2Fcontent%2Fv1%2F5c5554d316b64061c6f8a20d%2F1596136490907-06FHBY3TVORRAY0OTO43%2F4b86861cdbbe3576e8c003fccae2c372.jpg&referrer=ppp"

# Function to make a single request with timing
make_request() {
    local num=$1
    local seed=$((19510 + num - 1))
    local random_hash=$(openssl rand -hex 8)
    local prompt="${random_hash}%20${num}%20many%20instances%20of%20the%20the%20logo%20tessellated%20in%20mc%20escher%20hand%20drawn%20style.%20no%20birds"
    local url="${BASE_URL}/${prompt}?seed=${seed}&${COMMON_PARAMS}"
    local output_file="/tmp/image${num}.jpg"
    
    echo "Request ${num}: Starting at $(date '+%H:%M:%S.%3N') with hash: ${random_hash}"
    local start_time=$(date +%s.%3N)
    
    curl -s -w "Request ${num}: HTTP %{http_code}, Total time: %{time_total}s, Size: %{size_download} bytes\n" \
         -o "${output_file}" \
         "${url}"
    
    local end_time=$(date +%s.%3N)
    local duration=$(echo "$end_time - $start_time" | bc -l)
    
    echo "Request ${num}: Finished at $(date '+%H:%M:%S.%3N') (Duration: ${duration}s)"
    
    # Check if file was created and has content
    if [ -f "${output_file}" ] && [ -s "${output_file}" ]; then
        local file_size=$(stat -c%s "${output_file}")
        echo "Request ${num}: File saved successfully (${file_size} bytes)"
    else
        echo "Request ${num}: ERROR - File not created or empty"
    fi
    
    echo "Request ${num}: ----------------------------------------"
}

# Record overall start time
OVERALL_START=$(date +%s.%3N)
echo "Overall start time: $(date '+%H:%M:%S.%3N')"
echo ""

# Launch all requests in parallel
make_request 1 &
PID1=$!
make_request 2 &
PID2=$!
make_request 3 &
PID3=$!

# Wait for all to complete
echo "Waiting for all requests to complete..."
wait $PID1
wait $PID2
wait $PID3

# Calculate overall duration
OVERALL_END=$(date +%s.%3N)
OVERALL_DURATION=$(echo "$OVERALL_END - $OVERALL_START" | bc -l)

echo ""
echo "=========================================="
echo "All requests completed at $(date '+%H:%M:%S.%3N')"
echo "Total wall-clock time: ${OVERALL_DURATION}s"
echo ""

# Show file information
echo "Generated files:"
for i in 1 2 3; do
    if [ -f "/tmp/image${i}.jpg" ]; then
        ls -lh "/tmp/image${i}.jpg"
    else
        echo "image${i}.jpg: NOT FOUND"
    fi
done

echo ""
echo "Test completed at $(date)"
