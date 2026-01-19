#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

if [ -z "$1" ]; then
    echo "Usage: $0 <host>"
    exit 1
fi

HOST=$1
log "Updating remote server $HOST"

# SSH into the remote server and update services
ssh -o StrictHostKeyChecking=no -i $HOME/.ssh/thomashkey ubuntu@$HOST << 'EOF'
    # Define logging function for remote session
    log() {
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    }

    cd /home/ubuntu/pollinations
    git fetch origin
    git checkout master
    git pull origin master
    
    # Stop and disable old services if they exist
    log "Cleaning up old services..."
    for old_service in pollinations-comfyui pollinations-pyserver; do
        if systemctl is-enabled $old_service.service &>/dev/null; then
            log "Stopping and disabling $old_service.service"
            sudo systemctl stop $old_service.service
            sudo systemctl disable $old_service.service
            sudo rm -f /etc/systemd/system/$old_service.service
        fi
    done
    
    # Install systemd service file
    log "Installing new service..."
    sudo cp image.pollinations.ai/serverConfigAndScripts/pollinations-flux-docker.service /etc/systemd/system/
    sudo systemctl daemon-reload
    
    # Stop the existing service if running
    sudo systemctl stop pollinations-flux-docker.service || true
    
    # Remove existing container
    docker rm -f flux-svdquant || true
    
    # Pull the new image
    docker pull pollinations/flux-svdquant:latest
    
    # Start the service
    sudo systemctl start pollinations-flux-docker.service
    sudo systemctl enable pollinations-flux-docker.service
    
    # Show the service status
    sudo systemctl status pollinations-flux-docker.service
EOF

log "Update complete. New Docker image deployed to $HOST"

# Wait for container to start with retries
log "Waiting for container to start..."
max_attempts=12  # 2 minutes total (12 * 10 seconds)
attempt=1
container_running=false

while [ $attempt -le $max_attempts ]; do
    log "Checking container status (attempt $attempt of $max_attempts)..."
    if ssh -o StrictHostKeyChecking=no -i $HOME/.ssh/thomashkey ubuntu@$HOST "docker ps | grep -q flux-svdquant"; then
        container_running=true
        break
    fi
    log "Container not ready yet, waiting 10 seconds..."
    sleep 10
    attempt=$((attempt + 1))
done

if [ "$container_running" = true ]; then
    log "Container is running successfully!"
else
    log "ERROR: Container failed to start within the timeout period"
    exit 1
fi
