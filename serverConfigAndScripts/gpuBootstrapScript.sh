#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting bootstrap script"


# Navigate to the pollinations directory
log "Navigating to pollinations directory"
cd /home/ubuntu/pollinations/ || { log "ERROR: Failed to change directory to pollinations"; exit 1; }

# Update the repository
log "Updating pollinations repository"
if git pull; then
    log "Repository updated successfully"
else
    log "ERROR: Failed to update pollinations repository"
fi

# run serverConfigAndScripts/awsStartupScript.sh
bash serverConfigAndScripts/gpuStartupScript.sh

log "Bootstrap script completed"
