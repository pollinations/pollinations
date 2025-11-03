#!/usr/bin/env bash
# Test local enter.pollinations.ai service for image generation with pricing validation
# Assumes enter service is running on http://localhost:3000

set -e

# Configuration
TOKEN="${TOKEN:-sk_yvDGllFYQR9pRMY5J5G9vgaejH7zgshKqTA3a8utaQ8q0J1pRxc5hiGHxMheCw2q}"
LOCAL_ENTER="http://localhost:3000"
OUTPUT_DIR="test-local-enter-$(date +%Y%m%d-%H%M%S)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

echo -e "${BLUE}🎨 Testing Local Enter Service - Image Generation with Pricing${NC}"
echo "=================================================================="
echo -e "Local Enter: ${CYAN}$LOCAL_ENTER${NC}"
echo "Token: ${TOKEN:0:20}..."
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Expected pricing from shared/registry/image.ts
# Returns cost per image for fixed-price models, or per-token rate for variable models
get_model_cost() {
    case "$1" in
        flux) echo "0.00012" ;;              # Fixed: $0.00012 per image
        kontext) echo "0.04" ;;              # Fixed: $0.04 per image
        turbo) echo "0.0003" ;;              # Fixed: $0.0003 per image
        gptimage) echo "0.000008" ;;         # Per-token: $8 per 1M tokens = $0.000008 per token
        seedream) echo "0.03" ;;             # Fixed: $0.03 per image
        nanobanana) echo "0.00003" ;;        # Per-token: $30 per 1M tokens = $0.00003 per token
        *) echo "unknown" ;;
    esac
}

# Check if model uses per-token pricing (vs fixed per-image)
is_token_based_pricing() {
    case "$1" in
        gptimage|nanobanana) return 0 ;;  # true - these use per-token pricing
        *) return 1 ;;                     # false - fixed per-image pricing
    esac
}

is_free_model() {
    [ "$1" = "flux" ]
}

# Check if local enter service is running
echo -e "${YELLOW}🔍 Checking local enter service...${NC}"
if ! curl -s --connect-timeout 5 "$LOCAL_ENTER" > /dev/null 2>&1; then
    echo -e "${RED}❌ Local enter service not responding on $LOCAL_ENTER${NC}"
    echo "Please ensure the enter service is running:"
    echo "  cd enter.pollinations.ai"
    echo "  npm run dev"
    exit 1
fi
echo -e "${GREEN}✓ Local enter service is running${NC}"
echo ""

