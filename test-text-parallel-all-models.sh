#!/bin/bash
# Test all text models with parallel requests
# Based on enter.pollinations.ai/AGENTS.md

set -e

# Configuration
TOKEN="${TOKEN:-$(grep "^PROD_SECRET_ELLIOTHOT=" .env.local 2>/dev/null | cut -d= -f2)}"
BASE_URL="https://enter.pollinations.ai/api"
OUTPUT_DIR="test-text-output-$(date +%Y%m%d-%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check token
if [ -z "$TOKEN" ]; then
    echo -e "${RED}❌ Error: TOKEN not set${NC}"
    echo "Set it with: export TOKEN='sk_...'"
    echo "Or add PROD_SECRET_ELLIOTHOT to .env.local"
    exit 1
fi

echo -e "${BLUE}💬 Testing Text Service - All Models (Parallel)${NC}"
echo "=================================================="
echo ""

# First, discover available models
echo -e "${YELLOW}📋 Discovering available models...${NC}"
MODELS_JSON=$(curl -s "$BASE_URL/generate/openai/models" \
  -H "Authorization: Bearer $TOKEN")

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to fetch models${NC}"
    exit 1
fi

# Extract model IDs
MODEL_LIST=$(echo "$MODELS_JSON" | jq -r '.data[].id' 2>/dev/null || echo "")

if [ -z "$MODEL_LIST" ]; then
    echo -e "${RED}❌ No models found or jq not installed${NC}"
    exit 1
fi

echo "Found models:"
echo "$MODEL_LIST" | sed 's/^/  - /'
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"
echo "📁 Output directory: $OUTPUT_DIR"
echo ""

echo -e "${YELLOW}🚀 Starting parallel requests for all models...${NC}"
echo ""

# Arrays to track results
declare -a PIDS
declare -a MODEL_NAMES

# Function to test a model
test_model() {
    local model=$1
    local output_file="$OUTPUT_DIR/${model}_response.json"
    local status_file="$OUTPUT_DIR/${model}_status.txt"
    
    local start_time=$(date +%s)
    local http_code=$(curl -s -w "%{http_code}" -o "$output_file" \
        "$BASE_URL/generate/openai" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"model\": \"${model}\", \"messages\": [{\"role\": \"user\", \"content\": \"Say hello in one sentence\"}]}")
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Check if file was created and has content
    local file_size=0
    local response_text=""
    if [ -f "$output_file" ]; then
        file_size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null || echo "0")
        # Try to extract the response text
        response_text=$(cat "$output_file" | jq -r '.choices[0].message.content' 2>/dev/null || echo "")
    fi
    
    # Save status
    echo "HTTP:${http_code}|SIZE:${file_size}|TIME:${duration}s|TEXT:${response_text}" > "$status_file"
}

# Launch parallel requests for each model
while IFS= read -r model; do
    [ -z "$model" ] && continue
    echo "  Starting: $model"
    test_model "$model" &
    PIDS+=($!)
    MODEL_NAMES+=("$model")
done <<< "$MODEL_LIST"

echo ""
echo -e "${YELLOW}⏳ Waiting for all requests to complete...${NC}"
echo ""

# Wait for all background jobs
for pid in "${PIDS[@]}"; do
    wait "$pid"
done

echo -e "${GREEN}✅ All requests completed!${NC}"
echo ""
echo "=================================================="
echo -e "${BLUE}📊 Results Summary${NC}"
echo "=================================================="
echo ""

# Display results
total=0
success=0
failed=0

while IFS= read -r model; do
    [ -z "$model" ] && continue
    status_file="$OUTPUT_DIR/${model}_status.txt"
    
    if [ -f "$status_file" ]; then
        status=$(cat "$status_file")
        http_code=$(echo "$status" | grep -o "HTTP:[0-9]*" | cut -d: -f2)
        file_size=$(echo "$status" | grep -o "SIZE:[0-9]*" | cut -d: -f2)
        duration=$(echo "$status" | grep -o "TIME:[^|]*" | cut -d: -f2)
        response_text=$(echo "$status" | grep -o "TEXT:.*" | cut -d: -f2-)
        
        total=$((total + 1))
        
        # Determine status
        if [ "$http_code" = "200" ] && [ "$file_size" -gt "0" ] && [ -n "$response_text" ]; then
            echo -e "${GREEN}✓ $model${NC}"
            echo "  HTTP: $http_code | Size: ${file_size} bytes | Time: $duration"
            # Truncate response if too long
            if [ ${#response_text} -gt 80 ]; then
                echo "  Response: ${response_text:0:80}..."
            else
                echo "  Response: $response_text"
            fi
            success=$((success + 1))
        elif [ "$http_code" = "403" ]; then
            echo -e "${YELLOW}⚠ $model${NC}"
            echo "  HTTP: $http_code | Insufficient pollen balance or tier"
            failed=$((failed + 1))
        elif [ "$http_code" = "401" ]; then
            echo -e "${RED}✗ $model${NC}"
            echo "  HTTP: $http_code | Authentication failed"
            failed=$((failed + 1))
        else
            echo -e "${RED}✗ $model${NC}"
            echo "  HTTP: $http_code | Size: ${file_size} bytes | Time: $duration"
            if [ -n "$response_text" ] && [ "$response_text" != "null" ]; then
                echo "  Response: $response_text"
            fi
            failed=$((failed + 1))
        fi
        echo ""
    else
        echo -e "${RED}✗ $model${NC} - No status file found"
        echo ""
        failed=$((failed + 1))
        total=$((total + 1))
    fi
done <<< "$MODEL_LIST"

echo "=================================================="
echo -e "${BLUE}Summary${NC}"
echo "=================================================="
echo "Total models tested: $total"
echo -e "${GREEN}Successful: $success${NC}"
echo -e "${RED}Failed: $failed${NC}"
echo ""
echo "Output saved to: $OUTPUT_DIR/"
echo ""

# Show file sizes
if [ "$success" -gt 0 ]; then
    echo "Generated files:"
    ls -lh "$OUTPUT_DIR"/*.json 2>/dev/null || echo "No responses generated"
fi

echo ""
echo "=================================================="
