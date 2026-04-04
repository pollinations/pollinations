---
name: monitor-services
description: "Health check and auto-restart all Pollinations GPU services (LTX-2 on GH200, Klein on RunPod, legacy image on OVH, Sana on Vast.ai). Use with /loop for recurring checks."
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
| **SSH** | `ssh -i ~/.ssh/thomashkey ubuntu@192.222.51.105` |

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
ssh -i ~/.ssh/thomashkey ubuntu@192.222.51.105 "bash /home/ubuntu/start_ltx2.sh"
```
Wait ~60s after restart, then re-check health.

---

### 2. ACE-Step Music (GH200 - same host as LTX-2)

| Property | Value |
|----------|-------|
| **Host** | `192.222.51.105` |
| **Port** | `8189` |
| **SSH** | `ssh -i ~/.ssh/thomashkey ubuntu@192.222.51.105` |
| **Systemd** | `acestep.service` |
| **Auth** | `ACESTEP_API_KEY` env var (Bearer token) |

**Health check:**
```bash
curl -s --connect-timeout 5 --max-time 10 http://192.222.51.105:8189/health
```
Expected: `{"status":"ok","models_initialized":true}`

**Restart:**
```bash
ssh -i ~/.ssh/thomashkey ubuntu@192.222.51.105 "sudo systemctl restart acestep"
```
Wait ~50s for model initialization, then re-check health.

**Notes:**
- Token auth via `Authorization: Bearer <token>` — token stored in encrypted secrets as `MUSIC_SERVICE_TOKEN`
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
| **SSH** | `ssh -i ~/.runpod/ssh/RunPod-Key-Go root@213.144.200.243 -p 10207` |
| **Auth** | `x-backend-token` header with `PLN_IMAGE_BACKEND_TOKEN` |

**Health check:**
```bash
curl -s --connect-timeout 5 --max-time 10 https://pi90tfk3sa9t12-8000.proxy.runpod.net/health
```
Expected: `{"status":"ok","model":"black-forest-labs/FLUX.2-klein-4B"}`

**Restart:**
```bash
ssh -i ~/.runpod/ssh/RunPod-Key-Go root@213.144.200.243 -p 10207 "/workspace/restart.sh"
```
Wait ~30s for model load, then re-check health.

---

### 5. Sana Image Model (Vast.ai via OVH tunnel)

| Property | Value |
|----------|-------|
| **Direct** | `211.72.13.202:47190` |
| **Via OVH tunnel** | `localhost:19876` (on OVH) |

**Health check (direct):**
```bash
curl -s --connect-timeout 5 --max-time 30 -X POST http://211.72.13.202:47190/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test","width":512,"height":512}' \
  -o /dev/null -w "HTTP %{http_code}"
```
Expected: HTTP 200

**SSH tunnel check (OVH side):**
```bash
ssh -i ~/.ssh/id_rsa_ovh -o ConnectTimeout=5 ubuntu@57.130.31.42 "ss -tlnp | grep 19876"
```
Expected: LISTEN on port 19876

---

### 5. OVH Disk Space

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

## Procedure

When invoked, run checks in this order:

1. **LTX-2 health** - curl health endpoint
2. **LTX-2 e2e** - if healthy, test through gen.pollinations.ai (use test token from `.testingtokens`)
3. **ACE-Step health** - curl health endpoint on port 8189
4. **Klein health** - curl RunPod proxy health endpoint
5. **Legacy image service** - check systemctl status
6. **Sana direct** - curl generate endpoint
7. **SSH tunnel** - check port 19876 on OVH
8. **Disk space** - check OVH disk usage

For each:
- If healthy: report OK with latency
- If unhealthy: attempt restart, wait, re-check, report result

## Auth

- **Test token**: Read from `enter.pollinations.ai/.testingtokens` (ENTER_API_TOKEN_REMOTE)
- **SSH keys**: `~/.ssh/thomashkey` (GH200), `~/.ssh/id_rsa_ovh` (OVH)

## Output

Report a brief status table:

```
| Service | Status | Latency | Notes |
|---------|--------|---------|-------|
| LTX-2 health | OK | 0.2s | |
| LTX-2 e2e | OK | 11.3s | 682KB |
| ACE-Step | OK | 0.1s | |
| Klein 4B | OK | 0.3s | RunPod |
| Legacy image | OK | - | active |
| Sana | OK | 2.1s | |
| SSH tunnel | OK | - | LISTEN |
| OVH disk | OK | - | 45% used |
```
