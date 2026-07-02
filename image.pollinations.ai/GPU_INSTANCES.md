# GPU Instances

Last updated: 2026-07-02

## Capacity Summary

| Model | Workers | GPUs | Provider | Cost/hr | Status |
|-------|---------|------|----------|---------|--------|
| Flux (FP4) | 2 | 2x RTX 5090 | Vast.ai | ~$0.43 each | **ACTIVE — production** (Fireworks fallback) |
| Z-Image | 3 | 4090 + 2x 3090 | RunPod | (see runpodctl) | **ACTIVE — production** |
| Klein 4B | 1 | 1x RTX A5000 | RunPod | $0.27 | **ACTIVE** |
| LTX-2 + ACE-Step + Sana | 1 | GH200 | Lambda Labs | — | **ACTIVE** |

## Provider: Vast.ai — Flux (RTX 5090, FP4)

Two single-GPU instances on different hosts (host redundancy), each fronted by
a Cloudflare Tunnel. Flux routes pool-first with automatic Fireworks fallback
(`gen.pollinations.ai/src/image/createAndReturnImages.ts` → `callFluxWithFallback`).

| Worker | Vast instance | Tunnel hostname | SSH |
|--------|--------------|-----------------|-----|
| flux-vast-01 | 43575766 (California) | `flux-vast-01.pollinations.ai` | `ssh -p 21972 -i ~/.ssh/pollinations_services_2026 root@192.220.55.116` |
| flux-vast-02 | 43594918 (US) | `flux-vast-02.pollinations.ai` | `ssh -p 10576 -i ~/.ssh/pollinations_services_2026 root@137.175.76.24` |

> Instance IDs/IPs/ports change on recreate — check `vastai show instances`.
> CRITICAL: workers MUST be behind a Cloudflare tunnel; the gen worker cannot
> fetch() raw-IP/non-standard-port origins (NAT'd `http://IP:PORT` URLs
> silently fall back to Fireworks).

**Provision a new instance** (see `nunchaku/setup-vast.sh` header for all env):
```bash
vastai search offers 'gpu_name=RTX_5090 num_gpus=1 verified=true rentable=true reliability>0.99 duration>=30 inet_down>=500 cpu_cores>=8 disk_space>=60' --order dph_total
vastai create instance <OFFER> --image "vastai/base-image:cuda-13.0.2-cudnn-devel-ubuntu24.04-py312" --disk 60 --ssh --direct --env '-p 8765:8765'
vastai attach ssh <INSTANCE> "$(cat ~/.ssh/pollinations_services_2026.pub)"
# copy the pollinations.ai account cert (e.g. from an existing worker) to ~/.cloudflared/cert.pem, then:
PLN_GPU_TOKEN=... HF_TOKEN=... TUNNEL_NAME=flux-vast-NN GIT_BRANCH=main bash setup-vast.sh
```
Gotchas (all hit in practice): rent hosts with `duration>=30`; verify
`intended_status=running` after create (GPU can be taken between create/start);
some hosts have broken direct SSH (use the `ssh_host:ssh_port` proxy) or broken
bulk egress (use `SKIP_CLONE=1` + scp, or rsync venv+`~/.cache/huggingface`
from a healthy worker); racing 2 candidate instances and destroying the loser
is cheap (~$0.40/hr each).

**Health / restart:**
```bash
curl -s https://flux-vast-01.pollinations.ai/docs -o /dev/null -w "%{http_code}\n"   # worker up
curl -s https://gen.pollinations.ai/register -H "Authorization: Bearer $PLN_GPU_TOKEN"  # registry
# on the instance: screen -r flux / screen -r cloudflared; logs /tmp/flux.log /tmp/cloudflared.log
```

**Key behavior:** FP4 nunchaku, 4 steps, full 1024x1024 (`MAX_PIXELS=1048576`);
~2.3s/image, ~1,900 img/hr sustained per GPU; baseline JPEG output;
`QUEUE_LIMIT=10` sheds load with 503 → gateway falls back to Fireworks.

## Provider: RunPod

Manage via `runpodctl` CLI or GraphQL API at `api.runpod.io/graphql`.
Job invocation at `api.runpod.ai/v2/{endpoint}/run` (note: different domain).

```bash
runpodctl pod list             # list pods
runpodctl pod get <id>         # pod details
```

### Pod jmrbmje2fyuy46 — Klein 4B

