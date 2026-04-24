---
name: monitor-services
description: "Health check and auto-restart all Pollinations GPU services (Flux/Z-Image on RunPod, LTX-2 on GH200, Klein on RunPod, legacy image on OVH, Sana on Oracle Cloud). Use with /loop for recurring checks."
---

# Monitor Services

Check health of all Pollinations GPU backend services and auto-restart if unhealthy.

## Quick Start

```
/loop 30m /monitor-services
```

Or run once: `/monitor-services`

---

## Services

### 1. LTX-2.3 Video (GH200 - Lambda Labs)

| Property | Value |
|----------|-------|
| **Host** | `192.222.51.105` |
| **Port** | `8765` |
| **Provider** | Lambda Labs (NVIDIA GH200) |
| **SSH** | `ssh -i <SSH_LAMBDA_SANA_LTX2_ACESTEP from SOPS> ubuntu@192.222.51.105` |

**Health check:**
```bash
curl -s --connect-timeout 5 --max-time 10 http://192.222.51.105:8765/health
```
Expected: `{"status":"healthy","model":"ltx-2-comfyui"}`

**E2E test (through prod):**
```bash
curl -s -o /dev/null -w "HTTP %{http_code}, Size: %{size_download}, Time: %{time_total}s" \
  --max-time 120 \
  "https://gen.pollinations.ai/video/health_check_$(date +%s)?model=ltx-2&duration=3&nologo=true" \
  -H "Authorization: Bearer $TEST_TOKEN"
```
Expected: HTTP 200, ~500-800KB, ~11-13s

**Restart:**
```bash
ssh -i <SOPS:SSH_LAMBDA_SANA_LTX2_ACESTEP> ubuntu@192.222.51.105 "bash /home/ubuntu/start_ltx2.sh"
```
Wait ~60s after restart, then re-check health.

---

### 2. ACE-Step Music (GH200 - same host as LTX-2)

| Property | Value |
|----------|-------|
| **Host** | `192.222.51.105` |
| **Port** | `8189` |
| **SSH** | `ssh -i <SSH_LAMBDA_SANA_LTX2_ACESTEP from SOPS> ubuntu@192.222.51.105` |
| **Systemd** | `acestep.service` |
| **Auth** | `ACESTEP_API_KEY` env var (Bearer token) |

**Health check:**
```bash
curl -s --connect-timeout 5 --max-time 10 http://192.222.51.105:8189/health
```
Expected: `{"status":"ok","models_initialized":true}`

**Restart:**
```bash
ssh -i <SOPS:SSH_LAMBDA_SANA_LTX2_ACESTEP> ubuntu@192.222.51.105 "sudo systemctl restart acestep"
```
Wait ~50s for model initialization, then re-check health.

**Notes:**
- Token auth via `Authorization: Bearer <token>` — token stored in encrypted secrets as `PLN_GPU_TOKEN`
- Server-side token set via `ACESTEP_API_KEY` env var in systemd unit
- Runs on port 8189 (port 8188 is ComfyUI/LTX-2)

---

### 3. Legacy Image Service (OVH)

| Property | Value |
|----------|-------|
| **Host** | `57.130.31.42` |
| **Port** | `16384` |
| **SSH** | `ssh -i ~/.ssh/id_rsa_ovh ubuntu@57.130.31.42` |
| **Branch** | `master` (separate from main) |

**Health check:**
```bash
ssh -i ~/.ssh/id_rsa_ovh -o ConnectTimeout=5 ubuntu@57.130.31.42 "systemctl is-active image-pollinations"
```
Expected: `active`

**Restart:**
```bash
ssh -i ~/.ssh/id_rsa_ovh ubuntu@57.130.31.42 "sudo systemctl restart image-pollinations"
```

---

### 4. Klein 4B (RunPod Pod)

| Property | Value |
|----------|-------|
| **Host** | `pi90tfk3sa9t12-8000.proxy.runpod.net` |
| **Port** | `8000` |
| **Provider** | RunPod (RTX 3090, community cloud) |
| **SSH** | `ssh -i <SOPS:SSH_RUNPOD_KLEIN> root@213.144.200.243 -p 10207` |
| **Auth** | `x-backend-token` header with `PLN_GPU_TOKEN` |

**Health check:**
```bash
curl -s --connect-timeout 5 --max-time 10 https://pi90tfk3sa9t12-8000.proxy.runpod.net/health
```
Expected: `{"status":"ok","model":"black-forest-labs/FLUX.2-klein-4B"}`

**Restart:**
```bash
ssh -i <SOPS:SSH_RUNPOD_KLEIN> root@213.144.200.243 -p 10207 "/workspace/restart.sh"
```
Wait ~30s for model load, then re-check health.

---

### 5. Flux + Z-Image Workers (RunPod 4x RTX 4090)

