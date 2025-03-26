#!/bin/bash

# Script to test text.pollinations.ai by fetching random prompts and logging 404 errors
# Created: $(date)

LOG_FILE="text_api_test_$(date +%Y%m%d_%H%M%S).log"
TOTAL_REQUESTS=20  # Increased from 10 to 30 for better statistical analysis
SUCCESS_COUNT=0
FAILURE_COUNT=0
BASE_URL="https://text.pollinations.ai"

echo "Starting API test at $(date)" | tee -a "$LOG_FILE"
echo "Will make $TOTAL_REQUESTS requests to $BASE_URL" | tee -a "$LOG_FILE"
echo "----------------------------------------" | tee -a "$LOG_FILE"

# Arrays to store consecutive success/failure patterns
declare -a RESULTS=()

for i in $(seq 1 $TOTAL_REQUESTS); do
    # Generate a random hash as the prompt
    RANDOM_HASH=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 10 | head -n 1)
    
    # Build the full URL
    FULL_URL="$BASE_URL/$RANDOM_HASH"
    
    # Get timestamp for this request
    TIMESTAMP=$(date +"%H:%M:%S.%3N")
    
    echo "Request $i [$TIMESTAMP]: Testing URL: $FULL_URL" | tee -a "$LOG_FILE"
    
    # Make the request and capture HTTP status code
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$FULL_URL")
    
    # Store result for pattern analysis
    RESULTS+=("$HTTP_STATUS")
    
    # Log the result
    if [ "$HTTP_STATUS" -eq 200 ]; then
        echo "  Success (HTTP $HTTP_STATUS)" | tee -a "$LOG_FILE"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    elif [ "$HTTP_STATUS" -eq 404 ]; then
        echo "  ERROR: 404 Not Found" | tee -a "$LOG_FILE"
        FAILURE_COUNT=$((FAILURE_COUNT + 1))
    elif [ "$HTTP_STATUS" -eq 000 ]; then
        echo "  ERROR: Connection failure (HTTP $HTTP_STATUS)" | tee -a "$LOG_FILE"
        echo "  This usually indicates network connectivity issues or DNS problems" | tee -a "$LOG_FILE"
        FAILURE_COUNT=$((FAILURE_COUNT + 1))
        
        # Add network diagnostics
        echo "  Running network diagnostics:" | tee -a "$LOG_FILE"
        echo "  -- DNS Lookup:" | tee -a "$LOG_FILE"
        host text.pollinations.ai >> "$LOG_FILE" 2>&1
        echo "  -- Ping test:" | tee -a "$LOG_FILE"
        ping -c 3 text.pollinations.ai >> "$LOG_FILE" 2>&1
    else
        echo "  ERROR: Unexpected status code: $HTTP_STATUS" | tee -a "$LOG_FILE"
        FAILURE_COUNT=$((FAILURE_COUNT + 1))
    fi
    
    # Add a small delay between requests
    sleep 1
done

echo "----------------------------------------" | tee -a "$LOG_FILE"
echo "Test completed at $(date)" | tee -a "$LOG_FILE"
echo "Summary:" | tee -a "$LOG_FILE"
echo "  Total requests: $TOTAL_REQUESTS" | tee -a "$LOG_FILE"
echo "  Successful: $SUCCESS_COUNT" | tee -a "$LOG_FILE"
echo "  Failed: $FAILURE_COUNT" | tee -a "$LOG_FILE"
echo "  Success rate: $(( (SUCCESS_COUNT * 100) / TOTAL_REQUESTS ))%" | tee -a "$LOG_FILE"

# Analyze patterns in the results
echo "" | tee -a "$LOG_FILE"
echo "Pattern Analysis:" | tee -a "$LOG_FILE"

# Print the sequence of results
echo "  Response sequence: ${RESULTS[@]}" | tee -a "$LOG_FILE"

