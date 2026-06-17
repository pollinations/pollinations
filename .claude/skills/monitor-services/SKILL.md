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
  "https://gen.pollinations.ai/video/health_check_$(date +%s)?model=ltx-2&duration=3" \
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
| **Pod ID** | `jmrbmje2fyuy46` (current — pod ID changes if recreated) |
| **Host** | `<pod-id>-8000.proxy.runpod.net` |
| **Port** | `8000` |
| **Provider** | RunPod (RTX A5000 secure cloud, $0.27/hr via API) |
| **SSH** | Full SSH with `SSH_RUNPOD_KLEIN` from SOPS; get current public host/port from RunPod runtime ports |
| **Auth** | `x-backend-token` header with `PLN_GPU_TOKEN` |
| **Config** | `KLEIN_URL` in `gen.pollinations.ai/secrets/prod.vars.json` (sops); fallback in `gen.pollinations.ai/src/image/models/fluxKleinModel.ts` |

**Health check:**
```bash
curl -s --connect-timeout 5 --max-time 10 https://jmrbmje2fyuy46-8000.proxy.runpod.net/health
```
Expected: `{"status":"ok","model":"black-forest-labs/FLUX.2-klein-4B"}`

**Restart (in-pod):**
```bash
# Open SSH from dashboard, then:
bash /workspace/restart.sh
```
Wait ~30s for model load, then re-check health.

**Recovery from RunPod host outage:**

Symptom: dashboard banner "*This server has recently suffered a network outage*"; control plane reports RUNNING but HTTPS proxy / SSH / ICMP all unreachable. Restart/reset reschedules onto the same broken host. Recreate on a different host:

1. Create cheap replacement capacity first: prefer secure A5000 at <= $0.30/hr, fallback to community 3090 at <= $0.23/hr. Reject any assigned host with `machine.note` or `maintenanceNote` mentioning an outage. Do not use a 4090 unless the higher cost is explicitly accepted.
2. Use `runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404`, `8000/http,22/tcp`, `20GB` container disk, `100GB` volume, and `/workspace`.
3. Get SSH runtime port from RunPod GraphQL and connect with `SSH_RUNPOD_KLEIN`:
   ```bash
   sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r .SSH_RUNPOD_KLEIN > /tmp/klein-key
   chmod 600 /tmp/klein-key
   ssh -i /tmp/klein-key -p <publicPort> root@<publicIp>
   ```
4. Copy `image.pollinations.ai/klein-runpod/handler.py` and `requirements.txt` to `/workspace`.
5. Install runtime packages without replacing the base CUDA torch:
   ```bash
   python -m venv --system-site-packages /workspace/venv
   /workspace/venv/bin/python -m pip install --upgrade pip
   /workspace/venv/bin/python -m pip install --no-cache-dir -r /workspace/requirements.txt
   ```
6. Put `PLN_GPU_TOKEN` in `/root/.gpu_token` (not `/workspace`, which may ignore Unix mode bits) and create `/workspace/restart.sh`:
   ```bash
   export HF_HUB_CACHE=/workspace/hf-cache
   export HF_XET_HIGH_PERFORMANCE=1
   export PLN_GPU_TOKEN="$(cat /root/.gpu_token)"
   pkill -f "/workspace/handler.py" 2>/dev/null || true
   nohup /workspace/venv/bin/python -u /workspace/handler.py > /workspace/klein.log 2>&1 &
   echo $! > /workspace/klein.pid
   ```
7. Run `bash /workspace/restart.sh`; first startup downloads ~15-24GB of model files and should end with `Model loaded and ready!`.
8. Update `KLEIN_URL` in `gen.pollinations.ai/secrets/prod.vars.json` and the hardcoded fallback in `gen.pollinations.ai/src/image/models/fluxKleinModel.ts`.
9. Push the production Worker secret:
   ```bash
   tmp=$(mktemp)
   sops -d gen.pollinations.ai/secrets/prod.vars.json > "$tmp"
   (cd gen.pollinations.ai && node scripts/push-generation-secrets.mjs "$tmp" production)
   rm -f "$tmp"
   ```
10. Verify direct pod `/health`, direct authenticated `/generate`, and production `gen.pollinations.ai/image/...model=klein`, remove `/tmp/klein-key`, then terminate the old outage pod.

Note: the pod uses a generic `runpod/pytorch` image; `handler.py` and `restart.sh` live on the pod volume only (not baked into a Docker image despite `image.pollinations.ai/klein-runpod/Dockerfile`). The pod volume is destroyed on terminate.

---

### 5. Z-Image Workers (RunPod, multiple single-GPU pods)

