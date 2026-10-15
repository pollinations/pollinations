# Sana compatibility route

Last updated: 2026-09-02

## Current deployment

SANA Sprint is no longer in the production image route. The public `sana`
model name is retained as an alias of `dreamshaper`, which serves DreamShaper 8
LCM from two Vast workers. The internal registry pool key also remains `sana`
for compatibility.

| Worker | Vast instance | Machine / region | GPU | All-in rate | Registered hostname |
|--------|---------------|------------------|-----|-------------|---------------------|
| dreamshaper-vast-01 | 49063196 | 143507 / Mexico, MX | RTX 3060 | $0.075556/hr | `dreamshaper-canary-49063196.myceli.ai` |
| dreamshaper-vast-02 | 47789794 | 100803 / Romania, RO | RTX 4070 | $0.093889/hr | `dreamshaper-canary-47789794.myceli.ai` |

The route is:

```text
model=sana -> registry alias dreamshaper -> pool type sana
           -> named Cloudflare tunnels -> DreamShaper workers
```

There is no automatic external fallback. Both workers run
`operations/infrastructure/gpu/dreamshaper/setup-vast.sh`, and Vast restores
`/root/onstart.sh` after a container restart. See
[`GPU_INSTANCES.md`](../GPU_INSTANCES.md) for the live fleet and qualification
evidence, and [`DreamShaper README`](./README.md) for deployment and API
details.

## Historical Sana infrastructure

Vast instance `30937024`, the Scaleway Sana workers, and the legacy SSH-tunnel
route are historical and are not part of production dispatch. Do not use old
IP addresses or SSH commands from prior runbooks when diagnosing the current
`sana` alias.
