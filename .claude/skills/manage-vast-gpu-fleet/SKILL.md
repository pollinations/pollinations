---
name: manage-vast-gpu-fleet
description: "Inspect, price, canary, replace, and document Pollinations-operated Vast.ai GPU workers. Use for scheduled Vast offer scouting, GPU fleet cost or utilization reviews, preparing an isolated replacement, human-approved production cutovers, retiring replaced instances, and the follow-up repository PR."
---

# Manage Vast GPU Fleet

Use one repository-owned workflow for every current and future Vast workload.
Treat
[`GPU_INSTANCES.md`](../../../image.pollinations.ai/GPU_INSTANCES.md) as the
live inventory and each model directory as the source of truth for its setup
and verification commands.

## Establish authority

Read the repository `AGENTS.md` and `GPU_INSTANCES.md` before using provider
tools. Determine the requested mode:

- **Audit:** inspect fleet, offers, utilization, traffic, errors, and costs
  without changing external state.
- **Prepare:** rent and test one isolated candidate, but do not route
  production traffic.
- **Promote:** cut over one already-qualified candidate only after explicit
  human approval naming the workload and instance.

Default to Audit. A scheduled task may use Prepare only when its prompt
explicitly authorizes candidate spend. Never infer Promote authority from a
scheduled run or an earlier approval.

Never print credentials. Creating, adding, rotating, synchronizing, or
deploying a secret requires the separate approval and dedicated secret PR
defined in `AGENTS.md`. If Prepare lacks an approved, narrowly scoped canary
credential path, report the blocker and stop before provisioning.

## Invoke from scheduled tasks

Keep scheduling configuration outside this skill, but make every task prompt
invoke this checked-in file explicitly:

```text
Read and use .claude/skills/manage-vast-gpu-fleet/SKILL.md.
Mode: <Audit|Prepare>. Do not enter Promote mode.
```

Use **Audit** in the daily model-operations scout so it can reconcile fleet
economics without spending or duplicating the high-frequency task. Use
**Prepare** in the dedicated 15-minute Vast offer scout only after its spend
ceiling and canary credential path are configured. Both tasks must derive
thresholds, tests, reporting, and cleanup behavior from this skill instead of
copying them into their local prompts.

## Discover current state

Rebuild state from live evidence; do not trust instance IDs in documentation
without checking them.

1. List every Vast instance, including stopped storage, its machine, GPU,
   status, all-in hourly rate, reliability, location, disk, and utilization.
2. Map each active instance to its workload using labels, process health,
   Cloudflare connectivity, the Pollinations registry, and recent production
   attribution.
3. Measure recent demand, success rate, fallback volume, queue pressure, p50,
   p95, and GPU utilization over both burst and idle windows.
4. Reconcile the result with `GPU_INSTANCES.md`. Report stale documentation,
   paid idle resources, unregistered workers, or traffic served elsewhere.

Do not stop or destroy anything during Audit.

## Qualify offers

Inspect offers for every active Vast workload every 15 minutes in the scheduled
scout. Prepare at most one replacement at a time.

A candidate qualifies only when all conditions pass:

- Cash-equivalent savings exceed €10 per 30-day month after the 50% discount
  paid for the current Vast credits.
- The offer is verified, on-demand, currently rentable for at least 30 days,
  and has reliability of at least 99.7%.
- GPU class and count match the workload, with at least the current VRAM and
  disk.
- CPU, CUDA/driver, disk, and network meet the model's documented requirements.
- A replica replacement preserves host, machine, and failure-domain diversity.
- The machine is not in the temporary exclusion list in `GPU_INSTANCES.md`.

Use the all-in billed rate, including storage. Calculate:

```text
monthly_credit_savings = (current_rate - candidate_rate) * 720
monthly_cash_savings_eur =
  monthly_credit_savings * 0.50 * verified_USD_to_EUR_rate
```

Use the invoice exchange rate when available and state the rate and timestamp.
If the cash comparison cannot be verified, do not auto-prepare the candidate.
Also report undiscounted savings and remaining credit runway.

Marketplace reliability is only a filter. Reject a host that fails real image
pull, outbound network, Hugging Face access, disk, driver, or bootstrap checks.

## Prepare one isolated canary

Keep the existing production worker and fallback unchanged.

1. Rent one qualifying offer with a clear canary label and spend ceiling.
2. Attach the approved SSH public key and run the model's checked-in setup
   script.
3. Keep registration and shared production tunnels disabled while validating
   locally. Use a dedicated canary tunnel or VPC route for public-path tests.
4. Run the checked-in verification script when the model has one, then test:
   - exact checkpoint, quantization, runtime, and output quality;
   - direct authenticated API and the actual Cloudflare data path;
   - fixed-seed parity where deterministic;
   - normal, maximum, and invalid dimensions;
   - concurrency, queue shedding, latency, and error rate;
   - restart persistence and automatic service recovery;
   - sustained load representative of recent production demand;
   - input variants such as multi-image editing when the model supports them.
5. Inspect model, tunnel, CUDA, OOM, and network logs after the tests.

Destroy a failed candidate and leave production untouched. Record a repeatable
host failure in the temporary exclusion list with the date and requalification
condition.

## Stop at READY FOR APPROVAL

After all checks pass, do not change production. Send the configured
notification to Elliot and Thomas with:

- workload, current instance/GPU/rate, and candidate offer/machine/location;
- candidate rate, monthly credit savings, cash-equivalent savings, and runway;
- every test result, measured capacity, latency, and error rate;
- risks, caveats, current hold state, and whether stopping may lose capacity;
- the exact request:
  `Yes, promote Vast canary <instance> for <workload> to production now.`

Keep the candidate running when the short hold cost is smaller than the risk of
losing the offer. Stop it only when the user accepts that Vast may not restart
it on the same GPU.

## Promote after explicit approval

Approval is valid for one named candidate and workload.

1. Revalidate health, restart recovery, rate, and offer ownership if the
   candidate was stopped or the approval was delayed.
2. Join the intended production tunnel, VPC, registry pool, or route without
   changing model pricing or fallback policy.
3. Confirm real production requests are attributed to the new instance.
4. Verify production latency, success rate, queue behavior, and logs.
5. If verification fails, restore the prior route and keep the old instance.
6. If verification passes, drain and immediately destroy the replaced
   instance. Do not retain a paid rollback instance.
7. Confirm the destroyed instance no longer accrues compute or storage charges.

## Document the completed change

After a successful cutover and old-instance destruction, create a focused
repository PR:

1. Update `image.pollinations.ai/GPU_INSTANCES.md` with the new instance,
   machine/region, rate, status, total fleet burn, savings, validation evidence,
   temporary exclusions, and `Last updated` date.
2. Update the model README only when deployment behavior, limits, commands,
   performance, or a reusable failure mode changed.
3. Update setup or verification scripts only when the successful deployment
   required a durable implementation change.
4. Update the shared model registry only if the configured provider or public
   model contract changed. Replacing one Vast instance with another normally
   does not require a registry edit.
5. Keep secret mutations out of the operational PR.
6. Run the repository checks, open a ready PR with measured evidence, and do
   not merge it without explicit instruction.

Do not create a documentation-only PR for a failed candidate unless it produced
a reusable exclusion or deployment lesson.
