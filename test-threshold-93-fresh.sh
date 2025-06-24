#!/bin/bash

echo "Testing with 93% Similarity Threshold - Fresh Prompts"
echo "===================================================="
echo ""
echo "Testing against cached: 'tiny orange cat', 'small orange cat', etc."
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
        printf "%-35s → SEMANTIC HIT (%.1f%%)\n" "\"$prompt\"" "$(echo "$similarity * 100" | bc)"
    elif [ "$cache_status" = "HIT" ] && [ "$cache_type" = "exact" ]; then
        printf "%-35s → EXACT HIT\n" "\"$prompt\""
    else
        printf "%-35s → MISS\n" "\"$prompt\""
    fi
    
    sleep 0.2
}

echo "VERY SIMILAR (>95% expected):"
test_prompt "minuscule orange feline"
test_prompt "teeny orange kitty"
test_prompt "wee orange cat"
test_prompt "diminutive orange cat"

echo ""
echo "SIMILAR (93-95% expected):"
test_prompt "mini tangerine cat"
test_prompt "compact orange kitten"
test_prompt "petite ginger feline"
test_prompt "modest orange cat"

echo ""
echo "SOMEWHAT SIMILAR (90-93% - should MISS with 93% threshold):"
test_prompt "amber colored cat"
test_prompt "rust colored feline"
test_prompt "peachy cat"
test_prompt "copper kitten"
test_prompt "apricot cat"

echo ""
echo "DIFFERENT (<90% - should definitely MISS):"
test_prompt "massive orange lion"
test_prompt "orange tabby pattern"
test_prompt "calico with orange"
test_prompt "tortoiseshell cat"
test_prompt "orange fish"
test_prompt "mandarin duck"
test_prompt "autumn leaves"
test_prompt "carrot vegetable"

echo ""
echo "===================================================="
