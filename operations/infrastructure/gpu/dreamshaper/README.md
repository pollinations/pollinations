# DreamShaper-8 LCM Server

FastAPI worker serving `dreamshaper` (alias `sana`) — DreamShaper-8 with the
LCM-LoRA fused in, a TAESD tiny decoder, and 3 sampling steps at 512×512.
Replaces the retired SANA-Sprint worker.

## Why this config

Three things fail **silently** if changed — no exception, just bad images:

- **`LCMScheduler` is mandatory.** dreamshaper-8 ships `DEISMultistepScheduler`
  with `solver_order=2` and `timestep_spacing="leading"`. Running an LCM model
  on that produces washed-out mush.
- **`guidance_scale=0.0`.** LCM bakes guidance into the model. cfg 1.5 looks
  identical but enables classifier-free guidance, which runs a second
  unconditional pass per step and costs ~1.8× throughput for nothing.
- **`peft` is required.** diffusers ≥0.30 dropped the non-PEFT LoRA backend, so
  `fuse_lora()` fails without it.

## Step count

3 is the floor for usable output. Measured at 512×512, batch 1:

| Steps | Quality | RTX 3090 | RTX 3060 |
|---|---|---|---|
| 1 | unrecoverable mush | 13.80 img/s | 9.04 img/s |
| 2 | holds up on portraits, soft on scenes and flat-vector | 8.79 | 5.45 |
| **3** | **clean** | **6.18** | **3.88** |
| 4 | marginally crisper | 5.06 | 3.01 |

Demand is 4.80 img/s average and **5.72 img/s peak hour**, so a single RTX 3090
at 3 steps covers peak with ~8% headroom. 4 steps does not (5.06 img/s).

Bigger cards do not help at batch 1: an RTX 4090 measured 4.99 img/s at 3 steps
— *slower than the 3090* — because its shared 64-core EPYC host is CPU-dispatch
bound and the GPU never saturates. The 4090 only pulls ahead with micro-batching
(22.8 img/s at batch 16), which this worker does not do. Even batched, the 3060
is cheaper per image ($0.0033 vs $0.0044 per 1k).

## Deployment

Registers into the gen registry pool as type `sana` via `/register` heartbeat
every 30s. The public model is `dreamshaper`; `sana` remains both its API alias
and the internal pool key. There is **no fallback** — if no worker is
registered, the model is down.

Each of the three Uvicorn worker processes accepts at most two generation
requests: one running and one waiting. Additional requests receive `503 Queue
full`, which lets gen immediately retry the other registered DreamShaper Vast
worker instead of building an unbounded queue on one GPU. `QUEUE_LIMIT` is
per process, so the default deployment admits at most six in-flight requests
per GPU.

**Rollout order:** do not enable `QUEUE_LIMIT` on production workers until gen
production contains the cross-worker 503 retry. First sync `main` to
`production`, deploy gen through GitHub Actions, and verify the retry is live.
Only then rerun this setup on both DreamShaper workers. Reversing the order
turns saturation into user-visible 503 responses instead of failover.

Requires a **named** Cloudflare tunnel, not a quick tunnel (quick tunnels caused
outage #12254). Point the public hostname at `http://localhost:8766` and pass
the hostname so heartbeats advertise the stable URL rather than a raw IP:

Provision a Vast SSH instance with at least 60 GB of disk and configure the
startup hook at rent time:

```bash
vastai create instance <OFFER> \
  --image vastai/base-image:cuda-12.8.1-cudnn-devel-ubuntu24.04-py312 \
  --disk 60 --ssh --label dreamshaper-vast-NN \
  --onstart-cmd 'if [ -x /root/onstart.sh ]; then /root/onstart.sh; fi'
vastai attach ssh <INSTANCE> ~/.ssh/id_ed25519.pub

# Isolated canary: no production heartbeat and no tunnel by default.
PLN_GPU_TOKEN=... PUBLIC_HOSTNAME=dreamshaper-canary.example.com \
  GIT_BRANCH=main bash setup-vast.sh

# Public-path canary: dedicated canary tunnel, still no production heartbeat.
PLN_GPU_TOKEN=... CLOUDFLARED_TUNNEL_TOKEN=... \
  PUBLIC_HOSTNAME=dreamshaper-canary.example.com TUNNEL_ENABLED=true \
  HEARTBEAT_ENABLED=false GIT_BRANCH=main bash setup-vast.sh

# Production only after the named promotion approval.
PLN_GPU_TOKEN=... CLOUDFLARED_TUNNEL_TOKEN=... \
  PUBLIC_HOSTNAME=dreamshaper-vast-NN.example.com TUNNEL_ENABLED=true \
  HEARTBEAT_ENABLED=true GIT_BRANCH=main bash setup-vast.sh
```

Env: `MODEL_ID`, `LCM_LORA`, `TINY_VAE`, `NUM_INFERENCE_STEPS`,
`GUIDANCE_SCALE`, `MAX_DIM` (768), `MAX_PIXELS` (512²), `PORT` (8766),
`REGISTER_URL`, `SERVICE_TYPE` (`sana`), `HEARTBEAT_ENABLED`,
`TUNNEL_ENABLED`, `WORKERS` (3), and `QUEUE_LIMIT` (2 per worker process).

Vast executes `/root/onstart.sh`, not `/workspace/onstart.sh`, after a container
restart. The startup script terminates any listener still holding port 8766
before relaunching Uvicorn; quitting the parent `screen` session alone can
leave worker children alive and cause an `Address already in use` loop.

**Ordering matters when replacing sana.** Before this change `sana` was reached
through a hardcoded backend URL that bypassed the registry pool. Deploy and
verify workers are registered *first*, then merge the routing change — merging
first drops all traffic on the floor.

## API

Same request/response contract as the sana worker.

### POST /generate

Requires header `x-backend-token: $PLN_GPU_TOKEN`; returns 403 otherwise.

```json
{
  "prompts": ["a cat wearing sunglasses"],
  "width": 512,
  "height": 512,
  "steps": 3,
  "seed": 42
}
```

Dimensions are clamped to `MAX_DIM` and `MAX_PIXELS` and rounded to /32, so a
1024×1024 request comes back 512×512.

`steps` is accepted but **ignored** — same as the sana worker. The gen worker
hardcodes `steps: 4` in every request body, and honouring that would drop a
3090 to 5.06 img/s, below the peak-hour rate this deployment is sized for.
Step count is set by `NUM_INFERENCE_STEPS` on the worker.

Response is a single-element array with base64 JPEG:

```json
[{"image": "<base64>", "has_nsfw_concept": false, "concept": [],
  "width": 512, "height": 512, "seed": 42, "prompt": "..."}]
```

### GET /health

```json
{"status": "healthy", "model": "Lykon/dreamshaper-8",
 "lora": "latent-consistency/lcm-lora-sdv1-5", "steps": 3, "guidance": 0.0}
```

> Build with 💖 for Pollinations.ai
