# SANA Sprint Servers

| Host | SSH Alias | IP | GPUs | Ports | Provider |
|------|-----------|-----|------|-------|----------|
| sana-1 | `sana-1` | 51.158.101.128 | 2x L4 (24GB) | 10002, 10003 | Scaleway PAR1 |
| sana-2 | `sana-2` | 51.159.129.211 | 2x L4 (24GB) | 10002, 10003 | Scaleway PAR2 |
| comfystream | `comfystream` | 3.239.212.66 | 1x L40S (46GB) | 10002 | AWS |

## Deployment

```bash
# Deploy to a server with 2 GPUs
./deploy.sh sana-1 2

# Deploy to a server with 1 GPU
./deploy.sh comfystream 1
```

## Service Management

```bash
# Check status
ssh sana-1 "systemctl status sana-gpu0 sana-gpu1"

# View logs
ssh sana-1 "journalctl -u sana-gpu0 -f"

# Restart
ssh sana-1 "systemctl restart sana-gpu0 sana-gpu1"
```
