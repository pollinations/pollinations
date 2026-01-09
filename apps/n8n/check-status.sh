#!/bin/bash

# Check the status of the n8n Cloudflare tunnel service
echo "Checking status of cloudflared-n8n service..."
sudo systemctl status cloudflared-n8n.service

# Show recent logs
echo -e "\nRecent logs:"
sudo journalctl -u cloudflared-n8n.service --no-pager -n 20

# Check if the n8n service is accessible
echo -e "\nChecking if n8n is running on port 5678..."
curl -s http://localhost:5678 -o /dev/null -w "HTTP Status: %{http_code}\n" || echo "Failed to connect to n8n service"
