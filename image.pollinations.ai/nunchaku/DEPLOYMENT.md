# IO.NET Flux Worker Deployment

## Current Workers (Nov 2025)

| Worker | SSH | Public IP | GPU 0 Port | GPU 1 Port |
|--------|-----|-----------|------------|------------|
| io4090-11 | `ssh io4090-11` | 52.205.25.210 | 31695 | 31695 |
| io4090-12 | `ssh io4090-12` | 52.205.25.210 | 24161 | 21813 |
| io4090-13 | `ssh io4090-13` | 52.205.25.210 | 20060 | 30396 |
| io4090-14 | `ssh io4090-14` | 54.185.175.109 | 26686 | 24048 |

**Total: 4 workers × 2 RTX 4090 GPUs = 8 GPUs**

## Deploy New Worker

```bash
# On the worker machine
HF_TOKEN=your_token \
WORKER_NUM=11 \
PUBLIC_IP=52.205.25.210 \
GPU0_PUBLIC_PORT=31695 \
GPU1_PUBLIC_PORT=31695 \
bash ~/pollinations/image.pollinations.ai/nunchaku/deploy-ionet-worker.sh
```

Takes ~15-20 minutes (installs fresh venv + dependencies + nunchaku from source).

## Check Status

```bash
# Health check all workers
bash ~/pollinations/image.pollinations.ai/nunchaku/check-flux-workers.sh

# On specific worker
ssh io4090-11
sudo systemctl status ionet-flux-worker11-gpu0 ionet-flux-worker11-gpu1
sudo journalctl -u ionet-flux-worker11-gpu0 -f
```

## Test Endpoint

```bash
curl -X POST http://52.205.25.210:31695/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "a cute cat", "num_inference_steps": 4}' \
  --output test.png && open test.png
```

## Services

Each worker runs 2 systemd services:
- `ionet-flux-worker{N}-gpu0.service` - GPU 0 on port 10000
- `ionet-flux-worker{N}-gpu1.service` - GPU 1 on port 10001

Auto-restart enabled, logs to journald.
