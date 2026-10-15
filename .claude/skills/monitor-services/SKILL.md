---
name: monitor-services
description: Check the active Pollinations GPU backends and recover a confirmed failure of an existing worker when the task authorizes repair. Use for recurring health checks and GPU incidents; use manage-vast-gpu-fleet for replacements.
---

# Monitor GPU services

Read the repository `AGENTS.md`, the current [GPU inventory](../../../operations/infrastructure/gpu/GPU_INSTANCES.md), and the affected model's code before acting. Discover live instances and routes from the provider and Gen; documented instance IDs, addresses, prices, and retired services are historical until verified. Keep scheduling and alert thresholds in the task that invokes this skill.

## Check the current fleet

1. Reconcile the inventory with current Gen routes, live provider instances, and `GET https://gen.pollinations.ai/register` (listing needs no token). Check every active GPU route; flag a routed service missing from the inventory, and skip historical services without an active route.
2. Check the [model health endpoint](../../../enter.pollinations.ai/observability/endpoints/model_health.pipe) for final failures, primary failures, fallback rescues, and latency. Use [recent server errors](../../../enter.pollinations.ai/observability/endpoints/recent_server_errors.pipe) and Worker logs for a specific failure. A successful fallback can hide an unhealthy GPU.
3. For a suspected worker, compare its direct health and authenticated generation with a real request through `gen.pollinations.ai`. Check the GPU process, queue, tunnel, and logs on the verified host. A registry heartbeat does not prove the data path works; a failed probe credential does not prove the backend is down. Some tunnel hostnames return a bot-protection 403 to `Python-urllib/*`; retry health probes with curl or another user agent before declaring failure.
4. Check how the workload is routed before interpreting a missing registry entry. Production Klein uses the `KLEIN_VPC` binding to a private Vast tunnel, so it does not appear in the heartbeat registry. `KLEIN_URL` is for environments without that binding.

Use an existing authorized test credential without printing it. Keep probes bounded, and compare failures with recent demand and provider fallback before declaring an outage.

## Recover and verify

- If the monitoring task authorizes repair of an existing worker, identify the exact live instance and use its checked-in setup or restart procedure. Recheck the process, direct endpoint, public Gen request, and final error rate after the restart.
- For new capacity, a replacement instance, routing or tunnel changes, use the [Vast fleet skill](../manage-vast-gpu-fleet/SKILL.md). Its prepare and promote steps have separate scope and approval requirements.
- For any credential deployment or secret change, follow the separate approval gate in `AGENTS.md`. Production Cloudflare Worker deployments and secret synchronization run through `Deploy / Cloudflare production` from the `production` branch; never push production Worker secrets from a local session.
- If the current host or approved recovery path cannot be verified, stop before changing production and report the impact and required next action.

Report each active workload's route, public and backend health, fallback use, action taken, and post-action verification. Mark retired or unverified services explicitly rather than running historical restart commands.
