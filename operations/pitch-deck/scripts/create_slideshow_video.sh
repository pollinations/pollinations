#!/bin/bash

# Usage: ./create_slideshow_video.sh <input_directory> <output_video.mp4>
# Creates a simple slideshow video from images in the specified directory.
# Each image is shown for 3 seconds with hard cuts between them.

# --- Configuration ---
INPUT_DIR="$1" # Input directory is the first argument
OUTPUT="$2"    # Output is the second argument
DURATION=3     # seconds each image stays on screen
FRAMERATE=30   # output video framerate
WIDTH=800      # width of output video
HEIGHT=450     # height of output video
# --- End Configuration ---

# Check if all parameters are provided
if [ -z "$INPUT_DIR" ] || [ -z "$OUTPUT" ]; then
    echo "Usage: $0 <input_directory> <output_video.mp4>"
    exit 1
fi

# Check if input directory exists
if [ ! -d "$INPUT_DIR" ]; then
    echo "Error: Input directory '$INPUT_DIR' not found."
    exit 1
fi

# Check if ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "Error: 'ffmpeg' command is not installed. Please install it."
    exit 1
fi

TMP_DIR="./_tmp_ffmpeg_slideshow_$(basename "$INPUT_DIR")"
rm -rf "$TMP_DIR" # Clean previous runs
mkdir -p "$TMP_DIR/processed"

PROCESSED_DIR="$TMP_DIR/processed"

# --- 1. Preprocess Images ---
echo "Preprocessing images from $INPUT_DIR..."

# Find and convert input images
shopt -s extglob # Enable extended globbing
IMAGES=($(ls "$INPUT_DIR"/*.@(png|jpg|jpeg|PNG|JPG|JPEG) 2>/dev/null | sort))
shopt -u extglob # Disable extended globbing
COUNT=${#IMAGES[@]}

if [ $COUNT -eq 0 ]; then
    echo "Error: No images (.png, .jpg, .jpeg) found in '$INPUT_DIR'"
    exit 1
fi
echo "Found $COUNT images."

for ((i=0; i<COUNT; i++)); do
  IN_IMG="${IMAGES[i]}"
  OUT_IMG_NUM=$(printf "%04d.png" $i)
  OUT_IMG_PATH="$PROCESSED_DIR/$OUT_IMG_NUM"
  echo -ne "Processing image $((i + 1))/$COUNT: $OUT_IMG_NUM \r"
  ffmpeg -y -loglevel error -i "$IN_IMG" -vf "scale=$WIDTH:$HEIGHT:force_original_aspect_ratio=decrease,pad=$WIDTH:$HEIGHT:(ow-iw)/2:(oh-ih)/2:color=black,format=rgba" "$OUT_IMG_PATH"
   if [ $? -ne 0 ]; then echo -e "\nError processing image: $IN_IMG"; exit 1; fi
done
echo -e "\nPreprocessing finished."

# --- 2. Create slideshow video ---
echo "Creating slideshow video..."

ffmpeg -y -framerate 1/$DURATION -pattern_type glob -i "$PROCESSED_DIR/*.png" \
  -vf "fps=$FRAMERATE,format=yuv420p" \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$OUTPUT"

if [ $? -ne 0 ]; then echo "Error during video creation"; exit 1; fi
echo "Slideshow video created: $OUTPUT"

# --- Cleanup ---
echo "Cleaning up temporary files..."
rm -r "$TMP_DIR"

echo "Script finished." 