# Step 1: Discover available models from enter.pollinations.ai
echo -e "${YELLOW}📋 Discovering available image models from enter API...${NC}"
PUBLIC_MODELS=$(curl -s "$LOCAL_ENTER/api/generate/image/models" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[]' 2>/dev/null)

if [ -z "$PUBLIC_MODELS" ]; then
    echo -e "${YELLOW}⚠ Could not fetch models from API${NC}"
    PUBLIC_MODELS=""
fi

# Add nectar-tier models that are hidden from public API but accessible with authentication
# These models require nectar tier access
NECTAR_MODELS="seedream nanobanana"

# Combine public and nectar models
MODELS="$PUBLIC_MODELS $NECTAR_MODELS"

echo -e "${GREEN}✓ Testing models:${NC}"
echo -e "${CYAN}Public (seed tier):${NC}"
echo "$PUBLIC_MODELS" | tr ' ' '\n' | sed 's/^/  - /'
echo -e "${MAGENTA}Nectar tier (auth required):${NC}"
echo "$NECTAR_MODELS" | tr ' ' '\n' | sed 's/^/  - /'
echo ""

# Step 2: Test each model
echo -e "${YELLOW}🚀 Step 2: Testing each model with pricing validation...${NC}"
echo ""

success=0
failed=0
total=0

for model in $MODELS; do
    total=$((total + 1))
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}Testing: $model${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Determine size (seedream needs minimum 960x960)
    if [ "$model" = "seedream" ]; then
        width=1024
        height=1024
    else
        width=512
        height=512
    fi
    
    # Files for this test
    test_id="pricing_test_${model}_$(date +%s)"
    output_file="$OUTPUT_DIR/${model}.jpg"
    headers_file="$OUTPUT_DIR/${model}_headers.txt"
    status_file="$OUTPUT_DIR/${model}_status.json"
    
    # Make request to local enter service
    start_time=$(date +%s)
    http_code=$(curl -s -w "%{http_code}" \
        -D "$headers_file" \
        -o "$output_file" \
        "$LOCAL_ENTER/api/generate/image/$test_id?model=${model}&width=${width}&height=${height}&seed=42&nologo=true&private=true" \
        -H "Authorization: Bearer $TOKEN")
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    # Parse response headers
    model_used=$(grep -i "^x-model-used:" "$headers_file" 2>/dev/null | cut -d: -f2- | tr -d '[:space:]' || echo "unknown")
    usage_image_tokens=$(grep -i "^x-usage-completion-image-tokens:" "$headers_file" 2>/dev/null | cut -d: -f2- | tr -d '[:space:]' || echo "0")
    usage_total_tokens=$(grep -i "^x-usage-total-tokens:" "$headers_file" 2>/dev/null | cut -d: -f2- | tr -d '[:space:]' || echo "0")
    cache_status=$(grep -i "^x-cache:" "$headers_file" 2>/dev/null | cut -d: -f2- | tr -d '[:space:]' || echo "MISS")
    
    # Check file size
    file_size=0
    if [ -f "$output_file" ]; then
        file_size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null || echo "0")
    fi
    
    # Calculate pricing
    model_cost_rate=$(get_model_cost "$model")
    expected_cost="0"
    is_free="false"
    pricing_type="fixed"
    
    if is_free_model "$model"; then
        is_free="true"
    fi
    
    if [ "$usage_image_tokens" != "0" ] && [ "$model_cost_rate" != "unknown" ]; then
        if is_token_based_pricing "$model"; then
            # Token-based pricing: multiply tokens by per-token rate
            # Using bc for floating point math
            expected_cost=$(echo "$usage_image_tokens * $model_cost_rate" | bc -l)
            pricing_type="per-token"
        else
            # Fixed per-image pricing: cost is the same regardless of tokens
            expected_cost="$model_cost_rate"
            pricing_type="per-image"
        fi
    fi
    
    # User price (free models charge $0)
    user_price="0"
    if [ "$is_free" = "false" ] && [ "$cache_status" != "HIT" ]; then
        user_price="$expected_cost"
    fi
    
    # Pricing validation flags
    pricing_matches="unknown"
    if [ "$usage_image_tokens" != "0" ]; then
        if [ "$expected_cost" = "$model_cost" ] && [ "$model_cost" != "variable" ]; then
            pricing_matches="true"
        elif [ "$model_cost" = "variable" ]; then
            pricing_matches="variable"
        else
            pricing_matches="false"
        fi
    fi
    
    # Save detailed status
    cat > "$status_file" << EOF
{
  "model": "$model",
  "http_code": $http_code,
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
    "pricing_type": "$pricing_type",
    "cost_rate": "$model_cost_rate",
    "pricing_matches_expected": "$pricing_matches"
  },
  "test_params": {
    "width": $width,
    "height": $height,
    "prompt": "$test_id"
  }
}
EOF
    
    # Display results
    if [ "$http_code" = "200" ] && [ "$file_size" -gt "1000" ]; then
        echo -e "  ${GREEN}✅ SUCCESS${NC}"
        echo "  ├─ HTTP: $http_code | Size: ${file_size} bytes | Time: ${duration}s"
        echo "  ├─ Model Used: $model_used | Cache: $cache_status"
        echo "  ├─ Image Tokens: $usage_image_tokens | Total Tokens: $usage_total_tokens"
        
        # Pricing validation
        if [ "$is_free" = "true" ]; then
            echo -e "  ├─ ${GREEN}💚 Free Model${NC} - Op Cost: \$${expected_cost}, User Cost: \$0"
        else
            if [ "$pricing_type" = "per-token" ]; then
                echo -e "  ├─ ${MAGENTA}💎 Paid Model (Per-Token)${NC}"
                echo -e "  ├─   Rate: \$${model_cost_rate}/token × ${usage_image_tokens} tokens = \$${expected_cost}"
                echo -e "  ├─   User Cost: \$${user_price}"
            else
                echo -e "  ├─ ${MAGENTA}💎 Paid Model (Per-Image)${NC} - Op Cost: \$${expected_cost}, User Cost: \$${user_price}"
            fi
        fi
        
        # Validate headers are present
        if [ "$usage_image_tokens" = "0" ]; then
            echo -e "  └─ ${RED}⚠ WARNING: No usage tokens in headers!${NC}"
        elif [ "$cache_status" = "HIT" ]; then
            echo -e "  └─ ${BLUE}ℹ Cache hit - no new cost${NC}"
        else
            echo -e "  └─ ${GREEN}✓ Pricing headers present${NC}"
        fi
        
        success=$((success + 1))
    else
        echo -e "  ${RED}❌ FAILED${NC}"
        echo "  ├─ HTTP: $http_code | Size: ${file_size} bytes | Time: ${duration}s"
        
        if [ "$http_code" = "401" ]; then
            echo "  └─ ${RED}Authentication failed - check token${NC}"
        elif [ "$http_code" = "403" ]; then
            echo "  └─ ${YELLOW}Insufficient pollen balance${NC}"
        elif [ "$http_code" = "500" ]; then
            echo "  └─ ${RED}Server error - check backend service${NC}"
        elif [ "$http_code" = "404" ]; then
            echo "  └─ ${RED}Endpoint not found - check route${NC}"
        else
            # Show first line of response for debugging
            if [ -f "$output_file" ]; then
                error_msg=$(head -1 "$output_file" 2>/dev/null || echo "")
                if [ -n "$error_msg" ]; then
                    echo "  └─ Error: $error_msg"
                fi
            fi
        fi
        
        failed=$((failed + 1))
    fi
    echo ""
    
    # Small delay
    sleep 1
done

