#!/bin/bash

echo "Testing Multilingual Prompts, Seed Effects, and Model Differences"
echo "================================================================="
echo ""

test_prompt() {
    local prompt="$1"
    local seed="$2"
    local model="$3"
    local width="$4"
    local height="$5"
    
    # Default parameters
    seed=${seed:-42}
    model=${model:-flux}
    width=${width:-512}
    height=${height:-512}
    
    # Proper URL encoding
    local encoded_prompt=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$prompt'))")
    
    # Build URL with all parameters
    local url="http://localhost:8787/prompt/$encoded_prompt?model=$model&width=$width&height=$height&seed=$seed"
    
    # Make request and capture headers
    response=$(curl -s -D - "$url" -o /dev/null)
    
    # Extract cache info
    cache_status=$(echo "$response" | grep -i "x-cache:" | awk '{print $2}' | tr -d '\r')
    cache_type=$(echo "$response" | grep -i "x-cache-type:" | awk '{print $2}' | tr -d '\r')
    similarity=$(echo "$response" | grep -i "x-semantic-similarity:" | awk '{print $2}' | tr -d '\r')
    
    if [ "$cache_status" = "HIT" ] && [ "$cache_type" = "semantic" ]; then
        printf "%-35s [seed=$seed, model=$model] → HIT (%.1f%%)\n" "\"$prompt\"" "$(echo "$similarity * 100" | bc)"
    elif [ "$cache_status" = "HIT" ]; then
        printf "%-35s [seed=$seed, model=$model] → EXACT HIT\n" "\"$prompt\""
    else
        printf "%-35s [seed=$seed, model=$model] → MISS\n" "\"$prompt\""
    fi
    
    sleep 0.3
}

echo "BASELINE: Store some English prompts first"
echo "=========================================="
test_prompt "tiny orange cat" 42 "flux" 512 512
test_prompt "small blue dog" 42 "flux" 512 512

echo ""
echo "1. MULTILINGUAL TESTS (same meaning, different languages)"
echo "======================================================="
echo "Testing if BGE model understands different languages..."
echo ""

echo "Orange cat in different languages:"
test_prompt "gato naranja pequeño" 42 "flux" 512 512      # Spanish
test_prompt "petit chat orange" 42 "flux" 512 512         # French  
test_prompt "kleine orange Katze" 42 "flux" 512 512       # German
test_prompt "piccolo gatto arancione" 42 "flux" 512 512   # Italian
test_prompt "小さなオレンジ色の猫" 42 "flux" 512 512     # Japanese

echo ""
echo "Blue dog in different languages:"
test_prompt "perro azul pequeño" 42 "flux" 512 512        # Spanish
test_prompt "petit chien bleu" 42 "flux" 512 512          # French
test_prompt "kleiner blauer Hund" 42 "flux" 512 512       # German

echo ""
echo "2. SEED VARIATION TESTS"
echo "======================="
echo "Testing if different seeds affect semantic matching..."
echo ""

echo "Same prompt, different seeds:"
test_prompt "tiny orange cat" 1 "flux" 512 512
test_prompt "tiny orange cat" 999 "flux" 512 512
test_prompt "tiny orange cat" -1 "flux" 512 512

echo ""
echo "Similar prompt, different seeds:"
test_prompt "small orange kitten" 1 "flux" 512 512
test_prompt "small orange kitten" 999 "flux" 512 512

echo ""
echo "3. MODEL VARIATION TESTS"
echo "========================"
echo "Testing if different models are properly isolated..."
echo ""

echo "Same prompt, different models:"
test_prompt "tiny orange cat" 42 "flux" 512 512
test_prompt "tiny orange cat" 42 "sdxl" 512 512
test_prompt "tiny orange cat" 42 "midjourney" 512 512

echo ""
echo "Similar prompt, different models:"
test_prompt "small orange kitten" 42 "flux" 512 512
test_prompt "small orange kitten" 42 "sdxl" 512 512

echo ""
echo "4. RESOLUTION + MODEL + SEED COMBINATION"
echo "========================================"
echo "Testing complex parameter combinations..."
echo ""

test_prompt "tiny orange cat" 42 "flux" 1024 1024
test_prompt "small orange kitten" 42 "flux" 1024 1024
test_prompt "tiny orange cat" 99 "sdxl" 512 512

echo ""
echo "================================================================="
echo "Test complete! Analyzing bucket isolation and cross-language matching..."
