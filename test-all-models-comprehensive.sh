#!/usr/bin/env bash
# Comprehensive test: All 6 image models × 3 sizes each = 18 images
# With complex unique prompts to avoid cache hits

set -e

TOKEN="sk_yvDGllFYQR9pRMY5J5G9vgaejH7zgshKqTA3a8utaQ8q0J1pRxc5hiGHxMheCw2q"
BASE_URL="http://localhost:3000"
OUTPUT_DIR="all-models-sizes-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUTPUT_DIR"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  🎨 Comprehensive Size Test - All Image Models  ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""
echo "Testing 6 models × 3 sizes = 18 total images"
echo "Each with unique complex prompts to avoid cache"
echo ""

# Helper functions
get_model_cost_type() {
    case "$1" in
        flux) echo "per-image" ;;
        turbo) echo "per-image" ;;
        kontext) echo "per-image" ;;
        gptimage) echo "per-token" ;;
        seedream) echo "per-image" ;;
        nanobanana) echo "per-token" ;;
    esac
}

get_model_cost_rate() {
    case "$1" in
        flux) echo "0.00012" ;;
        turbo) echo "0.0003" ;;
        kontext) echo "0.04" ;;
        gptimage) echo "0.000008" ;;
        seedream) echo "0.03" ;;
        nanobanana) echo "0.00003" ;;
    esac
}

is_free_model() {
    [ "$1" = "flux" ]
}

# Size configurations for each model
get_sizes() {
    case "$1" in
        flux) echo "512 768 1024" ;;
        turbo) echo "512 768 1024" ;;
        kontext) echo "512 768 1024" ;;
        gptimage) echo "512 768 1024" ;;
        seedream) echo "960 1536 2048" ;;
        nanobanana) echo "512 1024 2048" ;;
    esac
}

# Complex unique prompts
get_prompt() {
    case "$1" in
        1) echo "ancient_steampunk_observatory_brass_telescopes_Victorian_scientists_calculations_$RANDOM" ;;
        2) echo "bioluminescent_underwater_city_coral_jellyfish_submarines_art_nouveau_$RANDOM" ;;
        3) echo "cyberpunk_ramen_shop_neon_kanji_rain_holographic_menu_steam_$RANDOM" ;;
        4) echo "enchanted_library_floating_books_spiral_staircases_mystical_light_$RANDOM" ;;
        5) echo "desert_oasis_sunset_palm_trees_bedouin_tents_golden_dunes_$RANDOM" ;;
        6) echo "arctic_station_aurora_borealis_ice_crystals_modern_architecture_$RANDOM" ;;
        7) echo "tropical_treehouse_village_rope_bridges_waterfalls_birds_canopy_$RANDOM" ;;
        8) echo "volcanic_forge_dragon_smithy_molten_lava_magical_weapons_runes_$RANDOM" ;;
        9) echo "futuristic_greenhouse_vertical_farming_robotic_gardeners_glass_$RANDOM" ;;
        10) echo "medieval_market_square_colorful_stalls_merchants_cobblestones_$RANDOM" ;;
        11) echo "space_station_observation_nebula_zero_gravity_curved_windows_$RANDOM" ;;
        12) echo "art_deco_skyscraper_rooftop_party_jazz_champagne_geometric_$RANDOM" ;;
        13) echo "abandoned_theme_park_overgrown_rust_nature_reclaiming_eerie_$RANDOM" ;;
        14) echo "crystal_cave_cathedral_rainbow_reflections_underground_lake_$RANDOM" ;;
        15) echo "retro_diner_chrome_red_vinyl_jukebox_checkered_milkshakes_$RANDOM" ;;
        16) echo "zen_garden_koi_pond_cherry_blossoms_stone_lanterns_gravel_$RANDOM" ;;
        17) echo "clockwork_circus_automatons_brass_gears_steam_Victorian_$RANDOM" ;;
        18) echo "post_apocalyptic_library_nature_overgrown_survival_hope_$RANDOM" ;;
    esac
}

total_tests=0
successful_tests=0
failed_tests=0
prompt_counter=1

