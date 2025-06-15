#!/bin/bash

# Usage: ./create_all_slideshows.sh
# Processes all four screenshot folders and creates a separate slideshow for each one

# Base paths
BASE_DIR="markdown-slides/media/screenshots"
FOLDERS=("1" "2" "3" "4")
SCRIPT="./markdown-slides/scripts/create_slideshow_video.sh"

# Check if the script exists
if [ ! -f "$SCRIPT" ]; then
    echo "Error: Script not found: $SCRIPT"
    exit 1
fi

# Process each folder
for folder in "${FOLDERS[@]}"; do
    input_dir="$BASE_DIR/$folder"
    output_file="slideshow_folder_$folder.mp4"
    
    echo "==========================================================="
    echo "Processing folder $folder: $input_dir"
    echo "Output will be: $output_file"
    echo "==========================================================="
    
    $SCRIPT "$input_dir" "$output_file"
    
    echo ""
done

echo "All slideshows created successfully:"
for folder in "${FOLDERS[@]}"; do
    echo "- slideshow_folder_$folder.mp4"
done 