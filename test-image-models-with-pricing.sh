#!/usr/bin/env bash
# Test all image models with pricing validation
# Based on enter.pollinations.ai/AGENTS.md and shared/registry/image.ts

set -e

# Ensure we're running in bash
if [ -z "$BASH_VERSION" ]; then
    echo "This script requires bash. Please run with: bash $0"
    exit 1
fi

# Configuration
TOKEN="${TOKEN:-sk_yvDGllFYQR9pRMY5J5G9vgaejH7zgshKqTA3a8utaQ8q0J1pRxc5hiGHxMheCw2q}"
BASE_URL="https://enter.pollinations.ai/api"
OUTPUT_DIR="test-image-output-$(date +%Y%m%d-%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Expected pricing from shared/registry/image.ts (as of date)
# These are operational costs, not user prices
get_model_cost() {
    case "$1" in
        flux) echo "0.00012" ;;          # $0.00012 per image (free to users)
        kontext) echo "0.04" ;;          # $0.04 per image
        turbo) echo "0.0003" ;;          # $0.0003 per image
        nanobanana) echo "0.039" ;;      # ~$0.039 per image (calculated from tokens)
        seedream) echo "0.03" ;;         # $0.03 per image
        gptimage) echo "variable" ;;     # Variable based on tokens
        *) echo "unknown" ;;
    esac
}

# Free models (no charge to users)
is_free_model() {
    case "$1" in
        flux) return 0 ;;  # true
        *) return 1 ;;     # false
    esac
}

# Check token
if [ -z "$TOKEN" ]; then
    echo -e "${RED}❌ Error: TOKEN not set${NC}"
    echo "Set it with: export TOKEN='sk_...'"
    exit 1
fi

echo -e "${BLUE}🎨 Testing Image Service - All Models with Pricing Validation${NC}"
echo "=================================================================="
echo ""

# First, discover available models
echo -e "${YELLOW}📋 Discovering available image models...${NC}"
MODELS_RESPONSE=$(curl -s "$BASE_URL/generate/image/models" \
  -H "Authorization: Bearer $TOKEN")

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to fetch models${NC}"
    exit 1
fi

# Try to extract model list (the endpoint might return different formats)
MODEL_LIST=$(echo "$MODELS_RESPONSE" | jq -r '.models[]?.id // .[]?.id // .[] // empty' 2>/dev/null || echo "")

# If jq extraction fails, try getting from keys
if [ -z "$MODEL_LIST" ]; then
    MODEL_LIST=$(echo "$MODELS_RESPONSE" | jq -r 'keys[]' 2>/dev/null || echo "")
fi

# If still empty, fall back to known models
if [ -z "$MODEL_LIST" ]; then
    echo -e "${YELLOW}⚠ Could not parse model list from API, using known models${NC}"
    MODEL_LIST="flux
kontext
turbo
gptimage
seedream"
fi

echo "Found models:"
echo "$MODEL_LIST" | sed 's/^/  - /'
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"
echo "📁 Output directory: $OUTPUT_DIR"
echo ""

echo -e "${YELLOW}🚀 Testing models sequentially with pricing validation...${NC}"
echo ""

# Results tracking
total=0
success=0
failed=0
results_file="$OUTPUT_DIR/results.txt"
touch "$results_file"

