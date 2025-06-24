#!/bin/bash

# Test various prompts against the semantic cache
# Current similarity threshold is 0.5 (50%)

echo "Testing Semantic Cache Similarity..."
echo "==================================="
echo ""

test_prompt() {
    local prompt="$1"
    local encoded_prompt=$(echo "$prompt" | sed 's/ /%20/g')
    
    echo "Testing: \"$prompt\""
    
    # Make request and capture headers
    response=$(curl -s -D - "http://localhost:8787/prompt/$encoded_prompt?model=flux&width=512&height=512" -o /dev/null)
    
    # Extract cache info
    cache_status=$(echo "$response" | grep -i "x-cache:" | awk '{print $2}' | tr -d '\r')
    cache_type=$(echo "$response" | grep -i "x-cache-type:" | awk '{print $2}' | tr -d '\r')
    similarity=$(echo "$response" | grep -i "x-semantic-similarity:" | awk '{print $2}' | tr -d '\r')
    
    if [ "$cache_status" = "HIT" ] && [ "$cache_type" = "semantic" ]; then
        echo "  → SEMANTIC HIT (${similarity} similarity)"
    elif [ "$cache_status" = "HIT" ]; then
        echo "  → EXACT HIT"
    else
        echo "  → MISS (storing new embedding)"
    fi
    echo ""
    
    # Small delay to avoid overwhelming the server
    sleep 0.5
}

echo "Currently cached prompts (from previous tests):"
echo "- very tiny orange kitty"
echo "- small cat with orange fur"
echo "- orange kitten small cute"
echo "- small orange cat"
echo "- tiny orange cat"
echo ""
echo "Current similarity threshold: 0.5 (50%)"
echo "==================================="
echo ""

# Test prompts that should hit (similar to cats/orange)
echo "EXPECTED HITS (similar to cached prompts):"
test_prompt "tiny orange cat"
test_prompt "small orange feline"
test_prompt "little orange cat"
test_prompt "orange cat"
test_prompt "tiny cat orange"
test_prompt "miniature orange kitty"
test_prompt "petite orange kitten"

echo ""
echo "BORDERLINE CASES (might hit or miss):"
test_prompt "ginger cat"
test_prompt "orange animal"
test_prompt "cute kitten"
test_prompt "small feline"
test_prompt "tiny pet"
test_prompt "red cat"
test_prompt "yellow cat"

echo ""
echo "EXPECTED MISSES (different subjects):"
test_prompt "blue dog"
test_prompt "green parrot"
test_prompt "tiny orange car"
test_prompt "small orange fruit"
test_prompt "orange sunset"
test_prompt "purple elephant"
test_prompt "black cat"  # Different color cat
test_prompt "large orange cat"  # Size mismatch
test_prompt "orange tiger"  # Different feline

echo ""
echo "==================================="
echo "Test complete!"
