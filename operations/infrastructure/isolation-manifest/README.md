# Offline two-slot isolation manifest pilot

This is a **non-deploying** policy experiment for #16681. The manifest
checks are dependency-free:

```sh
node --test operations/infrastructure/isolation-manifest/manifest.test.cjs
```

After `npm ci` at the repository root, also run the local runtime smoke test:

```sh
node --test operations/infrastructure/isolation-manifest/local-isolation.test.cjs
```

It starts two Enter/Gen pairs in Wrangler's local emulator using fixture
Workers, in-memory bindings and no cloud configuration. It checks that Gen
reaches its own Enter, that the pair shares its D1 and KV, and that writes to
D1, KV, R2 and Durable Objects remain separate across the two slots even
when both receive requests. Remote Cloudflare resources, real application
entrypoints and real providers are not exercised.

See [SECURITY.md](SECURITY.md) for the publisher and gateway boundaries,
deployment prerequisites, and acceptance tests for a real pilot.

`createPlan()` returns a human-readable logical graph for `pilot-a` and `pilot-b`. Each has an Enter and Gen Worker, its own D1, KV, R2 and Gen-owned Durable Object classes; within a slot Enter and Gen intentionally share D1 and KV, including Enter's `SETUP_HOLDS` alias. Gen's only service binding is `ENTER` to its own Enter. The binding names and classes follow the existing Wrangler configurations; this is a deliberately incomplete feature subset, not a deployable Wrangler config. In particular there are no MCP, media, email, images, rate limits, outbound, dispatch, VPC, cron, provider, payment, or secret bindings.

`validate(plan, proposed, approved, reserved)` accepts plain JSON data: the logical graph, a proposed allocation, a **trusted** allocation record, and a **trusted** array of reserved identifiers. `createPlan()` generates no Cloudflare IDs, account IDs, domains, credentials or resource names. The allocation shape is illustrated by `fixture()` in the tests; every string there is synthetic. An allocation maps each slot's `workers.enter`, `workers.gen`, `d1`, `kv`, `r2`, `routes.enter`, and `routes.gen` to its externally assigned identifier or exact hostname. Logical names and actual identifiers are separate; service targets and Durable Object ownership are fixed by the graph, not supplied by the branch. Identifiers use a restrictive lowercase ASCII subset; routes are exact hostnames without schemes, ports, paths or wildcards. This is not a general Cloudflare syntax validator.

The validator requires the exact graph, exact trusted allocation, closed record fields, distinct identifiers even across resource kinds, and no exact matches against `reserved`; it also rejects `prod`, `production`, or `staging` as complete dot/hyphen-delimited tokens. This keyword check is defense in depth, **not** a production/staging resource inventory: opaque IDs, aliases and names such as `pollinations-text-enter` require the trusted reserved list. No identifier is normalized, so uppercase, Unicode and whitespace are rejected rather than silently equated. Route collision checks are exact hostname equality, not DNS, wildcard, zone, routing precedence or ownership checks.

## Trust and limits

- A future trusted controller must run a pinned, reviewed copy of this validator **outside branch control**, construct its own graph and trusted allocation/complete reserved inventory, and compare untrusted proposals without merging or executing them. Running a branch's copy, letting it select or alter `approved` or `reserved`, or validating an input then deploying different data defeats this boundary. Parse JSON once with duplicate-key rejection before calling; this module accepts objects and does not parse input or detect duplicate JSON keys. Inputs must be ordinary data, not objects with accessors or proxies.
- The trusted allocation and reserved inventory require independent authorization, cloud inventory and ownership review. The validator cannot know whether an opaque identifier belongs to production, staging, another account, another environment or a resource of the claimed type. An empty or incomplete reserved list is not proof of safety. It does not query Cloudflare, verify actual bindings, isolate traffic, constrain arbitrary Worker code, establish identity or enforce budgets.
- Durable Object namespaces are represented by the owning Gen Worker and fixed class names, not invented namespace IDs. Actual namespace isolation and migrations require Cloudflare verification. Domain ownership, route overlap, service existence, credentials, deployments, storage contents, external services and provider/GPU access are outside scope.
- Nothing reads branch Wrangler files, builds artifacts, migrates, creates or updates cloud resources, deploys, configures CI, accesses secrets, or offers an authentication mechanism. Before any publisher exists, it must independently construct and validate its final deployment inputs, bind only verified isolated resources, prevent time-of-check/time-of-use substitutions, and be separately security reviewed. Real model access needs the protected identity and budget gateway described in the issue; this pilot does not implement it.