# Function to test a model and validate pricing
test_model_with_pricing() {
    local model=$1
    local test_num=$2
    local output_file="$OUTPUT_DIR/${model}_image.jpg"
    local headers_file="$OUTPUT_DIR/${model}_headers.txt"
    local status_file="$OUTPUT_DIR/${model}_status.json"
    
    echo -e "${CYAN}Testing: $model${NC}"
    
    # Determine image size (seedream needs minimum 960x960)
    local width=512
    local height=512
    if [ "$model" = "seedream" ]; then
        width=1024
        height=1024
    fi
    
    local start_time=$(date +%s)
    
    # Make request and capture headers
    local http_code=$(curl -s -w "%{http_code}" \
        -D "$headers_file" \
        -o "$output_file" \
        "$BASE_URL/generate/image/test_${model}_${test_num}?model=${model}&width=${width}&height=${height}&seed=${test_num}&nologo=true&private=true" \
        -H "Authorization: Bearer $TOKEN")
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Parse response headers
    local model_used=$(grep -i "x-model-used:" "$headers_file" | cut -d: -f2- | tr -d '[:space:]' || echo "unknown")
    local usage_image_tokens=$(grep -i "x-usage-completion-image-tokens:" "$headers_file" | cut -d: -f2- | tr -d '[:space:]' || echo "0")
    local usage_total_tokens=$(grep -i "x-usage-total-tokens:" "$headers_file" | cut -d: -f2- | tr -d '[:space:]' || echo "0")
    local cache_status=$(grep -i "x-cache:" "$headers_file" | cut -d: -f2- | tr -d '[:space:]' || echo "MISS")
    
    # Check if file was created and has content
    local file_size=0
    if [ -f "$output_file" ]; then
        file_size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null || echo "0")
    fi
    
    # Calculate expected cost based on usage
    local model_cost=$(get_model_cost "$model")
    local expected_cost="0"
    local is_free="false"
    
    if is_free_model "$model"; then
        is_free="true"
    fi
    
    if [ "$usage_image_tokens" != "0" ] && [ "$model_cost" != "variable" ] && [ "$model_cost" != "unknown" ]; then
        # For most models, cost = tokens * cost_per_token
        # Since image models typically count 1 image = 1 token
        expected_cost="$model_cost"
    fi
    
    # User price (what they're charged)
    local user_price="0"
    if [ "$is_free" = "false" ]; then
        user_price="$expected_cost"
    fi
    
    # Save detailed status
    cat > "$status_file" << EOF
{
  "model": "$model",
  "http_code": "$http_code",
  "duration_seconds": $duration,
  "file_size_bytes": $file_size,
  "model_used": "$model_used",
  "cache_status": "$cache_status",
  "usage": {
    "completion_image_tokens": $usage_image_tokens,
    "total_tokens": $usage_total_tokens
  },
  "pricing": {
    "is_free_tier": $is_free,
    "expected_operational_cost_usd": $expected_cost,
    "user_price_usd": $user_price,
    "cost_per_image_usd": "$model_cost"
  }
}
EOF
    
    # Determine status and print result
    total=$((total + 1))
    
    if [ "$http_code" = "200" ] && [ "$file_size" -gt "1000" ]; then
        echo -e "  ${GREEN}✓ Success${NC}"
        echo "  HTTP: $http_code | Size: ${file_size} bytes | Time: ${duration}s | Cache: $cache_status"
        echo "  Model Used: $model_used | Image Tokens: $usage_image_tokens"
        
        if [ "$is_free" = "true" ]; then
            echo -e "  ${GREEN}💚 Free Model${NC} - Operational cost: \$${expected_cost}, User cost: \$0"
        else
            echo -e "  ${MAGENTA}💎 Paid Model${NC} - Cost per image: \$${expected_cost}"
        fi
        
        success=$((success + 1))
        echo "$model:✓ SUCCESS" >> "$results_file"
    elif [ "$http_code" = "403" ]; then
        echo -e "  ${YELLOW}⚠ Insufficient Pollen${NC}"
        echo "  HTTP: $http_code | Need more pollen balance for paid model"
        failed=$((failed + 1))
        echo "$model:⚠ INSUFFICIENT_POLLEN" >> "$results_file"
    elif [ "$http_code" = "401" ]; then
        echo -e "  ${RED}✗ Authentication Failed${NC}"
        echo "  HTTP: $http_code | Check your API token"
        failed=$((failed + 1))
        echo "$model:✗ AUTH_FAILED" >> "$results_file"
    elif [ "$http_code" = "500" ]; then
        echo -e "  ${RED}✗ Server Error${NC}"
        echo "  HTTP: $http_code | Backend service may be overloaded"
        failed=$((failed + 1))
        echo "$model:✗ SERVER_ERROR" >> "$results_file"
    else
        echo -e "  ${RED}✗ Failed${NC}"
        echo "  HTTP: $http_code | Size: ${file_size} bytes | Time: ${duration}s"
        failed=$((failed + 1))
        echo "$model:✗ FAILED" >> "$results_file"
    fi
    echo ""
    
    # Add delay to avoid rate limiting
    sleep 2
}

# Test each model
test_num=$(date +%s)
while IFS= read -r model; do
    [ -z "$model" ] && continue
    test_model_with_pricing "$model" "$test_num"
    test_num=$((test_num + 1))
done <<< "$MODEL_LIST"

# Generate summary report
echo "=================================================================="
echo -e "${BLUE}📊 Results Summary${NC}"
echo "=================================================================="
echo ""
echo "Total models tested: $total"
echo -e "${GREEN}Successful: $success${NC}"
echo -e "${RED}Failed: $failed${NC}"
echo ""

echo "=================================================================="
echo -e "${BLUE}💰 Pricing Summary${NC}"
echo "=================================================================="
echo ""
echo "Expected costs per image (operational/user):"
echo ""

for model in $(echo "$MODEL_LIST"); do
    [ -z "$model" ] && continue
    
    local cost=$(get_model_cost "$model")
    local status=$(grep "^$model:" "$results_file" 2>/dev/null | cut -d: -f2 || echo "NOT_TESTED")
    
    if is_free_model "$model"; then
        echo -e "  ${GREEN}$model${NC}: \$$cost operational / ${GREEN}\$0 to users${NC} (FREE) - $status"
    else
        echo -e "  ${MAGENTA}$model${NC}: \$$cost - $status"
    fi
done

echo ""
echo "=================================================================="
echo -e "${BLUE}📁 Output Files${NC}"
echo "=================================================================="
echo ""
echo "Generated files in: $OUTPUT_DIR/"
echo ""
echo "  - *_image.jpg      : Generated images"
echo "  - *_headers.txt    : Response headers with usage data"
echo "  - *_status.json    : Detailed status and pricing info"
echo ""

# Show detailed pricing for successful tests
if [ "$success" -gt 0 ]; then
    echo "=================================================================="
    echo -e "${BLUE}💵 Detailed Pricing Breakdown${NC}"
    echo "=================================================================="
    echo ""
    
    for status_file in "$OUTPUT_DIR"/*_status.json; do
        if [ -f "$status_file" ]; then
            local model_name=$(basename "$status_file" | sed 's/_status.json//')
            echo -e "${CYAN}$model_name:${NC}"
            cat "$status_file" | jq -r '
                "  Operational Cost: $\(.pricing.expected_operational_cost_usd)",
                "  User Price: $\(.pricing.user_price_usd)",
                "  Free Tier: \(.pricing.is_free_tier)",
                "  Image Tokens Used: \(.usage.completion_image_tokens)"
            ' 2>/dev/null || cat "$status_file"
            echo ""
        fi
    done
fi

echo "=================================================================="
echo -e "${GREEN}✅ Testing complete!${NC}"
echo "=================================================================="
