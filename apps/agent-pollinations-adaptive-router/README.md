# Pollinations Adaptive Router

Code agent for quest #15017.

Public source and tests: https://github.com/muhamedsohaib/pollinations-adaptive-router

Callable model: `muhamedsohaib/pollinations-adaptive-router`

The router classifies each request into `FAST`, `BALANCED`, `CODE`, `DEEP`, `MULTIMODAL`, or `MULTIMODAL_DEEP`, then chooses among a small quality-bounded model pool using live Pollinations metadata:

- catalog price from `/v1/models`
- 30-minute 5xx health and fallback rescues
- p95 latency from `/models/status?minutes=30`
- required input modalities
- a light quality-rank prior inside each profile

It forwards the caller's request unchanged except for the chosen `model` and exposes the decision through response headers:

- `x-pollinations-router-model`
- `x-pollinations-router-profile`
- `x-pollinations-router-reason`

Live deployed proof on 2026-09-21 produced three different downstream routes: FAST → `openai/gpt-5.4-nano`, CODE → `openai/gpt-5.4-mini`, and DEEP → `x-ai/grok-4.3`.

The public repository includes seven passing tests covering classification, cost/health routing, degraded-model avoidance, modality filtering, and trace headers.
