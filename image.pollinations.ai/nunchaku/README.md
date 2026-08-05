# Flux Schnell on Vast.ai

The production Flux worker runs FLUX.1 Schnell with Nunchaku FP4 on a single
RTX 5090. Vast instances are containers without systemd, so
[`setup-vast.sh`](./setup-vast.sh) installs the pinned runtime and supervises
the model server and Cloudflare Tunnel in `screen` restart loops.

## Cloudflare preparation

Create a remotely-managed tunnel in the authoritative Pollinations Cloudflare
account before production promotion:

1. Route a stable hostname such as `flux-vast-NN.pollinations.ai` to
   `http://localhost:8765`.
2. Copy the tunnel token. Do not copy `cert.pem` to a rental host; it can create
   tunnels and DNS records for the account. A remotely-managed tunnel only
   needs its scoped token to run. See [Cloudflare tunnel tokens](https://developers.cloudflare.com/tunnel/advanced/tunnel-tokens/).

The stable tunnel is required because the gen Cloudflare Worker cannot route to
a Vast NAT address on a non-standard port.

## Deploy

On a fresh Vast RTX 5090 instance:

```bash
PLN_GPU_TOKEN=... \
HF_TOKEN=... \
PUBLIC_HOSTNAME=flux-vast-NN.pollinations.ai \
bash setup-vast.sh
```

This is canary-safe by default: the model starts locally, while registry
heartbeat and the production tunnel remain disabled. Model and server settings
are persisted in the ignored `.env.flux` file. The setup also installs
`/root/onstart.sh`, which Vast runs after a container restart.

After the canary passes and a human approves promotion, rerun setup with the
same model tokens plus the scoped tunnel token:

```bash
PLN_GPU_TOKEN=... \
HF_TOKEN=... \
CLOUDFLARED_TUNNEL_TOKEN=... \
PUBLIC_HOSTNAME=flux-vast-NN.pollinations.ai \
HEARTBEAT_ENABLED=true \
TUNNEL_ENABLED=true \
bash setup-vast.sh
```

The tunnel token is written to a mode `0600` file and never included in the
`cloudflared` process arguments. The tunnel waits for local model health before
joining production. Hosts that cannot resolve Cloudflare SRV records
automatically use a local DNS-over-HTTPS resolver.

## Verify before traffic cutover

A healthy `/docs` response and registry heartbeat are control-plane checks;
they do not prove that `gen.pollinations.ai` can reach the tunnel. Replicate can
otherwise hide a broken Vast route.

Before promotion, expose the worker through a dedicated test-only endpoint and
compare that external path with localhost. Never use the production hostname
for this step:

```bash
CANARY_URL=https://<test-only-hostname> bash verify-vast.sh
```

The canary creates a unique uncached prompt, generates it locally and through
the external endpoint with the same seed, and compares decoded pixels. Do not
change production routing until this passes and a human explicitly approves
the promotion. After cutover, run `verify-vast.sh` with
`POLLINATIONS_API_KEY` and no `CANARY_URL`, confirm real production requests
are served by the replacement, then drain and immediately destroy the old
worker.
The fleet-wide qualification and approval policy is documented in
[`manage-vast-gpu-fleet`](../../.claude/skills/manage-vast-gpu-fleet/SKILL.md).

## Operations

```bash
tail -f /tmp/flux.log
tail -f /tmp/cloudflared.log
screen -r flux
screen -r cloudflared
/root/onstart.sh
```

The setup defaults are `QUEUE_LIMIT=3`, `MAX_PIXELS=1048576`, and
`mit-han-lab/svdq-fp4-flux.1-schnell`. Hugging Face Xet is disabled by default
because stalled Xet connections were observed on Vast; standard HTTP resumes
reliably from partial downloads. Override defaults only through the documented
environment variables in `setup-vast.sh`.

`QUEUE_LIMIT=3` means one request can run while two wait. Additional requests
receive 503 immediately so the gateway can use Replicate rather than building a
long user-facing queue. Keep Replicate enabled as burst capacity; add a second
Vast GPU only when its measured avoided fallback cost exceeds its hourly cost.