> Pod ID changes if recreated. Check `runpodctl pod list` and the `KLEIN_URL` env var (sops: `gen.pollinations.ai/secrets/prod.vars.json`).

- **GPU**: 1x RTX A5000 (24GB) | **Cost**: $0.27/hr via API ($0.29/hr in UI)
- **SSH**: full SSH using `SSH_RUNPOD_KLEIN` from SOPS; current runtime port changes on recreate/start
- **HTTP**: `https://jmrbmje2fyuy46-8000.proxy.runpod.net`
- **Service**: FLUX.2 Klein 4B (FastAPI on port 8000)
- **Auth**: `x-backend-token` header with `PLN_GPU_TOKEN`
- **Code**: `/workspace/handler.py` (mirrors `image.pollinations.ai/klein-runpod/handler.py`)
- **Logs**: `/workspace/klein.log`
- **Restart**: `bash /workspace/restart.sh` (in-pod)

**Health check:**
```bash
curl -s https://jmrbmje2fyuy46-8000.proxy.runpod.net/health
```

**Recovery from RunPod host outage**: see `.claude/skills/monitor-services/SKILL.md` Klein section. Pod volume is destroyed on terminate; `/workspace/handler.py`, `/workspace/venv`, and `/workspace/restart.sh` must be redeployed onto a fresh pod. Prefer cheap A5000/3090 capacity; do not jump to 4090 unless the higher hourly cost is explicitly accepted.

### Z-Image pods

Flux left RunPod on 2026-07-02 (pod hsl3ksl31lvrcc terminated; flux now on
Vast.ai, see above). Z-Image runs on dedicated pods — check current IDs with
`runpodctl pod list` (as of 2026-07-02: `icagz5lxdzotdx` zimage-4090-secure,
`ua39ysr9i86nil`/`owngt7t59jexy8` zimage-3090). Registered URLs use RunPod's
https proxy (`https://<pod>-<port>.proxy.runpod.net`).

**Registry check (all workers):**
```bash
curl -s https://gen.pollinations.ai/register -H "Authorization: Bearer $PLN_GPU_TOKEN" | python3 -m json.tool
```

## Provider: Lambda Labs

### LTX-2.3 Video + ACE-Step Music + Sana (GH200)

- **Host**: `192.222.51.105`
- **SSH**: `ssh -i <SSH_LAMBDA_SANA_LTX2_ACESTEP from SOPS> ubuntu@192.222.51.105`
- **LTX-2**: port 8765, health at `/health`
- **ACE-Step**: port 8189, systemd `acestep.service`
- **Sana**: port 8766, systemd `sana.service`, ~0.165s/img

## Provider: EC2 (AWS)

The legacy `image-pollinations.service` (port 16384) and `text-pollinations.service` (port 16385) on the `enter-services` EC2 box are decommissioned — image and text generation now run inside the `gen.pollinations.ai` Cloudflare Worker. The host still runs Discord bots; SSH config alias is `enter-services`.

### Staging

- **Host**: `44.222.254.250`
- **SSH**: `ssh -i ~/.ssh/enter-services-staging ubuntu@44.222.254.250`

## Heartbeat Registration

GPU workers send heartbeats to the gen worker registry:
- **URL**: `https://gen.pollinations.ai/register`
- **Check registered**: `curl -s https://gen.pollinations.ai/register`

## SSH Keys

GPU worker SSH keys are stored in SOPS (`enter.pollinations.ai/secrets/{dev,staging,prod}.vars.json`).

Extract for use: `sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r '.KEY_NAME' > /tmp/key && chmod 600 /tmp/key`

| SOPS key | Provider | Instances |
|----------|----------|-----------|
| `SSH_RUNPOD_FLUX_ZIMAGE` | RunPod | Flux+Z-Image pod (`hsl3ksl31lvrcc`) |
| `SSH_RUNPOD_KLEIN` | RunPod | Klein pod (`jmrbmje2fyuy46`) |
| `SSH_LAMBDA_SANA_LTX2_ACESTEP` | Lambda Labs | GH200 (LTX-2, ACE-Step, Sana) |

Klein uses `SSH_RUNPOD_KLEIN` from SOPS. Get the current public SSH host/port from RunPod runtime ports; the port changes when the pod is recreated or restarted.

EC2 keys (not in SOPS):

| Key | Provider | Location |
|-----|----------|----------|
| `~/.ssh/enter-services-shared` | EC2 prod | enter services |
| `~/.ssh/enter-services-staging` | EC2 staging | enter services |