| Property | Value |
|----------|-------|
| **Pod** | `hsl3ksl31lvrcc` |
| **Provider** | RunPod (4x RTX 4090, community cloud) |
| **SSH** | `ssh -i <SOPS:SSH_RUNPOD_FLUX_ZIMAGE> -p 19489 root@38.65.239.17` |

**Workers:**

| GPU | Port | Proxy URL | Service |
|-----|------|-----------|---------|
| 0 | 8765 | `https://hsl3ksl31lvrcc-8765.proxy.runpod.net` | Flux (INT4) |
| 1 | 8766 | `https://hsl3ksl31lvrcc-8766.proxy.runpod.net` | Flux (INT4) |
| 2 | 8767 | `https://hsl3ksl31lvrcc-8767.proxy.runpod.net` | Z-Image |
| 3 | 8768 | `https://hsl3ksl31lvrcc-8768.proxy.runpod.net` | Z-Image |

**Health check (per worker):**
```bash
curl -s --connect-timeout 5 --max-time 15 https://hsl3ksl31lvrcc-8765.proxy.runpod.net/generate \
  -X POST -H "Content-Type: application/json" \
  -d '{"prompt":"test","width":512,"height":512}' -o /dev/null -w "HTTP %{http_code}"
```
Expected: HTTP 200

**Registry check (all image workers at once):**
```bash
curl -s --connect-timeout 5 --max-time 10 http://ec2-54-147-14-220.compute-1.amazonaws.com:16384/register
```
Expected: 4 workers with 0% error rate, all `hsl3ksl31lvrcc-*.proxy.runpod.net`

**Restart a worker:**
```bash
ssh -i <SOPS:SSH_RUNPOD_FLUX_ZIMAGE> -p 19489 root@38.65.239.17
screen -S flux-gpu0 -X quit
screen -dmS flux-gpu0 bash -c 'source /opt/pollinations/image.pollinations.ai/nunchaku/venv/bin/activate && \
  CUDA_VISIBLE_DEVICES=0 PORT=8765 PUBLIC_IP=hsl3ksl31lvrcc-8765.proxy.runpod.net PUBLIC_PORT=443 \
  SERVICE_TYPE=flux python /opt/pollinations/image.pollinations.ai/nunchaku/server.py 2>&1 | tee /tmp/flux-gpu0.log'
```

---

### 6. Sana Sprint 1.6B Worker (GH200 - same host as LTX-2)

One worker registered as `sana` type with OVH legacy service via heartbeat.

| Instance | GPU | Host | Port | SSH |
|----------|-----|------|------|-----|
| Lambda GH200 | GH200 (96GB) | `192.222.51.105` | `8766` | `ssh -i <SOPS:SSH_LAMBDA_SANA_LTX2_ACESTEP> ubuntu@192.222.51.105` |

**Health check:**
```bash
curl -s --connect-timeout 5 --max-time 10 http://192.222.51.105:8766/health
```
Expected: `{"status":"healthy","model":"Efficient-Large-Model/Sana_Sprint_1.6B_1024px_diffusers"}`

**Sana registry check (OVH side):**
```bash
ssh -i ~/.ssh/id_rsa_ovh -o ConnectTimeout=5 ubuntu@57.130.31.42 "curl -s http://localhost:16384/register"
```
Expected: 1 worker with 0% error rate

**Restart:**
```bash
ssh -i <SOPS:SSH_LAMBDA_SANA_LTX2_ACESTEP> ubuntu@192.222.51.105 "sudo systemctl restart sana"
```

**Notes:**
- GH200 generates at ~0.165s/img
- Runs alongside LTX-2 (port 8765) and ACE-Step (port 8189) on the same host
- Oracle A10/A100 instances decommissioned on 2026-04-12
- Server code: `image.pollinations.ai/sana/server.py` (MAX_DIM=768, MAX_PIXELS=512*512)
- Systemd service: `sana.service`

---

### 7. OVH Disk Space

**Check:**
```bash
ssh -i ~/.ssh/id_rsa_ovh -o ConnectTimeout=5 ubuntu@57.130.31.42 "df -h / | tail -1"
```
Alert if usage > 85%.

**Fix (if full):**
```bash
ssh -i ~/.ssh/id_rsa_ovh ubuntu@57.130.31.42 "sudo truncate -s 0 /var/log/syslog && sudo journalctl --vacuum-size=100M"
```

---

### 8. Error Event Pipe (Tinybird)

Rolling 3-hour window of structured 5xx errors from enter.pollinations.ai. Complements black-box health probes by showing *which model + upstream* is actually failing under real traffic — catches cases where a health endpoint returns OK but real requests terminate.

| Property | Value |
|----------|-------|
| **Pipe** | `recent_server_errors` |
| **Endpoint** | `https://api.europe-west2.gcp.tinybird.co/v0/pipes/recent_server_errors.json` |
| **Parameters** | `minutes` (default 180), `environment` (default `production`), `limit` (default 200) |
| **Auth** | `TINYBIRD_READ_TOKEN` from SOPS |
| **TTL** | 3h (rolling window, auto-expires) |

