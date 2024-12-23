#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Build Docker image locally
log "Building Docker image locally"
cd ../nunchaku
docker build -t voodoohop/flux-svdquant:latest . || { log "ERROR: Failed to build Docker image"; exit 1; }

# If a host is provided, push to registry and update remote
if [ -n "$1" ]; then
    HOST=$1
    log "Pushing Docker image to registry"
    docker push voodoohop/flux-svdquant:latest || { log "ERROR: Failed to push Docker image"; exit 1; }

    log "Updating remote server $HOST"
    # SSH into the remote server and update services
    ssh -o StrictHostKeyChecking=no -i $HOME/.ssh/thomashkey ubuntu@$HOST << EOF
        cd /home/ubuntu/pollinations
        git fetch origin
        git checkout -B 923-svgquant-nunchaku-optimization --track origin/923-svgquant-nunchaku-optimization
        git pull
        
        # Install systemd service file
        sudo cp image.pollinations.ai/serverConfigAndScripts/pollinations-flux-docker.service /etc/systemd/system/
        sudo systemctl daemon-reload
        
        # Stop the existing service
        sudo systemctl stop pollinations-flux-docker.service
        
        # Remove existing container
        docker rm -f flux-svdquant || true
        
        # Pull the new image
        docker pull voodoohop/flux-svdquant:latest
        
        # Start the service
        sudo systemctl start pollinations-flux-docker.service
        sudo systemctl enable pollinations-flux-docker.service
        
        # Show the service status
        sudo systemctl status pollinations-flux-docker.service
EOF
    log "Update complete. New Docker image deployed to $HOST"
else
    # Local update
    log "Updating locally"
    
    # Stop the existing service
    sudo systemctl stop pollinations-flux-docker.service || { log "WARNING: Service was not running"; }
    
    # Remove existing container
    docker rm -f flux-svdquant || true
    
    # Start the service
    sudo systemctl start pollinations-flux-docker.service
    
    # Show the service status
    sudo systemctl status pollinations-flux-docker.service
    
    log "Update complete. New Docker image deployed locally"
fi
