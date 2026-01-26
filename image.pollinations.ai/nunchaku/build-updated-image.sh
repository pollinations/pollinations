#!/bin/bash

# Build script for updated Flux Docker image with fixes
# This builds on top of the existing pollinations/flux-svdquant:latest image

echo "Building updated Flux image with server.py fixes..."

# Build the image
docker build -f Dockerfile.updated -t pollinations/flux-svdquant:updated .

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo ""
    echo "To push to Docker Hub (requires login):"
    echo "  docker push pollinations/flux-svdquant:updated"
    echo ""
    echo "To use on io.net instances, update the container commands to use:"
    echo "  pollinations/flux-svdquant:updated"
    echo ""
    echo "The image includes:"
    echo "  - Updated server.py with PUBLIC_PORT support"
    echo "  - Direct EC2 endpoint as default REGISTER_URL"
    echo "  - Proper SERVICE_TYPE=flux"
else
    echo "❌ Build failed!"
    exit 1
fi