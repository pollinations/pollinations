#!/bin/bash

echo "Testing with 93% Similarity Threshold"
echo "====================================="
echo ""

test_prompt() {
    local prompt="$1"
    # Proper URL encoding using python
    local encoded_prompt=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$prompt'))")
    
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

echo "Testing various prompts against cached orange cat images..."
echo "Cached prompts include: tiny orange cat, small orange cat, etc."
echo ""

# Test all prompts and organize by result
test_prompt "little orange cat"
test_prompt "tiny cat orange"
test_prompt "small orange cat"
test_prompt "orange cat"
test_prompt "miniature orange kitty"
test_prompt "petite orange kitten"
test_prompt "large orange cat"
test_prompt "orange kitten"
test_prompt "yellow cat"
test_prompt "small feline"
test_prompt "cute kitten"
test_prompt "orange tiger"
test_prompt "black cat"
test_prompt "ginger cat"
test_prompt "orange animal"
test_prompt "red cat"
test_prompt "tiny pet"
test_prompt "tiny orange car"
test_prompt "purple elephant"
test_prompt "orange sunset"
test_prompt "blue dog"
test_prompt "green parrot"
test_prompt "small orange fruit"

echo ""
echo "====================================="
