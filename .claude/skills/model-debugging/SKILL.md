---
name: model-debugging
description: Diagnose Pollinations model failures, error spikes, timeouts, and incorrect output using current gen/enter logs and Tinybird data. Use for incidents or specific failed requests; use model-management for catalog, routing, or pricing changes.
---

# Model debugging

Read the repository `AGENTS.md` and inspect the current route before diagnosing a live issue. Treat a reported cause as a hypothesis. Establish the affected model, request shape, environment, time window, and user-visible symptom first.

## Trace the failure

1. Check the [Model Monitor](https://monitor.pollinations.ai) and the current definitions of `enter.pollinations.ai/observability/endpoints/model_health.pipe` and `recent_server_errors.pipe`. The monitor shows aggregated health; the error pipe contains recent actionable server-side failures.
2. Trace a request ID through the enter and gen Workers, then the provider. Use the relevant Worker's logs or `wrangler tail` for live events. Verify the target environment before querying it.
3. For production SQL, use `enter.pollinations.ai/observability/scripts/tb-prod.sh`. It loads the existing read token without printing it. Use `--check` to verify access and fresh events. Keep queries bounded by time and row count.
4. Compare the affected user's requests with other users of the same model and route. Group by status, upstream status, provider, request shape, and time. Reproduce the exact request with an existing authorized test credential when needed; use a unique prompt to avoid mistaking a cached response for a healthy upstream.
5. Report the evidence, impact, remaining uncertainty, and smallest fix. If a code fix is requested, follow the relevant repository skill and testing instructions.

## Interpret the data

- `generation_event_v2` contains authenticated, non-cached requests. Check its current [datasource definition](../../../enter.pollinations.ai/observability/datasources/generation_event_v2.datasource) before writing SQL. It can contain several upstream-attempt rows per request; `is_final` identifies the user-visible result. A successful fallback can hide a broken primary if you only count final responses.
- In `model_health`, `total_requests` and status counts use final results; `own_calls`, `primary_5xx`, `primary_retried_503s`, and `fallback_rescues` describe upstream health and recovery. Check both views.
- A 401, 402, 403, 400, or 429 can originate at different layers. Follow `error_source`, `error_response_code`, `upstream_status`, and the response body before treating it as caller noise or a model outage.
- A server-side 200 can still arrive after the client's timeout. Inspect the latency tail per user and request shape, not just status rates or p95.
- For streaming failures or missing usage, inspect the final SSE chunks and the original transport error across provider, adapter, and validator before blaming the provider.
- A provider 500 can originate from invalid caller input, such as a seed above signed INT32 range. Compare failures by request shape before declaring an upstream outage.
- An immediate queue-full or rate-limit error can come from limiter state or many clients sharing one proxy IP while the backend is idle. Compare limiter and backend counters before restarting a worker.
- If a suspected deploy or proxy caused timeouts, compare the symptom before and after the change and inspect the outermost hop. Use sequential direct-versus-proxy probes from a relevant region; parallel bursts can create misleading client failures.

## Targeted helpers

The scripts in `scripts/` query production Tinybird through the repository's read-only helper. They accept bounded numeric windows and should be run from the repository root:

```bash
.claude/skills/model-debugging/scripts/find-402-users.sh 24 10
.claude/skills/model-debugging/scripts/find-403-users.sh 24 10
.claude/skills/model-debugging/scripts/find-500-errors.sh 24
.claude/skills/model-debugging/scripts/check-user-errors.sh USER_ID 24
```

These reports contain user identifiers and error details. Inspect only the rows needed for the task and keep sensitive values out of shared output.

Secret changes and production deployments follow the approval and CI rules in `AGENTS.md`; an incident diagnosis does not authorize either operation.
