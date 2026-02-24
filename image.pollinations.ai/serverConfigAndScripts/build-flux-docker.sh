#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Build Docker image locally
log "Building Docker image locally"
cd ../nunchaku
docker build -t pollinations/flux-svdquant:latest . || { log "ERROR: Failed to build Docker image"; exit 1; }

# If a registry push is requested
if [ "$1" = "--push" ]; then
    log "Pushing Docker image to registry"
    docker push pollinations/flux-svdquant:latest || { log "ERROR: Failed to push Docker image"; exit 1; }
    log "Docker image pushed successfully"
fi