# Create summary file
summary_file="$OUTPUT_DIR/summary.csv"
echo "Model,SizeLabel,Width,Height,Tokens,Cost,FileSizeKB,Duration,Status" > "$summary_file"

# Test all models
for model in flux turbo kontext gptimage seedream nanobanana; do
    echo ""
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${MAGENTA}  Testing Model: $model${NC}"
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    cost_type=$(get_model_cost_type "$model")
    cost_rate=$(get_model_cost_rate "$model")
    sizes=$(get_sizes "$model")
    
    size_counter=0
    for size in $sizes; do
        size_counter=$((size_counter + 1))
        total_tests=$((total_tests + 1))
        
        case $size_counter in
            1) size_label="Small" ;;
            2) size_label="Medium" ;;
            3) size_label="Large" ;;
        esac
        
        prompt=$(get_prompt "$prompt_counter")
        prompt_counter=$((prompt_counter + 1))
        
        echo -e "${CYAN}  [${total_tests}/18] ${size_label}: ${size}×${size}${NC}"
        
        output_file="$OUTPUT_DIR/${model}_${size}.jpg"
        headers_file="$OUTPUT_DIR/${model}_${size}_headers.txt"
        
        start_time=$(date +%s)
        http_code=$(curl -s -w "%{http_code}" \
            -D "$headers_file" \
            -o "$output_file" \
            "$BASE_URL/api/generate/image/${prompt}?model=${model}&width=${size}&height=${size}&nologo=true" \
            -H "Authorization: Bearer $TOKEN")
        end_time=$(date +%s)
        duration=$((end_time - start_time))
        
        # Parse results
        tokens=$(grep -i "^x-usage-completion-image-tokens:" "$headers_file" 2>/dev/null | cut -d: -f2- | tr -d '[:space:]' || echo "0")
        file_size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null || echo "0")
        file_size_kb=$(echo "scale=0; $file_size / 1024" | bc)
        
        # Calculate cost
        if [ "$cost_type" = "per-token" ] && [ "$tokens" != "0" ]; then
            cost=$(echo "$tokens * $cost_rate" | bc -l)
        else
            cost=$cost_rate
        fi
        
        # Check success
        if [ "$http_code" = "200" ] && [ "$file_size" -gt "1000" ]; then
            echo -e "    ${GREEN}✓${NC} ${file_size_kb} KB | ${duration}s | ${tokens} tokens | \$$cost"
            successful_tests=$((successful_tests + 1))
            status="SUCCESS"
        else
            echo -e "    ${RED}✗${NC} Failed (HTTP $http_code)"
            failed_tests=$((failed_tests + 1))
            status="FAILED"
        fi
        
        # Save to CSV
        echo "$model,$size_label,$size,$size,$tokens,$cost,$file_size_kb,$duration,$status" >> "$summary_file"
        
        sleep 1
    done
done

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  📊 Final Results Summary  ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""
echo "Total Tests: $total_tests"
echo -e "${GREEN}Successful: $successful_tests${NC}"
echo -e "${RED}Failed: $failed_tests${NC}"
echo ""

# Detailed table
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results by Model"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for model in flux turbo kontext gptimage seedream nanobanana; do
    cost_type=$(get_model_cost_type "$model")
    echo -e "${CYAN}$model${NC} ($cost_type)"
    printf "  %-8s | %-12s | %-8s | %-12s | %-8s\n" "Size" "Dimensions" "Tokens" "Cost" "File"
    echo "  ---------|--------------|----------|--------------|----------"
    
    grep "^$model," "$summary_file" | while IFS=, read -r m size_label width height tokens cost file_kb duration status; do
        if [ "$status" = "SUCCESS" ]; then
            printf "  %-8s | %-12s | %-8s | \$%-11s | %s KB\n" "$size_label" "${width}×${height}" "$tokens" "$cost" "$file_kb"
        else
            printf "  %-8s | %-12s | %-8s | %-12s | %s\n" "$size_label" "${width}×${height}" "-" "FAILED" "-"
        fi
    done
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 All files saved to: $OUTPUT_DIR/"
echo "📊 CSV Summary: $OUTPUT_DIR/summary.csv"
echo ""
echo "To view all images:"
echo "  open $OUTPUT_DIR/"
echo ""
