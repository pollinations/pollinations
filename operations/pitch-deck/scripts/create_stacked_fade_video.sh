#!/bin/bash

# Usage: ./create_stacked_fade_video.sh <output_video.mp4>
# Creates a video from images in markdown-slides/media/screenshots/.
# Top and bottom images (16:9) are stacked (final 16:18).
# Images are used sequentially and only once, alternating top/bottom updates every STEP seconds (hard cuts).

# --- Configuration ---
# INPUT_DIR="$1" # No longer needed, hardcoded below
OUTPUT="$1" # Output is now the first argument
INPUT_DIR="markdown-slides/media/screenshots" # Hardcoded input directory
STEP=1       # seconds between alternating changes
# FADE_DUR=0.2   # No fade in this version
FRAMERATE=30   # output video framerate
WIDTH=800      # width of each source image (and final video)
HEIGHT=450     # height of each source image (half final video height)
# --- End Configuration ---

# Calculated value: Duration each image stays in its slot (approximate)
DURATION=$(echo "$STEP * 2" | bc)

# Check if output path is provided
if [ -z "$OUTPUT" ]; then
    echo "Usage: $0 <output_video.mp4>"
    exit 1
fi

# Check if bc is installed
if ! command -v bc &> /dev/null; then
    echo "Error: 'bc' command is not installed. Please install it (e.g., 'sudo apt install bc' or 'brew install bc')."
    exit 1
fi

# Check if ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "Error: 'ffmpeg' command is not installed. Please install it."
    exit 1
fi


TMP_DIR="./_tmp_ffmpeg_alternating"
rm -rf "$TMP_DIR" # Clean previous runs
mkdir -p "$TMP_DIR/processed" "$TMP_DIR/step_frames"

PROCESSED_DIR="$TMP_DIR/processed"
STEP_FRAMES_DIR="$TMP_DIR/step_frames"
BLACK_IMG="$PROCESSED_DIR/black.png"

# --- 1. Preprocess Images ---
echo "Preprocessing images..."
# Create blank black image
ffmpeg -y -loglevel error -f lavfi -i "color=c=black:s=${WIDTH}x${HEIGHT}:d=0.1,format=rgba" -frames:v 1 "$BLACK_IMG"
if [ $? -ne 0 ]; then echo "Error creating black image."; exit 1; fi

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

# Check if there are enough images
if [ $COUNT -lt 2 ]; then
    echo "Error: Need at least 2 images in '$INPUT_DIR' for this script's logic."
    exit 1
fi

for ((i=0; i<COUNT; i++)); do
  IN_IMG="${IMAGES[i]}"
  OUT_IMG_NUM=$(printf "%04d.png" $i)
  OUT_IMG_PATH="$PROCESSED_DIR/$OUT_IMG_NUM"
  echo -ne "Processing image $((i + 1))/$COUNT: $OUT_IMG_NUM \r"
  ffmpeg -y -loglevel error -i "$IN_IMG" -vf "scale=$WIDTH:$HEIGHT:force_original_aspect_ratio=decrease,pad=$WIDTH:$HEIGHT:(ow-iw)/2:(oh-ih)/2:color=black,format=rgba" "$OUT_IMG_PATH"
   if [ $? -ne 0 ]; then echo -e "\nError processing image: $IN_IMG"; exit 1; fi
done
echo -e "\nPreprocessing finished."

# --- 2. Generate Intermediate Step Frames ---
echo "Generating intermediate stacked frames (sequential logic)..."
# Total steps = number of images. Loop from s=0 to COUNT-1
TOTAL_STEPS=$((COUNT - 1))

for ((s=0; s<COUNT; s++)); do
  # Determine which processed image index to use for top and bottom based on step 's'
  if (( s % 2 == 0 )); then # Even step: Top changes, Bottom stays
    top_idx=$s
    bottom_idx=$((s - 1))
  else # Odd step: Top stays, Bottom changes
    top_idx=$((s - 1))
    bottom_idx=$s
  fi

  # Get full paths to the images
  top_img_path="$PROCESSED_DIR/$(printf "%04d.png" $top_idx)"
  if [ $bottom_idx -lt 0 ]; then # Special case for s=0
    bottom_img_path="$BLACK_IMG"
  else
    bottom_img_path="$PROCESSED_DIR/$(printf "%04d.png" $bottom_idx)"
  fi

  # Create the stacked frame for this step
  out_step_frame="$STEP_FRAMES_DIR/$(printf "%04d.png" $s)"
  ffmpeg -y -loglevel error -i "$top_img_path" -i "$bottom_img_path" \
    -filter_complex "[0:v]format=rgba[t];[1:v]format=rgba[b];[t][b]vstack=inputs=2,format=rgba" \
    "$out_step_frame"
  if [ $? -ne 0 ]; then echo -e "\nError stacking frame $s using $top_img_path and $bottom_img_path"; exit 1; fi
  echo -ne "Generated frame $s/$TOTAL_STEPS\r"
done
echo -e "\nIntermediate frames generated."


# --- 3. Assemble Final Video (Hard Cuts) ---
echo "Assembling final video (hard cuts)..."

ffmpeg -y -framerate 1/$STEP -i "$STEP_FRAMES_DIR/%04d.png" \
  -vf "framerate=fps=$FRAMERATE,format=yuv420p" \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$OUTPUT"

if [ $? -ne 0 ]; then echo "Error during final assembly"; exit 1; fi
echo "Final video created: $OUTPUT"

# --- Cleanup ---
# echo "Cleaning up temporary files..."
# rm -r "$TMP_DIR"

echo "Script finished."