# Summary
echo "=================================================================="
echo -e "${BLUE}📊 Test Summary${NC}"
echo "=================================================================="
echo ""
echo "Total models tested: $total"
echo -e "${GREEN}✅ Successful: $success${NC}"
echo -e "${RED}❌ Failed: $failed${NC}"
echo ""

if [ "$success" -eq 0 ]; then
    echo -e "${RED}⚠ No successful tests! Check:${NC}"
    echo "  1. Is enter.pollinations.ai running? (npm run dev)"
    echo "  2. Is the image backend accessible?"
    echo "  3. Is the token valid?"
    echo ""
fi

# Pricing breakdown table
echo "=================================================================="
echo -e "${BLUE}💰 Pricing Validation Results${NC}"
echo "=================================================================="
echo ""
printf "%-12s | %-12s | %-12s | %-8s | %s\n" "Model" "Op Cost" "User Cost" "Tokens" "Status"
echo "-------------|--------------|--------------|----------|--------"

for model in $MODELS; do
    status_file="$OUTPUT_DIR/${model}_status.json"
    
    if [ -f "$status_file" ]; then
        http_code=$(jq -r '.http_code' "$status_file")
        op_cost=$(jq -r '.pricing.expected_operational_cost_usd' "$status_file")
        user_cost=$(jq -r '.pricing.user_price_usd' "$status_file")
        tokens=$(jq -r '.usage.completion_image_tokens' "$status_file")
        is_free=$(jq -r '.pricing.is_free_tier' "$status_file")
        
        if [ "$http_code" = "200" ]; then
            if [ "$is_free" = "true" ]; then
                printf "${GREEN}%-12s${NC} | \$%-11s | ${GREEN}\$%-11s${NC} | %-8s | ${GREEN}✓${NC}\n" "$model" "$op_cost" "$user_cost" "$tokens"
            else
                printf "${MAGENTA}%-12s${NC} | \$%-11s | \$%-11s | %-8s | ${GREEN}✓${NC}\n" "$model" "$op_cost" "$user_cost" "$tokens"
            fi
        else
            printf "${RED}%-12s${NC} | %-12s | %-12s | %-8s | ${RED}✗${NC}\n" "$model" "-" "-" "-"
        fi
    fi
done

echo ""
echo "=================================================================="
echo -e "${BLUE}📁 Output Files${NC}"
echo "=================================================================="
echo ""
echo "Test results saved to: ${CYAN}$OUTPUT_DIR/${NC}"
echo ""
echo "Files generated:"
echo "  ├─ <model>_headers.txt   - HTTP response headers (includes usage data)"
echo "  ├─ <model>_status.json   - Detailed test results and pricing"
echo "  └─ <model>.jpg           - Generated images"
echo ""

# Detailed validation for successful tests
if [ "$success" -gt 0 ]; then
    echo "=================================================================="
    echo -e "${BLUE}🔍 Detailed Pricing Validation${NC}"
    echo "=================================================================="
    echo ""
    
    for status_file in "$OUTPUT_DIR"/*_status.json; do
        if [ -f "$status_file" ]; then
            model=$(jq -r '.model' "$status_file")
            http_code=$(jq -r '.http_code' "$status_file")
            
            if [ "$http_code" = "200" ]; then
                op_cost=$(jq -r '.pricing.expected_operational_cost_usd' "$status_file")
                user_price=$(jq -r '.pricing.user_price_usd' "$status_file")
                tokens=$(jq -r '.usage.completion_image_tokens' "$status_file")
                is_free=$(jq -r '.pricing.is_free_tier' "$status_file")
                matches=$(jq -r '.pricing.pricing_matches_expected' "$status_file")
                
                echo -e "${CYAN}$model:${NC}"
                pricing_type=$(jq -r '.pricing.pricing_type' "$status_file")
                cost_rate=$(jq -r '.pricing.cost_rate' "$status_file")
                
                if [ "$pricing_type" = "per-token" ]; then
                    echo "  Pricing Type:        Per-token (\$$cost_rate/token)"
                    echo "  Tokens Used:         $tokens"
                    echo "  Calculated Cost:     $tokens × \$$cost_rate = \$$op_cost"
                else
                    echo "  Pricing Type:        Per-image (\$$cost_rate/image)"
                    echo "  Tokens Used:         $tokens"
                    echo "  Fixed Cost:          \$$op_cost"
                fi
                echo "  User Price:          \$$user_price"
                echo "  Free Tier:           $is_free"
                
                if [ "$matches" = "true" ]; then
                    echo -e "  Validation:          ${GREEN}✓ Matches expected${NC}"
                elif [ "$matches" = "variable" ]; then
                    echo -e "  Validation:          ${YELLOW}○ Variable pricing${NC}"
                elif [ "$tokens" = "0" ]; then
                    echo -e "  Validation:          ${RED}✗ No usage data${NC}"
                else
                    echo -e "  Validation:          ${YELLOW}? Check manually${NC}"
                fi
                echo ""
            fi
        fi
    done
fi

echo "=================================================================="
echo -e "${GREEN}✅ Testing complete!${NC}"
echo "=================================================================="
