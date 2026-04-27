# SANA Sprint Servers

Last updated: 2026-03-08

## Current Deployment

Sana Sprint 0.6B runs on the Taiwan vast.ai instance (GPU 0), serving the legacy `image.pollinations.ai` endpoint.

| Host | Instance | IP | GPU | Port (int/ext) | Model |
|------|----------|-----|-----|----------------|-------|
| vast.ai Taiwan | 30937024 | 211.72.13.202 | GPU 0 (RTX 5090) | 8765 / 47190 | Sana Sprint 0.6B |

- Max resolution: 512x512 (clamped)
- Inference steps: 2
- Generation time: ~0.2-0.5s

Traffic reaches Sana via SSH tunnel from Scaleway (legacy gateway):
```
image.pollinations.ai → Cloudflare → Scaleway:16384 (legacy service)
  → SSH tunnel (localhost:19876 → vast.ai:8765) → Sana 0.6B
```

## SSH Access

```bash
ssh -o StrictHostKeyChecking=no -i ~/.ssh/pollinations_services_2026 -p 17024 root@ssh3.vast.ai
screen -r sana-gpu0
tail -f /tmp/sana.log
```

## Legacy Scaleway Sana Instances (Decommissioned)

These Scaleway GPU instances previously ran Sana Sprint 1.6B but are no longer in use for Sana.

| Host | SSH Alias | IP | GPUs | Provider |
|------|-----------|-----|------|----------|
| sana-1 | `sana-1` | 51.158.101.128 | 2x L4 (24GB) | Scaleway PAR1 |
| sana-2 | `sana-2` | 51.159.129.211 | 2x L4 (24GB) | Scaleway PAR2 |
| comfystream | `comfystream` | 3.239.212.66 | 1x L40S (46GB) | AWS |
