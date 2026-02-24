#!/bin/bash

# Default values
HEARTBEAT_INTERVAL=30
# Use direct EC2 endpoint to bypass Cloudflare (some io.net IPs are blocked)
POLLINATIONS_URL="${REGISTER_URL:-http://ec2-3-80-56-235.compute-1.amazonaws.com:16384/register}"

# Function to get public IP
get_public_ip() {
    curl -s https://api.ipify.org
}

# Function to send heartbeat
send_heartbeat() {
    public_ip=$(get_public_ip)
    if [ -n "$public_ip" ]; then
        url="http://${public_ip}:${PORT}"
        response=$(curl -s -X POST "$POLLINATIONS_URL" \
            -H "Content-Type: application/json" \
            -d "{\"url\": \"$url\", \"type\": \"$TYPE\"}")
        if [ $? -eq 0 ]; then
            echo "[$(date)] Heartbeat sent successfully. URL: $url Type: $TYPE"
        else
            echo "[$(date)] Failed to send heartbeat" >&2
        fi
    else
        echo "[$(date)] Failed to get public IP" >&2
    fi
}

# Function to run heartbeat in background
run_heartbeat() {
    while kill -0 $1 2>/dev/null; do
        send_heartbeat
        sleep $HEARTBEAT_INTERVAL
    done
}

# Parse arguments
if [ $# -lt 3 ]; then
    echo "Usage: $0 <type> <port> <command>" >&2
    exit 1
fi

TYPE="$1"
PORT="$2"
shift 2

# Execute the command and start heartbeat
"$@" &
command_pid=$!

# Start heartbeat process
run_heartbeat $command_pid &
heartbeat_pid=$!

# Wait for command to finish
wait $command_pid
command_status=$?

# Kill heartbeat process
kill $heartbeat_pid 2>/dev/null

exit $command_status