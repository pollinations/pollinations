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
- **Prepare:** rent and test isolated candidates for one or more production GPU
  slots, but do not route production traffic.
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
**Prepare** in the dedicated Vast offer scout only after its spend ceiling and
canary credential path are configured.

Keep volatile operating policy in the scheduled task, including cadence,
savings and reliability thresholds, credit discounts, exchange rates, hardware
filters, candidate TTL and spend ceilings, aggregate concurrency budget, and
temporary machine cooldowns. Keep durable coordination, validation, approval,
cleanup, and documentation rules in this skill.

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

Inspect offers for every active Vast workload at the cadence configured by the
scheduled task. Treat each current production instance as an independently
replaceable GPU slot. A workload with two replicas therefore has two target
slots.

A candidate qualifies only when all conditions pass:

- It passes the scheduled task's current savings, reliability, availability,
  hardware, network, and spend policy.
- Its all-in rate includes storage and is compared using the task's current
  credit discount and verified exchange rate.
- GPU, VRAM, disk, CPU, CUDA/driver, and network preserve the workload's
  documented capability and recent production capacity.
- A replica replacement preserves host, machine, and failure-domain diversity.
- The cash comparison is verifiable; otherwise do not auto-prepare it.

Marketplace metadata and previous failures are only filters. Require real image
pull, outbound network, model-download, disk, driver, bootstrap, and
workload-specific checks. Apply time-bounded machine cooldowns from automation
memory; do not turn a transient provider failure into a permanent repository
blacklist.

## Coordinate overlapping runs

Use an atomic lease keyed by the exact production instance being replaced.
Automation memory is not a lock.

1. Before renting, check live Vast labels and the lease store for an existing
   candidate for that target.
2. Acquire the target lease atomically, then recheck the production instance
   and offer before spending.
3. Label the candidate with its workload, target production instance, and
   lease ID so a later run can recover state.
4. Keep a heartbeat while provisioning and testing. A stale lease with a live
   candidate must be adopted or cleaned up, never ignored.
5. Release only that target's lease after confirmed cleanup or completed
   promotion.

One scheduled run may claim every qualifying unlocked target and prepare those
candidates in parallel. Another overlapping run may prepare other unlocked
targets, but never a second candidate for an already locked production slot.
Enforce the aggregate concurrency and spend ceiling supplied by the scheduled
task.

## Prepare isolated canaries

Keep the existing production worker and fallback unchanged.

1. Run each affected workload's executor preflight independently. Exclude only
   targets whose workload is not ready; do not block other ready workloads.
2. Acquire the per-target leases, revalidate each offer, and immediately rent
   all claimed offers before their availability changes.
3. Deploy and test the claimed candidates in parallel. Enforce the
   per-candidate TTL and spend ceiling supplied by the scheduled task.
4. Attach the approved SSH public key and run each model's checked-in setup
   script.
5. Keep registration and shared production tunnels disabled while validating
   locally. Use a dedicated canary tunnel or VPC route for public-path tests.
6. Run the checked-in verification script when the model has one, then test:
   - exact checkpoint, quantization, runtime, and output quality;
   - direct authenticated API and the actual Cloudflare data path;
   - fixed-seed parity where deterministic;
   - normal, maximum, and invalid dimensions;
   - concurrency, queue shedding, latency, and error rate;
   - restart persistence and automatic service recovery;
   - sustained load representative of recent production demand;
   - input variants such as multi-image editing when the model supports them.
7. Inspect model, tunnel, CUDA, OOM, and network logs after the tests.

Handle targets independently. Destroy a failed candidate, verify its compute
and storage billing ended, release only its target lease, and leave production
and other canaries untouched. Record transient host failures in automation
memory with the task's cooldown. Add repository guidance only when a failure
reveals a durable, repeatable deployment requirement.

## Stop at READY FOR APPROVAL

After a candidate passes all checks, do not change production. Keep it running,
hold its target lease, and send the configured notification to Elliot and
Thomas with:

- workload, target production instance/GPU/rate, and candidate
  offer/machine/location;
- candidate rate, monthly credit savings, cash-equivalent savings, and runway;
- every test result, measured capacity, latency, and error rate;
- risks, caveats, current hold state, and whether stopping may lose capacity;
- the exact request:
  `Yes, promote Vast canary <instance> for <workload> target
  <production-instance> to production now.`

Keep the candidate running when the short hold cost is smaller than the risk of
losing the offer. Stop it only when the user accepts that Vast may not restart
it on the same GPU. A ready candidate blocks only its target; scouting and
preparation may continue for other unlocked production slots.

## Promote after explicit approval

Approval is valid for one named candidate, workload, and target production
instance. Serialize promotions within a workload even when multiple candidates
are ready.

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
8. Release its target lease. Before promoting another candidate for the same
   workload, revalidate savings, capacity, and failure-domain diversity against
   the newly changed fleet.

## Document the completed change

After a successful cutover and old-instance destruction, create a focused
repository PR:

1. Update `image.pollinations.ai/GPU_INSTANCES.md` with the new instance,
   machine/region, rate, status, total fleet burn, savings, validation evidence,
   and `Last updated` date.
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
a reusable deployment lesson.
