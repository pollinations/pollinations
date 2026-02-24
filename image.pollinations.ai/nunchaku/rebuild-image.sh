#!/bin/bash
# Rebuild and push the Flux SVDQuant Docker image
#
# This script patches the existing working base image (87362500968a) with
# the updated server.py. Building nunchaku from source in Docker fails
# because there's no GPU to detect SM targets, so we layer on top of
# the pre-built base image instead.
#
# Usage:
#   ./rebuild-image.sh              # Build and push
#   ./rebuild-image.sh --no-push    # Build only
#
# Prerequisites:
#   - Docker logged in to Docker Hub (docker login)
#   - Base image 87362500968a available locally

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="pollinations/flux-svdquant"
BASE_IMAGE="87362500968a"

echo "=== Rebuilding $IMAGE_NAME ==="

# Check if base image exists
if ! docker image inspect "$BASE_IMAGE" &>/dev/null; then
    echo "Error: Base image $BASE_IMAGE not found locally."
    echo "Pull it first or run on a machine that has it."
    exit 1
fi

# Create temporary Dockerfile
TEMP_DOCKERFILE=$(mktemp)
cat > "$TEMP_DOCKERFILE" << EOF
FROM $BASE_IMAGE
COPY server.py /app/server.py
EOF

echo "Building image..."
docker build -f "$TEMP_DOCKERFILE" -t "$IMAGE_NAME:latest" "$SCRIPT_DIR"

rm "$TEMP_DOCKERFILE"

echo "Image built: $IMAGE_NAME:latest"
docker images | grep "$IMAGE_NAME" | head -3

if [[ "$1" != "--no-push" ]]; then
    echo ""
    echo "Pushing to Docker Hub..."
    docker push "$IMAGE_NAME:latest"
    echo "Done! Image pushed to $IMAGE_NAME:latest"
else
    echo ""
    echo "Skipping push (--no-push specified)"
fi
