#!/bin/bash
# Deploy Z-Image to all IO.net instances from local machine
# Usage: ./deploy-all-ionet.sh [VM_NUMBER]
# If VM_NUMBER is provided, only deploy to that VM (1-5)

set -e

SSH_KEY="${SSH_KEY:-$HOME/.ssh/thomashkey}"
PUBLIC_IP="52.205.25.210"
BRANCH="${BRANCH:-main}"

# IO.net cluster configuration
# Format: SSH_PORT:GPU0_PORT:GPU1_PORT
declare -A VMS=(
    [1]="23528:24602:25962"
    [2]="31194:20020:24922"
    [3]="22891:22022:25748"
    [4]="26345:30886:30996"
    [5]="25656:22182:31535"
)

log() { echo "[$(date '+%H:%M:%S')] $1"; }

deploy_vm() {
    local vm_num=$1
    local config=${VMS[$vm_num]}
    local ssh_port=$(echo $config | cut -d: -f1)
    local gpu0_port=$(echo $config | cut -d: -f2)
    local gpu1_port=$(echo $config | cut -d: -f3)
    
    log "=== Deploying to VM$vm_num (SSH:$ssh_port, GPU0:$gpu0_port, GPU1:$gpu1_port) ==="
    
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i "$SSH_KEY" -p "$ssh_port" ionet@$PUBLIC_IP \
        "export GPU0_PUBLIC_PORT=$gpu0_port GPU1_PUBLIC_PORT=$gpu1_port BRANCH=$BRANCH && \
         curl -sL https://raw.githubusercontent.com/pollinations/pollinations/$BRANCH/image.pollinations.ai/z-image/setup-ionet.sh | bash"
    
    log "VM$vm_num deployment complete!"
}

verify_vm() {
    local vm_num=$1
    local config=${VMS[$vm_num]}
    local gpu0_port=$(echo $config | cut -d: -f2)
    local gpu1_port=$(echo $config | cut -d: -f3)
    
    echo -n "  VM$vm_num GPU0 (:$gpu0_port): "
    curl -s -m 5 http://$PUBLIC_IP:$gpu0_port/health | grep -q healthy && echo "✓ healthy" || echo "✗ not ready"
    echo -n "  VM$vm_num GPU1 (:$gpu1_port): "
    curl -s -m 5 http://$PUBLIC_IP:$gpu1_port/health | grep -q healthy && echo "✓ healthy" || echo "✗ not ready"
}

# Main
if [ -n "$1" ]; then
    # Deploy to specific VM
    if [ -z "${VMS[$1]}" ]; then
        echo "ERROR: Invalid VM number. Use 1-5."
        exit 1
    fi
    deploy_vm $1
    echo ""
    log "Verifying deployment..."
    verify_vm $1
else
    # Deploy to all VMs
    log "Deploying Z-Image to all 5 IO.net VMs..."
    echo ""
    
    for vm_num in 1 2 3 4 5; do
        deploy_vm $vm_num
        echo ""
    done
    
    log "=== All deployments complete! ==="
    echo ""
    log "Verifying all endpoints..."
    for vm_num in 1 2 3 4 5; do
        verify_vm $vm_num
    done
fi

echo ""
log "Done!"
