#!/bin/bash
# Test all image models sequentially and check for cost

set -e

# Configuration
TOKEN="sk_yvDGllFYQR9pRMY5J5G9vgaejH7zgshKqTA3a8utaQ8q0J1pRxc5hiGHxMheCw2q"
BASE_URL="http://localhost:16384"
OUTPUT_DIR="test-image-output-$(date +%Y%m%d-%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check token
if [ -z "$TOKEN" ]; then
    echo -e "${RED}❌ Error: TOKEN not set${NC}"
    exit 1
fi

echo -e "${BLUE}🖼️  Testing Image Service - All Models (Sequential)${NC}"
echo "=================================================="
echo ""

# Use a hardcoded list of models as the local server may not have a discovery endpoint
echo -e "${YELLOW}📋 Using hardcoded list of available models...${NC}"
MODEL_LIST="flux
gptimage
turbo
kontext
seedream"

echo "Found models:"
echo "$MODEL_LIST" | sed 's/^/  - /'
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"
echo "📁 Output directory: $OUTPUT_DIR"
echo ""

echo -e "${YELLOW}🚀 Starting sequential requests for all models...${NC}"
echo ""

# Function to test a model
test_model() {
    local model=$1
    local output_file="$OUTPUT_DIR/${model}.jpg"
    local headers_file="$OUTPUT_DIR/${model}_headers.txt"
    
    echo -e "${BLUE}Testing model: $model${NC}"

    local start_time=$(date +%s)
    local http_code=$(curl -s -w "%{http_code}" -D "$headers_file" -o "$output_file" \
        "$BASE_URL/generate/image/test_prompt_1?model=${model}&width=512&height=512" \
        -H "Authorization: Bearer $TOKEN")
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    local file_size=0
    if [ -f "$output_file" ]; then
        file_size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null || echo "0")
    fi

    local cost="not_found"
    if [ -f "$headers_file" ]; then
        cost=$(grep -i 'x-pollen-cost' "$headers_file" | awk -F': ' '{print $2}' | tr -d '\r')
    fi

    if [ "$http_code" = "200" ] && [ "$file_size" -gt "0" ]; then
        echo -e "  ${GREEN}✓ Success${NC}"
        echo "    HTTP: $http_code | Size: ${file_size} bytes | Time: ${duration}s"
        echo -e "    ${YELLOW}Cost: ${cost:-not available}${NC}"
    else
        echo -e "  ${RED}✗ Failure${NC}"
        echo "    HTTP: $http_code | Size: ${file_size} bytes | Time: ${duration}s"
        echo "    Response headers written to $headers_file"
        if [ -f "$output_file" ]; then
            echo "    Response body written to $output_file"
        fi
    fi
    echo ""
}

# Launch requests for each model
while IFS= read -r model; do
    [ -z "$model" ] && continue
    test_model "$model"
    sleep 1 # Add a small delay between requests
done <<< "$MODEL_LIST"

echo -e "${GREEN}✅ All tests completed!${NC}"
echo ""
echo "Output saved to: $OUTPUT_DIR/"