**Query — errors grouped by upstream + model (last 30 min):**
```bash
TB_READ=$(sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r '.TINYBIRD_READ_TOKEN')
curl -s --max-time 10 "https://api.europe-west2.gcp.tinybird.co/v0/pipes/recent_server_errors.json?minutes=30&environment=production&limit=500&token=$TB_READ" \
  | jq -r '.data
      | group_by(.upstream_host + "|" + (.model_requested // "none"))
      | map({key: ((.[0].upstream_host // "none") + " / " + (.[0].model_requested // "none")),
             count: length,
             statuses: [.[].status] | unique})
      | sort_by(-.count) | .[]
      | "\(.count)\t\(.key)\t\(.statuses | join(","))"'
```

Expected output (example — see "Procedure" for what to do with it):
```
23  ec2-54-147-14-220.compute-1.amazonaws.com / klein         500,502,520,524
8   ec2-54-147-14-220.compute-1.amazonaws.com / gemini-fast   502,520,522
```

**Alert thresholds:**
- `count > 5` in 30 min for a single (upstream, model) → jump to that service's health check + restart first
- Dominant status `520/522/524` → Cloudflare-fronted upstream timing out, likely a single pod stuck
- Dominant status `500` with body containing `terminated` / `Internal Server Error` → application-level failure on the upstream, check upstream logs
- Multiple unrelated models failing on the same `upstream_host` → host-level problem (saturation, disk, OOM) — check load/memory on that host

**Full-row detail for a specific failure:**
```bash
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/pipes/recent_server_errors.json?minutes=30&environment=production&limit=10&token=$TB_READ" \
  | jq '.data[] | select(.model_requested == "klein") | {ts: .timestamp, status, upstream_status, body: (.upstream_body | .[0:200]), tier: .user_tier}'
```

---

## Procedure

When invoked, run checks in this order:

1. **Error pipe sweep** - query `recent_server_errors` (last 30 min, grouped by upstream+model). If any (upstream, model) has >5 errors, note it and prioritize that service's deeper check below
2. **EC2 image registry** - curl register endpoint, check worker count and error rates
3. **Flux/Z-Image RunPod** - verify 4 workers registered with 0% error rate
4. **LTX-2 health** - curl health endpoint
5. **LTX-2 e2e** - if healthy, test through gen.pollinations.ai (use test token from `.testingtokens`)
6. **ACE-Step health** - curl health endpoint on port 8189
7. **Klein health** - curl RunPod proxy health endpoint
8. **Legacy image service** - check systemctl status on OVH
9. **Sana worker** - curl health on GH200 port 8766
10. **Sana registry** - check OVH legacy registry for 1 worker with 0% errors
11. **Disk space** - check OVH disk usage

For each:
- If healthy: report OK with latency
- If unhealthy: attempt restart, wait, re-check, report result

## Auth

- **Test token**: Read from `enter.pollinations.ai/.testingtokens` (ENTER_API_TOKEN_REMOTE)
- **Tinybird read token**: `TINYBIRD_READ_TOKEN` in SOPS (`enter.pollinations.ai/secrets/prod.vars.json`) — for querying `recent_server_errors` pipe
- **SSH keys**: Stored in SOPS (`enter.pollinations.ai/secrets/prod.vars.json`):
  - `SSH_RUNPOD_FLUX_ZIMAGE` — RunPod Flux+Z-Image pod
  - `SSH_RUNPOD_KLEIN` — RunPod Klein pod
  - `SSH_LAMBDA_SANA_LTX2_ACESTEP` — Lambda GH200 (LTX-2, ACE-Step, Sana)
  - Extract: `sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r '.KEY_NAME' > /tmp/key && chmod 600 /tmp/key`
- **OVH**: `~/.ssh/id_rsa_ovh` (not in SOPS)

## Output

Report a brief status table:

```
| Service | Status | Latency | Notes |
|---------|--------|---------|-------|
| Error pipe (30m) | OK | 0.3s | top: klein=0, gemini-fast=0 |
| EC2 registry | OK | 0.1s | 4 workers, 0% errors |
| Flux RunPod (gpu0) | OK | 2.9s | hsl3ksl31lvrcc-8765 |
| Flux RunPod (gpu1) | OK | 2.9s | hsl3ksl31lvrcc-8766 |
| Z-Image RunPod (gpu2) | OK | 1.5s | hsl3ksl31lvrcc-8767 |
| Z-Image RunPod (gpu3) | OK | 1.5s | hsl3ksl31lvrcc-8768 |
| LTX-2 health | OK | 0.2s | |
| LTX-2 e2e | OK | 11.3s | 682KB |
| ACE-Step | OK | 0.1s | |
| Klein 4B | OK | 0.3s | RunPod |
| Legacy image | OK | - | active |
| Sana (GH200) | OK | 0.2s | 1.6B, ~0.165s/img |
| Sana registry | OK | - | 1 worker, 0% errors |
| OVH disk | OK | - | 45% used |
```
