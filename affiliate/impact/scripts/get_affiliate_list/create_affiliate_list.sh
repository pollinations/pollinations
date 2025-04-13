#!/bin/bash

# Script to manually run the affiliate pipeline, one step at a time
# This script cleans the intermediate outputs to ensure proper JSON format

# Set working directory
cd "$(dirname "$0")"
BASEDIR="$(pwd)"
OUTPUT_DIR="$BASEDIR/output/intermediate_results"
FINAL_OUTPUT_DIR="$BASEDIR/output"
TIMESTAMP=$(date +"%Y-%m-%dT%H-%M-%S")

# Create output directories if they don't exist
mkdir -p "$OUTPUT_DIR"
mkdir -p "$FINAL_OUTPUT_DIR" # Ensure final output dir exists

echo "Starting affiliate pipeline with timestamp: $TIMESTAMP"

# Run step 1: Get tracking links
echo "Step 1: Running 1_impact_tracking_links.js"
node 1_impact_tracking_links.js > "$OUTPUT_DIR/1_impact_tracking_links_$TIMESTAMP.json"

# Check if the output has a trailing % character and remove it
sed -i'' -e 's/%$//' "$OUTPUT_DIR/1_impact_tracking_links_$TIMESTAMP.json"

# Remove the backup file created by sed -i''
rm -f "$OUTPUT_DIR/1_impact_tracking_links_$TIMESTAMP.json-e"

# Run step 2: Enrich tracking links
echo "Step 2: Running 2_impact_tracking_links_enrich.js"
cat "$OUTPUT_DIR/1_impact_tracking_links_$TIMESTAMP.json" | node 2_impact_tracking_links_enrich.js > "$OUTPUT_DIR/2_impact_tracking_links_enrich_$TIMESTAMP.json"

# Run step 3: Combine with custom affiliates
echo "Step 3: Running 3_custom_ad_combine.js"
cat "$OUTPUT_DIR/2_impact_tracking_links_enrich_$TIMESTAMP.json" | node 3_custom_ad_combine.js > "$OUTPUT_DIR/3_custom_ad_combine_$TIMESTAMP.json"

# Run step 4: Enrich with LLM data
echo "Step 4: Running 4_ad_llm_enrich.js (This is the final data step)"
cat "$OUTPUT_DIR/3_custom_ad_combine_$TIMESTAMP.json" | node 4_ad_llm_enrich.js > "$OUTPUT_DIR/4_ad_llm_enrich_$TIMESTAMP.json"

# Copy the output of Step 4 to the final output file
echo "Copying Step 4 output to final affiliate_list.json"
cp "$OUTPUT_DIR/4_ad_llm_enrich_$TIMESTAMP.json" "$FINAL_OUTPUT_DIR/affiliate_list.json"

# JS Generation and Markdown generation removed

echo "Pipeline complete!"
echo "Final files:"
echo " - Final JSON: $FINAL_OUTPUT_DIR/affiliate_list.json (raw output from step 4)"
echo " - Intermediate files in: $OUTPUT_DIR" 