> ⚠️ **Pod IDs, hostnames, SSH ports, and the worker count all change over time — DISCOVER them live, never trust hardcoded values here.** As of 2026-06-16, zimage runs as **3 separate single-GPU pods** (one 4090 + two 3090s), each serving on port 8767. The old `hsl3ksl31lvrcc` 4x-4090 pod is gone. Flux runs on its own worker(s) elsewhere — it is healthy and unrelated to zimage.

**Step 1 — discover what's actually deployed (the source of truth):**
```bash
# (a) Who is registered + heartbeating (= actually taking prod traffic):
curl -s --max-time 10 https://gen.pollinations.ai/register | python3 -c "import sys,json,time; [print(f\"{w['type']:<7} {w['url']} hb={(time.time()*1000-w['lastHeartbeat'])/1000:.0f}s\") for w in json.load(sys.stdin)]"

# (b) ALL RunPod pods + their GPU util (catch idle/dead pods NOT in the registry):
RUNPOD_TOKEN=$(cat ~/.runpod/config.toml | grep apikey | cut -d\' -f2)
runpodctl pod list
curl -s -X POST "https://api.runpod.io/graphql?api_key=$RUNPOD_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"{myself{pods{id name desiredStatus machine{gpuDisplayName} runtime{gpus{gpuUtilPercent}}}}}"}' \
  | python3 -c "import sys,json; [print(p['name'], p['id'], p['desiredStatus'], (p.get('runtime') or {}).get('gpus')) for p in json.load(sys.stdin)['data']['myself']['pods']]"
```
**Key failure mode (this caused the 2026-06-16 incident):** a pod can be RUNNING + costing money but **0% util and absent from `/register`** because its `server.py` died or its GPU fell off the bus. All traffic then piles onto the remaining worker(s) → 524 timeouts + 100% util on the survivor. Always cross-check (a) vs (b): every RUNNING zimage pod should appear in the registry.

**SSH key:** the working key is **`SSH_RUNPOD_KLEIN`** (the documented `SSH_RUNPOD_FLUX_ZIMAGE` does NOT auth against these pods). Get the rotating SSH port per pod:
```bash
sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r .SSH_RUNPOD_KLEIN > /tmp/zk; chmod 600 /tmp/zk
curl -s -X POST "https://api.runpod.io/graphql?api_key=$RUNPOD_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"{pod(input:{podId:\"<POD_ID>\"}){runtime{ports{ip publicPort type}}}}"}' \
  | python3 -c "import sys,json; [print(p) for p in json.load(sys.stdin)['data']['pod']['runtime']['ports'] if p['type']=='tcp']"
```

**Diagnose a single pod (SSH in on the discovered tcp port):**
```bash
ssh -i /tmp/zk -p <PORT> -o StrictHostKeyChecking=no root@<IP> \
  "nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader; ps aux | grep 'z-image/server.py' | grep -v grep; ss -ltn | grep 8767"
```
Code lives at `/root/pollinations/image.pollinations.ai/z-image/`; service auto-sources env from PID 1 (port 8767, `ZIMAGE_MODEL_ID`, `PLN_GPU_TOKEN`, `HF_TOKEN`). Direct `curl /generate` returns **403 without the GPU token** — a 403 still proves the server is up.

**Recovery decision tree:**

