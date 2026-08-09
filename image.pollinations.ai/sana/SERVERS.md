# Sana compatibility route

Last updated: 2026-08-09

## Current deployment

SANA Sprint is no longer in the production image route. The public `sana`
model name is retained as an alias of `dreamshaper`, which serves DreamShaper 8
LCM from two Vast RTX 3090 workers. The internal registry pool key also remains
`sana` for compatibility.

| Worker | Vast instance | Machine / region | All-in rate | Registered hostname |
|--------|---------------|------------------|-------------|---------------------|
| dreamshaper-vast-01 | 46607014 | 4749 / Oregon, US | $0.150000/hr | `dreamshaper-canary-46600159.myceli.ai` |
| dreamshaper-vast-02 | 46387155 | 123712 / California, US | $0.153333/hr | `dreamshaper-vast-02.pollinations.ai` |

The route is:

```text
model=sana -> registry alias dreamshaper -> pool type sana
           -> named Cloudflare tunnels -> DreamShaper workers
```

There is no automatic external fallback. Both workers run
`dreamshaper-lcm/setup-vast.sh`, and Vast restores `/root/onstart.sh` after a
container restart. See [`../GPU_INSTANCES.md`](../GPU_INSTANCES.md) for the
live fleet and qualification evidence, and
[`../dreamshaper-lcm/README.md`](../dreamshaper-lcm/README.md) for deployment
and API details.

## Historical Sana infrastructure

Vast instance `30937024`, the Scaleway Sana workers, and the legacy SSH-tunnel
route are historical and are not part of production dispatch. Do not use old
IP addresses or SSH commands from prior runbooks when diagnosing the current
`sana` alias.
