# Model change approval

## Model contract

Apply this gate only to a proposed tracked model mutation. Do not turn a
read-only status confirmation, an approval of an already-documented planning
decision, or a correction of an operational fact into a different mutation.
Treat a generic “confirm” as approval only for the exact contract just shown.

Do not edit any model until the user confirms its complete business and inference contract. Inspect the code and provider first; do not ask the user to discover values for you.

State any intentional capability or access change plainly. Show one complete row per model:

| Field | Required value |
|---|---|
| Canonical name | Public model ID after the change |
| Aliases | Every compatibility alias, or `none` |
| `priceMultiplier` | Exact multiplier after provider cost |
| `paidOnly` | Whether purchased pack balance is required |
| Pollinations GPU | `yes` only if Pollinations operates the production hardware |
| Registry provider | Configured primary provider |
| Primary route | Provider, deployment/host, and exact upstream model ID |
| Best fallback candidate | Provider, deployment/host, exact upstream model ID, and why it is the best viable alternative; or `none found` with the searched routes |
| Pollinations fallback | `use <candidate>` or `none`, with the reason for declining or lacking a viable candidate |

Ask:

> Please confirm: canonical name **X**, aliases **A/none**, price multiplier **M**, paid-only **yes/no**, Pollinations GPU **yes/no**, registry provider **P**, primary route **R**, best fallback candidate **C/none found**, and Pollinations fallback decision **use C/none**. Are all of these correct?

An answer approves only the values shown. If a value is unknown, inferred, conflicting, or route-dependent, label it `UNKNOWN`, explain the evidence, and wait for that exact decision. A batch approval is valid only when every row is complete.

## Public API changes

Model approval does not authorize adding, renaming, removing, or changing a public endpoint, method, transport, request or response schema, streaming behavior, or event protocol. Do not propose an API-surface change without a concrete user or developer problem it solves.

Before editing, present:

- the user/developer problem and the current public contract;
- the exact proposed routes, methods, transports, schemas, streaming behavior, and events;
- the compatibility reference, resolved using [API compatibility](implementation.md#api-compatibility);
- whether the change is additive, behavioral, deprecating, or breaking, and the affected clients;
- the migration, coexistence, and removal plan, or `none`.

State plainly: `This adds/changes the public API: ...` Then ask for explicit confirmation of that exact API change. If the problem, standard, or compatibility impact is unclear, do not edit.

## Secrets

Model approval never authorizes adding, rotating, synchronizing, deploying, revoking, or otherwise mutating a credential. Follow the exact approval wording, execution order, verification, and rollback rules in `AGENTS.md`. Do not duplicate or weaken that process here.
