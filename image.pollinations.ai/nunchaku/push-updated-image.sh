#!/bin/bash

# Push the updated Flux image to Docker Hub
# Requires Docker Hub login credentials

echo "Pushing pollinations/flux-svdquant:updated to Docker Hub..."
echo "Note: The image is 17.5GB total, but only ~12KB will be uploaded (just the updated server.py layer)"
echo ""

# Check if logged in
if ! docker info 2>/dev/null | grep -q "Username"; then
    echo "Please login to Docker Hub first:"
    echo "  docker login -u pollinations"
    exit 1
fi

# Push the image
docker push pollinations/flux-svdquant:updated

if [ $? -eq 0 ]; then
    echo "✅ Successfully pushed to Docker Hub!"
    echo ""
    echo "To use the updated image on io.net instances:"
    echo "  Change: pollinations/flux-svdquant:latest"
    echo "  To:     pollinations/flux-svdquant:updated"
else
    echo "❌ Push failed!"
    exit 1
fi