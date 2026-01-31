#!/bin/bash

# Function for timestamped logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting instance check script..."
log "----------------------------------------"

# Get the list of running g6e.* instances from AWS
log "Querying AWS for running g6e.* instances..."
running_instances=$(aws ec2 describe-instances \
    --filters "Name=instance-type,Values=g6e.*" "Name=instance-state-name,Values=running" \
    --query 'Reservations[*].Instances[*].[PublicIpAddress]' \
    --output text)

if [ -z "$running_instances" ]; then
    log "WARNING: No running g6e.* instances found in AWS!"
else
    log "Found the following AWS instances:"
    echo "$running_instances" | while read -r ip; do
        log "  - $ip"
    done
fi

log "----------------------------------------"
log "Fetching registered servers from EC2 image service..."

# Use direct EC2 endpoint (requires SSH tunnel or internal access)
REGISTER_URL="${REGISTER_URL:-http://ec2-3-80-56-235.compute-1.amazonaws.com:16384/register}"
registered_response=$(curl -s "$REGISTER_URL")
if [ $? -ne 0 ]; then
    log "ERROR: Failed to fetch data from $REGISTER_URL"
    exit 1
fi

registered_ips=$(echo "$registered_response" | jq -r '.[] | select(.type=="flux") | .url' | cut -d/ -f3 | cut -d: -f1 | sort -u)
if [ -z "$registered_ips" ]; then
    log "WARNING: No registered flux IPs found from EC2 image service!"
else
    log "Found the following registered flux IPs:"
    echo "$registered_ips" | while read -r ip; do
        log "  - $ip"
    done
fi

log "----------------------------------------"
log "Comparing AWS instances with registered servers..."

# Convert the lists to arrays
IFS=$'\n' read -r -d '' -a aws_ips <<< "$running_instances"
IFS=$'\n' read -r -d '' -a reg_ips <<< "$registered_ips"

log "Total AWS instances: ${#aws_ips[@]}"
log "Total registered IPs: ${#reg_ips[@]}"

# Find IPs that are in AWS but not in the registered list
unregistered_count=0
for aws_ip in "${aws_ips[@]}"; do
    [ -z "$aws_ip" ] && continue  # Skip empty lines
    
    log "Checking AWS IP: $aws_ip"
    found=0
    for reg_ip in "${reg_ips[@]}"; do
        [ -z "$reg_ip" ] && continue  # Skip empty lines
        
        if [ "$aws_ip" = "$reg_ip" ]; then
            log "  IP $aws_ip is already registered"
            found=1
            break
        fi
    done
    
    if [ $found -eq 0 ]; then
        log "  ! Found unregistered instance: $aws_ip"
        log "  → Running initialization script for $aws_ip..."
        output=$(./ssh_and_initialize.sh "$aws_ip" 2>&1)
        exit_code=$?
        echo "$output"
        
        # Check if services were successfully installed, even if SSH connection was closed
        if echo "$output" | grep -q "Services installed successfully"; then
            log "  Successfully initialized $aws_ip (reboot in progress)"
        else
            log "  Failed to initialize $aws_ip"
        fi
        ((unregistered_count++))
    fi
done

log "----------------------------------------"
log "Script completed!"
log "Found $unregistered_count unregistered instance(s)"
log "----------------------------------------"
