# Isolated developer environments: security and pilot boundaries

Issue: #16681. This is a design for review, not an operational deployment.
The [local smoke test](README.md) covers resource wiring only; it does not
exercise the publisher or credential gateway described below.

## Goal and non-goals

Two developers should be able to test independent SDK, UI, Enter and Gen
changes without receiving shared provider credentials or access to another
environment's data. The eventual deployment must support real providers,
budget enforcement outside branch-controlled code, and independently verified
identity. A local mock is useful for testing but does not satisfy this goal.

The first pilot must not change production or staging, enable real provider
access, or issue or rotate credentials. Until the security boundaries below
have been reviewed and verified in the actual Cloudflare account, it must not
be presented as a secure or usable branch deployment system.

## Trust boundaries

1. **Untrusted source and builds.** A developer can change every file in their
   branch, including dependency hooks, migrations, Workers, deployment config
   and tests. Build jobs run this code with no shared credentials, no
   privileged identity token, no access to protected runners and no secret
   inheritance. Their output is untrusted, even if its checksum is correct.
2. **Protected publisher and control plane.** Provisioning, environment
   ownership, policy, manifest validation and publishing run from a protected,
   reviewed revision, separate from branch source. A privileged publisher must
   not run branch scripts, package hooks, migrations, shell fragments or
   branch-provided infrastructure configuration. It treats bundles and assets
   as data. An immutable artifact digest binds the deployment request to the
   artifact the authorized developer actually selected; the digest alone does
   not make that artifact trustworthy.
3. **Isolated runtime.** Each environment receives distinct Workers, D1, KV, R2,
   Durable Objects and URLs; Enter and Gen may share their own environment's
   data where required, but not another environment's. Bindings come from the
   trusted control plane, not from branch `wrangler.toml`. Production and
   staging resources, provider credentials, privileged MCP services, dispatch
   namespaces, VPC bindings and shared storage are not available by default.
   Names or manifest checks alone are not proof of Cloudflare isolation:
   permissions, routes, namespace ownership and actual deployed bindings must
   be checked in the real account.
4. **Protected provider gateway.** A separately deployed and protected service
   holds provider credentials and owns authorization and a durable budget
   ledger. Branch-controlled Enter, Gen, browsers and databases are untrusted.
   No caller-supplied identity header, resource name, price, provider usage or
   completion status establishes authority. The gateway verifies the human's
   identity independently and binds it to an authorized environment.

## Provider and budget contract

- The gateway exposes explicit supported operations, not arbitrary URLs,
  headers, credentials or general-purpose signing. Provider destinations,
  methods, redirects, models and parameters are constrained in trusted code.
  Never return a reusable credential or a broadly usable signed request.
- Before provider work, trusted pricing and request limits determine a
  conservative maximum cost. Reserve this amount atomically against both the
  developer and global limits. Fail closed when identity, pricing, durable
  state or reservation is unavailable. An estimate that can understate the
  provider's maximum cost is not a hard spending limit.
- Persist request identity, reservation and settlement state outside editable
  branch code. A duplicate idempotency key with different request parameters
  must fail; retries of the same request must not start or charge a second
  operation. Settlement uses usage observed and verified by the gateway, not
  numbers submitted by the branch. Release only the unused reservation.
- A disconnect, provider timeout, worker crash, missing usage or uncertain
  provider outcome must not silently release funds or start duplicate work.
  Hold the reservation and reconcile from durable state; define bounded
  provider-specific recovery before enabling each operation. If usage exceeds
  the reserved bound or cannot be determined, fail closed and retain the
  unresolved record for reconciliation rather than claiming a hard cap was
  enforced.
- Text streams, images, asynchronous videos, retries and reconnects have
  different lifecycle and metering semantics. Each needs a reviewed adapter,
  explicit upper bounds and tests before real traffic is enabled.

Existing D1 reservation and tracking code is useful reference, not a substitute
for this boundary: a branch-controlled worker cannot be trusted to enforce a
developer's own budget, and post-response charge failures need durable recovery.

## Verification gates

Before a real pilot:

- Prove that branch install/build/migration code cannot receive cloud, gateway,
  provider, SOPS or CI credentials, including through inherited environment,
  logs, caches, artifact metadata or runner persistence. Test malicious
  dependencies and branch-modified workflows, not only normal builds.
- Deploy two environments and inspect effective bindings and permissions.
  Attempt cross-environment D1/KV/R2/DO access, shared service bindings, route
  collisions, credential extraction and privileged control-plane access. Check
  teardown leaves the other environment and shared resources unchanged.
- Test forged identities, expired credentials, unauthorized environments,
  arbitrary destinations, redirects, unexpected headers and credential
  extraction. Verify the protected gateway cannot be replaced by branch code.
- Exercise concurrent reservations at both limits, idempotent duplicate
  requests, differing payloads with the same key, timeouts, crashes, retries,
  incomplete usage and provider failures. Verify the durable ledger after
  restart; in-memory tests alone cannot demonstrate this.
- Only after mock security tests and maintainer approval, exercise real
  text/image/video and UI → Enter → Gen using approved isolated test accounts.
  Verify disconnect/rejoin, one provider execution and one settlement.

## Decisions required before deployment

Maintainers must choose the protected publishing mechanism, environment
ownership and authentication method, Cloudflare account/resource permissions,
gateway ledger and recovery policy, per-developer/global budgets, supported
provider adapters, and artifact provenance mechanism. Cloud provisioning,
credential additions or rotations, and policy changes require their own
appropriate approvals. No approval for production or secret mutation is implied
by this design.
