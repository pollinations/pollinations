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

## Principal Commands

```bash
# Service status
ssh enter-services "sudo systemctl status text-pollinations.service image-pollinations.service"

# View logs (real-time)
ssh enter-services "sudo journalctl -u text-pollinations.service -f"
ssh enter-services "sudo journalctl -u image-pollinations.service -f"

# Restart services
ssh enter-services "sudo systemctl restart text-pollinations.service image-pollinations.service"

# Check resources
ssh enter-services "top -bn1 | head -20"
ssh enter-services "df -h"

# Recent errors
ssh enter-services "sudo journalctl -u text-pollinations.service -p err -n 20"
```

## Service Locations

- Service definitions: `/etc/systemd/system/`
- Text service: `/home/ubuntu/pollinations/text.pollinations.ai/`
- Image service: `/home/ubuntu/pollinations/image.pollinations.ai/`