# Check for alternating pattern (which would suggest multiple connectors)
ALTERNATING_COUNT=0
for ((i=1; i<${#RESULTS[@]}; i++)); do
    if [ "${RESULTS[$i]}" != "${RESULTS[$i-1]}" ]; then
        ALTERNATING_COUNT=$((ALTERNATING_COUNT + 1))
    fi
done
ALTERNATING_PERCENTAGE=$(( (ALTERNATING_COUNT * 100) / (${#RESULTS[@]} - 1) ))
echo "  Pattern alternation rate: $ALTERNATING_PERCENTAGE% (higher suggests multiple connectors)" | tee -a "$LOG_FILE"

# Check for consecutive failures
MAX_CONSECUTIVE_FAILURES=0
CURRENT_CONSECUTIVE_FAILURES=0
for status in "${RESULTS[@]}"; do
    if [ "$status" != "200" ]; then
        CURRENT_CONSECUTIVE_FAILURES=$((CURRENT_CONSECUTIVE_FAILURES + 1))
        if [ $CURRENT_CONSECUTIVE_FAILURES -gt $MAX_CONSECUTIVE_FAILURES ]; then
            MAX_CONSECUTIVE_FAILURES=$CURRENT_CONSECUTIVE_FAILURES
        fi
    else
        CURRENT_CONSECUTIVE_FAILURES=0
    fi
done
echo "  Maximum consecutive failures: $MAX_CONSECUTIVE_FAILURES" | tee -a "$LOG_FILE"

if [ $FAILURE_COUNT -gt 0 ]; then
    echo "  WARNING: Detected $FAILURE_COUNT failures!" | tee -a "$LOG_FILE"
    
    # Check if all failures are connection issues (000)
    if grep -q "Connection failure (HTTP 000)" "$LOG_FILE"; then
        echo "  Connection failures detected. Possible causes:" | tee -a "$LOG_FILE"
        echo "    1. Cloudflare tunnel not running properly" | tee -a "$LOG_FILE"
        echo "    2. Local service not running on port 16385" | tee -a "$LOG_FILE"
        echo "    3. Network connectivity issues" | tee -a "$LOG_FILE"
        echo "" | tee -a "$LOG_FILE"
        echo "    Suggested troubleshooting:" | tee -a "$LOG_FILE"
        echo "    - Check if local service is running: sudo systemctl status cloudflared-text.service" | tee -a "$LOG_FILE"
        echo "    - Check if port 16385 is listening: sudo netstat -tulpn | grep 16385" | tee -a "$LOG_FILE"
        echo "    - Restart Cloudflare tunnel: sudo systemctl restart cloudflared-text.service" | tee -a "$LOG_FILE"
    fi
    
    # Check for high 404 rate
    if [ $FAILURE_COUNT -ge $(( TOTAL_REQUESTS / 3 )) ] && grep -q "404 Not Found" "$LOG_FILE"; then
        echo "  High 404 failure rate detected ($FAILURE_COUNT/$TOTAL_REQUESTS)!" | tee -a "$LOG_FILE"
        
        # Check if the pattern suggests multiple connectors
        if [ $ALTERNATING_PERCENTAGE -ge 40 ]; then
            echo "  The alternating success/failure pattern strongly suggests multiple Cloudflare connectors issue." | tee -a "$LOG_FILE"
            echo "    Based on the memory, this is likely due to multiple connectors (90204ee2-dbd3-4fcd-88f5-09353167f452 and" | tee -a "$LOG_FILE"
            echo "    9f03b7e7-7b9d-45a2-9543-a69c439c2fae) running simultaneously." | tee -a "$LOG_FILE"
            echo "" | tee -a "$LOG_FILE"
            echo "    Recommended fix:" | tee -a "$LOG_FILE"
            echo "    sudo systemctl stop cloudflared-text.service" | tee -a "$LOG_FILE"
            echo "    cloudflared tunnel cleanup" | tee -a "$LOG_FILE"
            echo "    sudo systemctl start cloudflared-text.service" | tee -a "$LOG_FILE"
        fi
    fi
fi

echo "Log saved to: $LOG_FILE"
