# DreamShaper-8 LCM Server

FastAPI worker serving `dreamshaper` (alias `sana`) — DreamShaper-8 with the
LCM-LoRA fused in, a TAESD tiny decoder, and 3 sampling steps at 512×512.
Replaces the SANA-Sprint worker in `../sana/`.

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

Registers into the gen registry pool as type `dreamshaper` via `/register`
heartbeat every 30s. There is **no fallback** — if no worker is registered, the
model is down.

Requires a **named** Cloudflare tunnel, not a quick tunnel (quick tunnels caused
outage #12254). Point the public hostname at `http://localhost:8766` and pass
the hostname so heartbeats advertise the stable URL rather than a raw IP:

```bash
PLN_GPU_TOKEN=... \
PUBLIC_HOSTNAME=dreamshaper-vast.example.com \
NUM_INFERENCE_STEPS=3 \
python server.py
```

Env: `MODEL_ID`, `LCM_LORA`, `TINY_VAE`, `NUM_INFERENCE_STEPS`,
`GUIDANCE_SCALE`, `MAX_DIM` (768), `MAX_PIXELS` (512²), `PORT` (8766),
`REGISTER_URL`, `SERVICE_TYPE` (`dreamshaper`).

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
