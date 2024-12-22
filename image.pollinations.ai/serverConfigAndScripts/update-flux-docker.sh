#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

if [ -z "$1" ]; then
  echo "Usage: $0 <ip_address_or_host_name>"
  exit 1
fi

HOST=$1

# Build and push Docker image
log "Building Docker image locally"
cd ../nunchaku
docker build -t voodoohop/flux-svdquant:latest . || { log "ERROR: Failed to build Docker image"; exit 1; }

log "Pushing Docker image to registry"
docker push voodoohop/flux-svdquant:latest || { log "ERROR: Failed to push Docker image"; exit 1; }

log "Updating remote server $HOST"
# SSH into the remote server and update services
ssh -o StrictHostKeyChecking=no -i $HOME/.ssh/thomashkey ubuntu@$HOST << EOF
  cd /home/ubuntu/pollinations
  git fetch origin
  git pull
  git checkout master
  
  # Stop the existing service
  sudo systemctl stop pollinations-flux-docker.service
  
  # Remove existing container
  docker rm -f flux-svdquant || true
  
  # Pull the new image
  docker pull voodoohop/flux-svdquant:latest
  
  # Start the service
  sudo systemctl start pollinations-flux-docker.service
  
  # Show the service status
  sudo systemctl status pollinations-flux-docker.service
EOF

log "Update complete. New Docker image deployed to $HOST"
