#!/bin/bash

# Enhanced Test Script for Semantic Cache Isolation Testing
# Tests seed and model parameter isolation in vectorize image caching
# Based on GitHub issue #2562

echo "==================================="
echo "Semantic Cache Isolation Testing"
echo "==================================="
echo ""
echo "Testing that different seeds and models don't match each other"
echo "Current similarity threshold: 93% (0.93)"
echo ""

# Base URL - adjust port if needed
BASE_URL="http://localhost:8787"

# Function to make request and extract cache headers
test_request() {
    local prompt="$1"
    local width="$2"
    local height="$3"
    local model="$4"
    local seed="$5"
    local description="$6"
    
    local encoded_prompt=$(echo "$prompt" | sed 's/ /%20/g')
    local url="${BASE_URL}/prompt/${encoded_prompt}?width=${width}&height=${height}&model=${model}&seed=${seed}"
    
    echo "Testing: $description"
    echo "  URL: ${url}"
    
    # Make request and capture headers
    response=$(curl -s -D - "$url" -o /dev/null 2>/dev/null)
    
    # Extract cache info
    cache_status=$(echo "$response" | grep -i "x-cache:" | awk '{print $2}' | tr -d '\r')
    cache_type=$(echo "$response" | grep -i "x-cache-type:" | awk '{print $2}' | tr -d '\r')
    similarity=$(echo "$response" | grep -i "x-semantic-similarity:" | awk '{print $2}' | tr -d '\r')
    bucket=$(echo "$response" | grep -i "x-semantic-bucket:" | awk '{print $2}' | tr -d '\r')
    
    if [ "$cache_status" = "HIT" ] && [ "$cache_type" = "semantic" ]; then
        echo "  → 🎯 SEMANTIC HIT (${similarity} similarity) [bucket: ${bucket}]"
    elif [ "$cache_status" = "HIT" ]; then
        echo "  → ✅ EXACT HIT [bucket: ${bucket}]"
    else
        echo "  → ❌ MISS (storing new embedding) [bucket: ${bucket}]"
    fi
    echo ""
    
    # Small delay to avoid overwhelming server
    sleep 1
}

# Test Case 1: Baseline - Cache first image
echo "PHASE 1: Caching baseline images"
echo "================================"
test_request "tiny orange cat" "512" "512" "flux" "42" "Baseline 1: flux model, seed 42"
test_request "tiny orange cat" "512" "512" "sdxl" "42" "Baseline 2: sdxl model, seed 42"
test_request "tiny orange cat" "512" "512" "flux" "123" "Baseline 3: flux model, seed 123"
test_request "tiny orange cat" "1024" "1024" "flux" "42" "Baseline 4: flux model, different resolution"

echo "⏳ Waiting 3 seconds for embeddings to be stored..."
sleep 3

# Test Case 2: Same prompt, same resolution, same model, same seed (should be EXACT HIT)
echo "PHASE 2: Testing exact matches (should be EXACT HITs)"
echo "===================================================="
test_request "tiny orange cat" "512" "512" "flux" "42" "EXACT: Same everything"

# Test Case 3: Same prompt, same resolution, same model, DIFFERENT seed
echo "PHASE 3: Testing seed isolation"
echo "==============================="
echo "Key question: Should different seeds match semantically?"
echo ""
test_request "tiny orange cat" "512" "512" "flux" "999" "SEED TEST: Different seed (999 vs 42)"
test_request "tiny orange cat" "512" "512" "flux" "0" "SEED TEST: Different seed (0 vs 42)"

# Test Case 4: Same prompt, same resolution, DIFFERENT model, same seed  
echo "PHASE 4: Testing model isolation"
echo "================================"
echo "Critical: Different models should NOT match (different architectures)"
echo ""
test_request "tiny orange cat" "512" "512" "sdxl" "999" "MODEL TEST: SDXL vs FLUX (different seed)"
test_request "tiny orange cat" "512" "512" "midjourney" "42" "MODEL TEST: Midjourney vs FLUX"

# Test Case 5: Same prompt, DIFFERENT resolution (should be isolated by bucket)
echo "PHASE 5: Testing resolution isolation"
echo "===================================="
echo "Different resolutions should use different buckets"
echo ""
test_request "tiny orange cat" "1024" "1024" "flux" "999" "RESOLUTION TEST: 1024x1024 vs 512x512"
test_request "tiny orange cat" "768" "768" "flux" "42" "RESOLUTION TEST: 768x768 vs others"

# Test Case 6: Similar prompts (should potentially match if semantically similar)
echo "PHASE 6: Testing semantic similarity (positive cases)"
echo "====================================================="
echo "These should potentially hit semantically if prompts are similar enough"
echo ""
test_request "small orange kitten" "512" "512" "flux" "42" "SEMANTIC TEST: Similar prompt, same params"
test_request "tiny orange feline" "512" "512" "flux" "999" "SEMANTIC TEST: Similar prompt, different seed"

# Test Case 7: Dissimilar prompts (should miss)
echo "PHASE 7: Testing semantic dissimilarity (negative cases)" 
echo "========================================================"
echo "These should miss - different subjects entirely"
echo ""
test_request "blue dog" "512" "512" "flux" "42" "NEGATIVE TEST: Different subject entirely"
test_request "red car" "512" "512" "flux" "42" "NEGATIVE TEST: Different subject entirely"

echo "==================================="
echo "Test Analysis Summary"
echo "==================================="
echo ""
echo "Key Questions Addressed:"
echo "1. SEED ISOLATION: Do different seeds with same prompt/model/resolution match?"
echo "   - If they MISS → Seeds create different enough images to warrant isolation"  
echo "   - If they HIT → Seeds don't significantly affect semantic similarity"
echo ""
echo "2. MODEL ISOLATION: Do different models with same prompt/resolution match?"
echo "   - Should always MISS → Different models have different capabilities/styles"
echo ""
echo "3. RESOLUTION ISOLATION: Do different resolutions use different buckets?"
echo "   - Should always MISS → Already implemented via bucket system"
echo ""
echo "4. SEMANTIC MATCHING: Do similar prompts match appropriately?"
echo "   - Similar prompts should HIT with high similarity scores"
echo "   - Dissimilar prompts should MISS"
echo ""
echo "Current Architecture Analysis:"
echo "- Cache Key in R2: Contains ALL parameters (prompt, model, seed, resolution)"
echo "- Vectorize Metadata: Contains cacheKey, bucket (resolution), model"
echo "- Bucket Structure: Currently only resolution (e.g., '512x512')"
echo "- Model Filter: Applied during vectorize query"
echo "- Seed: NOT currently considered in bucketing or filtering"
echo ""
echo "Expected Behavior Based on Current Implementation:"
echo "✅ Different resolutions → Different buckets → MISS (correct)"
echo "✅ Different models → Model filter → MISS (correct)" 
echo "❓ Different seeds → Same bucket, same model filter → POTENTIAL HIT"
echo ""
echo "If seeds should be isolated, bucket should include seed:"
echo "Current: bucket = '512x512'"
echo "Proposed: bucket = '512x512_seed42' or model filter = 'flux_seed42'"
