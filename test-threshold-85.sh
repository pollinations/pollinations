#!/bin/bash

echo "Testing with 85% Similarity Threshold"
echo "====================================="
echo ""

test_prompt() {
    local prompt="$1"
    local encoded_prompt=$(echo "$prompt" | sed 's/ /%20/g')
    
    # Make request and capture headers
    response=$(curl -s -D - "http://localhost:8787/prompt/$encoded_prompt?model=flux&width=512&height=512" -o /dev/null)
    
    # Extract cache info
    cache_status=$(echo "$response" | grep -i "x-cache:" | awk '{print $2}' | tr -d '\r')
    cache_type=$(echo "$response" | grep -i "x-cache-type:" | awk '{print $2}' | tr -d '\r')
    similarity=$(echo "$response" | grep -i "x-semantic-similarity:" | awk '{print $2}' | tr -d '\r')
    
    if [ "$cache_status" = "HIT" ] && [ "$cache_type" = "semantic" ]; then
        printf "%-30s → HIT  (%.1f%%)\n" "\"$prompt\"" "$(echo "$similarity * 100" | bc)"
    elif [ "$cache_status" = "HIT" ]; then
        printf "%-30s → EXACT HIT\n" "\"$prompt\""
    else
        printf "%-30s → MISS\n" "\"$prompt\""
    fi
    
    sleep 0.3
}

# Test organized by expected similarity
echo "VERY SIMILAR (>95% - Should HIT):"
test_prompt "little orange cat"
test_prompt "tiny cat orange"
test_prompt "small orange cat"
test_prompt "orange cat"

echo ""
echo "SIMILAR (90-95% - Should HIT):"
test_prompt "miniature orange kitty"
test_prompt "petite orange kitten"
test_prompt "large orange cat"
test_prompt "orange kitten"

echo ""
echo "SOMEWHAT SIMILAR (85-90% - Borderline):"
test_prompt "yellow cat"
test_prompt "small feline"
test_prompt "cute kitten"
test_prompt "orange tiger"
test_prompt "black cat"
test_prompt "ginger cat"
test_prompt "orange animal"
test_prompt "red cat"
test_prompt "tiny pet"

echo ""
echo "DIFFERENT (<85% - Should MISS):"
test_prompt "tiny orange car"
test_prompt "purple elephant"
test_prompt "orange sunset"
test_prompt "blue dog"
test_prompt "green parrot"
test_prompt "small orange fruit"

echo ""
echo "====================================="