| Symptom | Fix |
|---------|-----|
| `server.py` not running, but `nvidia-smi` works | **Process relaunch** (cheap): `ssh ... "bash /root/relaunch-zimage.sh"` — kills + relaunches via `/root/launch.sh`, survives SSH disconnect. Verify `Heartbeat sent successfully` in `/root/logs/zimage.log` and that the pod reappears in `/register`. |
| `nvidia-smi` → `Failed to initialize NVML: Unknown Error` (`/dev/nvidia*` owned by `nobody`) | **GPU off the bus — needs pod stop/start** (NOT recoverable in-container). See below. |
| Worker in `/register` + heartbeating, but **524 timeouts route only to that one host** (and it's slow / inference rate degrades mid-request / huge RSS from long uptime) | **Stale degraded process — relaunch it, but confirm the OLD pid actually died.** A heartbeat thread keeps firing even when generation hangs, so the pod looks healthy. See pkill caveat below. |
| All workers up + 100% util + still 524s | **Genuine capacity deficit** — add a GPU. Note 401/402 are rejected at the edge (~100ms) and do NOT load the GPU, so it's real paid demand, not abuse. |

> ⚠️ **`relaunch-zimage.sh` pkill caveat (2026-06-16):** the script kills by pattern `pkill -f 'z-image/server.py'`, but the running process command is often just `python server.py` (launched from within the z-image dir), so the pattern **does not match** and the relaunch silently no-ops — the new process then fails with `address already in use` and exits while the old, degraded process keeps serving. **Always verify the old PID actually died** (`ps -o pid,etime -C python` — elapsed time should reset to seconds). If it didn't: `kill -9 <pid>; fuser -k 8767/tcp; bash /root/relaunch-zimage.sh`.

**Pod stop/start (for NVML-broken GPU) — WIPES the container overlay disk.** Code is on `/root` (overlay), there is **no persistent `/workspace` volume**. So back up the provision script first, then rebuild:
```bash
# 1. Back up provision script BEFORE stopping:
ssh -i /tmp/zk -p <PORT> root@<IP> "cat /root/provision-zimage.sh" > /tmp/provision-zimage.sh
# 2. Stop + start (port rotates; GPU re-attaches on fresh container):
runpodctl pod stop <POD_ID>;  sleep 10;  runpodctl pod start <POD_ID>
# 3. Wait for RUNNING + tcp port, confirm GPU healthy (nvidia-smi shows the card), then re-provision:
scp -i /tmp/zk -P <NEW_PORT> /tmp/provision-zimage.sh root@<IP>:/root/
ssh -i /tmp/zk -p <NEW_PORT> root@<IP> \
  "export POD_ID=<POD_ID>; setsid bash /root/provision-zimage.sh > /root/provision.log 2>&1 </dev/null & disown"
# provision: re-clones branch feat/zimage-nf4-model-option, builds venv, downloads model (~9GB) + SPAN
#            upscaler, writes launch.sh, starts server. ~3-6 min. Tokens come from PID1 env (auto re-injected).
# 4. Verify: server LISTENING :8767, model loaded, heartbeat sent, pod appears in /register, e2e 200 via prod.
```

**Verify recovery end-to-end (prod success + load now shared):**
```bash
TOKEN=$(grep ENTER_API_TOKEN_REMOTE enter.pollinations.ai/.testingtokens | cut -d= -f2)
for i in 1 2 3 4 5; do curl -s -o /dev/null -w "HTTP %{http_code}\n" --max-time 60 \
  "https://gen.pollinations.ai/image/verify_${i}_$(date +%s%N)?model=zimage&width=512&height=512&seed=$i" \
  -H "Authorization: Bearer $TOKEN"; done
# Then confirm the 524 trend dropped in Tinybird (model_health / generation_event, model_requested='zimage').
```

The registry is Cloudflare KV-backed (`image:server:<env>:<type>:<hash>`, 240s TTL); workers heartbeat to `gen.pollinations.ai/register`.

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

## Procedure

When invoked, run checks in this order:

1. **gen.pollinations.ai registry** - `curl https://gen.pollinations.ai/register` (KV-backed), check worker count and error rates
2. **Flux/Z-Image RunPod** - verify 4 workers registered with 0% error rate
3. **LTX-2 health** - curl health endpoint
4. **LTX-2 e2e** - if healthy, test through gen.pollinations.ai (use test token from `.testingtokens`)
5. **ACE-Step health** - curl health endpoint on port 8189
6. **Klein health** - curl RunPod proxy health endpoint
7. **Legacy image service** - check systemctl status on OVH
8. **Sana worker** - curl health on GH200 port 8766
9. **Sana registry** - check OVH legacy registry for 1 worker with 0% errors
10. **Disk space** - check OVH disk usage

For each:
- If healthy: report OK with latency
- If unhealthy: attempt restart, wait, re-check, report result

## Auth

- **Test token**: Read from `enter.pollinations.ai/.testingtokens` (ENTER_API_TOKEN_REMOTE)
- **SSH keys**: Stored in SOPS (`enter.pollinations.ai/secrets/prod.vars.json`):
  - `SSH_RUNPOD_FLUX_ZIMAGE` — RunPod Flux+Z-Image pod
  - `SSH_LAMBDA_SANA_LTX2_ACESTEP` — Lambda GH200 (LTX-2, ACE-Step, Sana)
  - Klein uses the RunPod relay (`ssh.runpod.io`) with `~/.ssh/id_ed25519` — get the full command from the dashboard "Connect" tab
  - Extract: `sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r '.KEY_NAME' > /tmp/key && chmod 600 /tmp/key`
- **OVH**: `~/.ssh/id_rsa_ovh` (not in SOPS)

## Output

Report a brief status table:

```
| Service | Status | Latency | Notes |
|---------|--------|---------|-------|
| gen registry | OK | 0.1s | 4 workers, 0% errors |
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
