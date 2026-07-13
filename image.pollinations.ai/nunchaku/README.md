# Flux Schnell on Vast.ai

The production Flux worker runs FLUX.1 Schnell with Nunchaku FP4 on a single
RTX 5090. Vast instances are containers without systemd, so
[`setup-vast.sh`](./setup-vast.sh) installs the pinned runtime and supervises
the model server and Cloudflare Tunnel in `screen` restart loops.

## Cloudflare preparation

Create a remotely-managed tunnel in the authoritative Pollinations Cloudflare
account before provisioning the Vast host:

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
CLOUDFLARED_TUNNEL_TOKEN=... \
PUBLIC_HOSTNAME=flux-vast-NN.pollinations.ai \
bash setup-vast.sh
```

The tunnel token is written to a mode `0600` token file and is not included in
the `cloudflared` process arguments. Model and server settings are persisted in
the ignored `.env.flux` file.

## Verify before traffic cutover

A healthy `/docs` response and registry heartbeat are control-plane checks;
they do not prove that `gen.pollinations.ai` can reach the tunnel. Fireworks can
otherwise hide a broken Vast route.

Run the end-to-end canary on the Vast host with a valid Pollinations API key:

```bash
POLLINATIONS_API_KEY=... bash verify-vast.sh
```

The canary creates a unique uncached prompt, generates it directly on Vast and
through the public Flux route with the same seed, and compares decoded pixels.
Do not destroy the old worker until this passes on the replacement.

## Operations

```bash
tail -f /tmp/flux.log
tail -f /tmp/cloudflared.log
screen -r flux
screen -r cloudflared
```

The setup defaults are `QUEUE_LIMIT=10`, `MAX_PIXELS=1048576`, and
`mit-han-lab/svdq-fp4-flux.1-schnell`. Override them only through the documented
environment variables in `setup-vast.sh`.
