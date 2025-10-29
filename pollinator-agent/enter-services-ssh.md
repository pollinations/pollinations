# Enter Services SSH Access

Quick reference for managing text and image services on AWS EC2.

## Prerequisites

SSH config entry in `~/.ssh/config`:
```
Host enter-services
  HostName 3.80.56.235
  User ubuntu
  IdentityFile ~/.ssh/enter-services-shared-key
```

## Service Status

```bash
# Check both services
ssh enter-services "sudo systemctl status text-pollinations.service image-pollinations.service"

# Check single service
ssh enter-services "sudo systemctl status text-pollinations.service"
ssh enter-services "sudo systemctl status image-pollinations.service"
```

## View Logs

```bash
# Real-time logs (follow mode)
ssh enter-services "sudo journalctl -u text-pollinations.service -f"
ssh enter-services "sudo journalctl -u image-pollinations.service -f"

# Last 50 lines
ssh enter-services "sudo journalctl -u text-pollinations.service -n 50 --no-pager"
ssh enter-services "sudo journalctl -u image-pollinations.service -n 50 --no-pager"

# Logs since specific time
ssh enter-services "sudo journalctl -u text-pollinations.service --since '1 hour ago'"
ssh enter-services "sudo journalctl -u text-pollinations.service --since '2025-10-29 10:00:00'"

# Both services together
ssh enter-services "sudo journalctl -u text-pollinations.service -u image-pollinations.service -f"
```

## Service Control

```bash
# Restart services
ssh enter-services "sudo systemctl restart text-pollinations.service image-pollinations.service"

# Stop services
ssh enter-services "sudo systemctl stop text-pollinations.service image-pollinations.service"

# Start services
ssh enter-services "sudo systemctl start text-pollinations.service image-pollinations.service"

# Reload service configuration (without restart)
ssh enter-services "sudo systemctl reload-or-restart text-pollinations.service"
```

## Check Resources

```bash
# CPU and memory usage
ssh enter-services "top -bn1 | head -20"

# Disk space
ssh enter-services "df -h"

# Service memory usage
ssh enter-services "sudo systemctl status text-pollinations.service | grep Memory"
```

## Process Management

```bash
# Find service processes
ssh enter-services "ps aux | grep pollinations"

# Network connections
ssh enter-services "sudo netstat -tlnp | grep node"
```

## Quick Debugging

```bash
# Check if services are listening on ports
ssh enter-services "sudo lsof -i :3000"  # text service
ssh enter-services "sudo lsof -i :8080"  # image service (adjust port as needed)

# Recent errors only
ssh enter-services "sudo journalctl -u text-pollinations.service -p err -n 20"

# Full logs with timestamps
ssh enter-services "sudo journalctl -u text-pollinations.service --no-pager | tail -100"
```

## Service Files Location

- Service definitions: `/etc/systemd/system/`
- Text service: `/home/ubuntu/pollinations/text.pollinations.ai/`
- Image service: `/home/ubuntu/pollinations/image.pollinations.ai/`

## Useful Combinations

```bash
# Restart and watch logs
ssh enter-services "sudo systemctl restart text-pollinations.service && sudo journalctl -u text-pollinations.service -f"

# Check status after restart
ssh enter-services "sudo systemctl restart text-pollinations.service && sleep 3 && sudo systemctl status text-pollinations.service"
```
