# Pollinations Flow extraction and delivery plan

## Current scope

- PR [#15503](https://github.com/pollinations/pollinations/pull/15503), branch `codex/connect-review-workspace`, targets `main`. Keep it draft until the release configuration, required approvals and pre-merge checks are ready.
- Source: `operations/flow`. Historical source branch: `origin/codex/pollen-connect-ux` at `27e396e48b1`. Preserve accepted main simplifications; never restore historical product files wholesale.
- Integrated main: `b02de198e2`, through merge `b44c38e2f9`. Earlier evidence retains its original revision.
- Completed extractions: #14936, #14949, #14951, #15269–#15271 and #15273. #15060 was superseded by those UI extractions.
- Flow runs the real Enter, Gen, SDK, UI and shared code. Fixture providers, disposable databases and injected errors are explicit. Product bugs belong in separate PRs, not replacement product logic inside Flow.
- Everyone with a Pollinations account can enter Flow through one identity-only login. Each reviewer receives an isolated container. The simulated Admin app still enforces its product role checks; no production admin data enters the fixture environment.

The full historical extraction plan and session log remain available in Git at `b9a3546502:operations/flow/PR_SPLIT_PLAN.md`. This file keeps the active delivery plan and the evidence IDs referenced by `scenario-audit.csv`.

## Deployment

- Public entry: https://flow.pollinations.ai/flow. The technical Admin origin is https://admin.flow.pollinations.ai and shares the same reviewer login.
- Flow uses the existing `Deploy / Applications` workflow and `deploy.json`, exactly like other container applications: merge to `main`, then promote `main` to `production`. A merge to `main` alone does not deploy. There is no PR deployment job or new deployment token.
- The manifest uses the existing `myceli` credential and watches the product code Flow executes. Full Git history in the shared deployment checkout preserves the source revisions shown in Flow. The deploy command requires a clean production Actions checkout and verifies HTTPS and anonymous access boundaries after uploading.
- Reuse the existing Worker `pollinations-flow-preview`, its Durable Object namespace and `POLLINATIONS_AUTH_SESSION_SECRET`. Its internal name and public OAuth client ID remain stable; they do not determine the public URL. No secrets are copied, replaced or synchronized.
- `wrangler.json` owns the permanent domains, as for other deployed Workers. Before promotion, obtain scoped approval for their managed certificates and run `release-client.sql` once to add the permanent callback to the existing identity-only PKCE client. The old callback keeps the live preview usable until promotion. No production data bindings or reviewer identity tokens enter containers.
- Ten `standard-1` containers maximum, sleeping after ten minutes without activity. Every Pollinations account can sign in; capacity is bounded and accounts may occupy all ten slots. The container client handles capacity/startup responses; Flow preserves them. Returning 503 does not prevent deliberate saturation.
- `ci-flow.yml` tests the Linux image, captures and two-container isolation. CI and Wrangler use the root `.dockerignore` and explicit Dockerfile inputs; harmless sentinels verify exclusion of local credentials and unrelated applications.

## Runtime boundaries

- The container library owns startup and capacity/rate-limit responses; the gateway preserves them and accepts every authenticated account.
- Capture generation uses same-origin POST; document/image retrieval remains GET. GET and cross-origin requests cannot enqueue captures.
- Model estimates are provider-response fixtures using the shared endpoint/type. Product code fills its own cache; Flow no longer seeds a private cache key or TTL. GitHub search fixtures represent an empty search result independently of product query filters/dates. Unknown external-service requests return a diagnostic without query strings or headers.
- Flow inherits Enter's compiler rules and checks the product modules it imports. Keep only dependencies and assets used by the packaged service or its checks.
- Keep the scenario ledger and product backlog below. A scenario is not dead code merely because it records an unresolved product defect.

## Verification and release gates

- Before merging, verify the shared-auth and Flow suites, typecheck/build, formatting, Docker exclusions and the packaged Linux/browser/isolation proof against the proposed code.
- After production deployment, hosted checks must cover real-account callback/session, cold-start, signed-in Admin/reset recovery, an error/recovery capture and two signed-in reviewers. Verify trusted HTTPS, anonymous/forged-session denial and cross-origin write rejection on both permanent hosts. Fixture-auth checks do not replace real hosted sign-in.
- Record the tested head, deployed revision, CI links and outstanding approvals in the PR body. Keep scenario evidence in the ledger with its original revision; the plan describes requirements rather than current execution status.
- Use existing authorized access for authenticated checks. If required access is unavailable, ask for its secure location or configuration; do not waive required checks. Tests that issue new credentials stay opt-in and require separate scoped approval under AGENTS.md.
- After review, merge and production promotion, extract granular product fixes from the backlog with tests in the owning service. Never silently relabel older evidence as current-main results.

## Local use

From the repository root, run `npm ci`, then `npm run dev --workspace=pollinations-flow`. Open `http://localhost:4180/flow`; Worker transport uses 4181 and Admin uses 4182. Set `FLOW_PORT` to choose a different three-port range. The predev hook installs Chromium and startup builds source UI styles.

For built pages, run `npm run build --workspace=pollinations-flow` then `npm run start --workspace=pollinations-flow`. Public origins can be set with `FLOW_ENTER_ORIGIN` and `FLOW_ADMIN_ORIGIN`. Packaged builds carry `FLOW_REVISION`, `FLOW_MAIN_REVISION` and `FLOW_DIRTY`. `npm run reset --workspace=pollinations-flow` intentionally clears only that checkout's local fixture data; do not reset a user's current review merely to inspect it.

The ordinary local instance shares one fixture identity; the hosted gateway isolates reviewers by container. A process restart preserves container-local data; replacement starts a fresh disposable review. Preserve the existing local app/database while running tests in disposable environments.

### What the audit establishes

The active inventory has **312 scoped entries**, **273 distinct situation IDs**, and **16 flow sections**. The ledger retains **318 rows**: 312 active situations plus six deferred historical checkout-status cases absent from main. Eight code-agent, six wallet/billing, four Account settings, three Quests cases and the missing Admin cancellation state were added from current main. Repetition across entry paths is intentional; the identity is `(flow, section, situation)`. This inventory is not proof that every screen on today's main is covered.

The complete [scenario ledger](./scenario-audit.csv) retains every entry. Its evidence IDs refer to the findings below. Three App states remain observation-only; **302 situations are captured**: 25 App and 54 Device at `d3e84e005d`, plus 22 dashboard Keys/Apps, 55 Models/Agents, 42 Wallet/Billing, 38 Account/Quests and 16 Admin at `1b7e621066`, all on 26 September. The final batch adds 46 captures at `279edfad8f`: 16 dashboard main/news/catalog/activity, nine App/SDK, 15 standalone account-menu/editor/error, two key-reveal and four Device funding situations. The final four Device approval captures pass at `a9bb750a21`: manual entry in mobile/dark and linked entry in desktop/light. No active ledger row remains source-audit-only. Seven external references are verified as references, not provider captures; six checkout-status rows are deferred. The 42 wallet captures cover 20 dashboard situations at desktop/light and 22 standalone Top-up situations at mobile/dark. Captured output records what main renders, not proof that a product gap is fixed. App, Keys and Models captures use mobile/dark; Device covers manual entry in mobile/dark and linked entry in desktop/light; Apps, Agents and Quests use desktop/light; Account settings uses mobile/dark. Credential-revealing success cases remain separately gated. Admin signed-out captures use mobile/dark; its three signed-in cases use desktop/light and passed with scoped approval for disposable OAuth tokens/sessions.

| Disposition | Entries | Meaning |
| --- | ---: | --- |
| `adapt-to-main` | 240 | Keep the situation, adapt the harness to the current owner code, and verify its actual output. This is not a pass result. |
| `product-gap` | 65 | A source-confirmed behavior gap affects the recipe or its expected recovery. Keep it visible; do not fix it in Flow. Multiple recipes can represent one defect. |
| `external-reference` | 7 | GitHub/Stripe illustrations, not live provider UI or evidence of successful OAuth/payment. |
| `unshipped-feature` | 6 | Historical checkout-status situations depend on behavior absent from main. Retain as named deferred coverage. |

| Flow / section | Entries |
| --- | ---: |
| App / main | 38 |
| App / top-up | 40 |
| Device / code entry | 31 |
| Device / direct link | 31 |
| Account / main | 7 |
| Account / news | 2 |
| Account / catalog | 4 |
| Account / models | 25 |
| Account / keys | 12 |
| Account / apps | 12 |
| Account / agents | 30 |
| Account / top-up | 22 |
| Account / activity | 4 |
| Account / quests | 12 |
| Account / account settings | 26 |
| Admin / main | 16 |

### Flow adaptations — no product fork

| ID | Finding and decision | Evidence |
| --- | --- | --- |
| C01 | Missing imports are not all renamed APIs. `login-errors`, `device-request`, and `stripe-checkout-return` were never merged into main. Read the current implementation before removing an expectation or extracting a genuinely shared product helper. Do not copy historical helpers into Flow to satisfy imports. | Historical `review-cases.ts`, `review-device-admin.ts`, `screen-route.ts`, import failures; main `shared/auth/authorize-config.ts`, Enter `routes/error.tsx`, `components/auth/device.tsx`. Main already performs PKCE validation inline in `authorize.tsx:201`; a missing helper is not proof that validation is missing. |
| C02 | **Keys/Apps/Models/Agents reconciled:** shared routes and section anchors, current dialogs, controls, empty/loading states, pending/error actions and recovery. Observation follows visible dialogs and actual list returns. Eight code-agent situations cover creation, editing and sync without deploying code. All declared dashboard sections are reconciled; additional unlisted product states remain outside this claim. | `flow-dashboard.ts`, `flow-dashboard-driver.ts`, `runtime-frame.tsx`, `review-dashboard.ts`; main `/keys` and `/my-models` owners. Seventy-seven captures and 23 recovery checks at `1b7e621066`; key reveal adds two verified captures at `279edfad8f`; successful code deployment remains outside this batch. |
| C03 | **Implemented:** removed the historical filter and replacement-case lookup. Journey uses the exact selected recipe, including held requests, and explains that they remain held until another situation is chosen. The notice follows the explicitly applied setup, never an inferred transient loading state. All 60 historical held entries are retained; only the App cases listed below have runtime verification. | `review-inventory.ts:41`–`:64`. A displayed pending frame and a real Journey waiting on a request are different evidence. |
| C04 | **Wallet/Billing reconciled:** balance faults target `/api/customer/balance`; billing faults target `/api/stripe/billing`. Reads, retries, writes and checkout returns show current main. Auto top-up actions use the named switch, so they cannot toggle the desktop theme. | `review-dashboard.ts`, `flow-wallet-preview.ts`, `screen-route.ts`; 42 captures and 18 recovery/state checks at `1b7e621066`. |
| C05 | **Stripe reference copy corrected:** the illustration no longer claims the return page verifies credited Pollen. It explicitly describes an external reference. Seeded balances and ledger rows remain distinct from real webhook/payment verification. | `flow-provider.tsx`; main `routes/top-up.tsx`. No real checkout or charge is tested. |
| C06 | **Account/Quests reconciled:** current Composio/Discord read contracts, GitHub profile and paginated reported-issue queries, and empty analytics fixtures. The real checker returns `success: true` on the baseline fixture. Reward claims use real Enter/D1; no external connection succeeds. | `review-services.ts`, `review-dashboard.ts`; 38 captures and 30 recovery/state checks at `1b7e621066`. This covers the declared baseline, not every provider response or production data. |
| C07 | **Admin declared inventory reconciled:** current shared auth runs at its own root, `http://localhost:4182/`, while Enter remains at 4180. Removed callback Location rewriting; the real issuer supplies signed `/app/sign-in` URLs. A shared observer reports across the two hosts. Signed-in refresh failure retains the established user; failed sign-out can be retried and successful sign-out clears the browser session. | `live-admin.tsx`, `server.ts`, `screen-route.ts`, `admin-frame.ts`; all 16 declared captures, seven sign-in and three signed-in recovery checks, real failed/cancelled callbacks and the cross-host Journey/back-control test at `1b7e621066`. This is not exhaustive shared-auth coverage. |
| C08 | **Worker execution settings aligned:** each bundle reads its compatibility date and flags from its real Wrangler config; config edits trigger a local reload. No product resource bindings are imported. Further environment parity remains open: `ENVIRONMENT=test`, external fixtures and forced development frontend mode are deliberate differences that need explicit coverage. | `runtime.ts`, `dev.ts`; Enter and Gen `wrangler.toml`, checked at `1b7e621066`. The 10 safe Device checks, 22 Keys/Apps captures and six recovery checks passed using main's settings, including `global_fetch_strictly_public` and Gen's `unhandled_rejection_after_microtask_checkpoint`. This is harness parity, not a newly proven product bug. |

The current architecture already imports Enter's router, SDK/UI components, and real Enter/Gen Workers. Scenario declarations, fixtures, a driver that clicks real controls, and route observation are legitimate review-tool code. They are not automatically duplicate product implementations. Conversely, importing real pages alone does not prove a scenario was prepared or observed correctly.

### Product gaps — source evidence; runtime results recorded below

Paths below are under `enter.pollinations.ai/frontend/src/` unless otherwise stated. Line numbers refer to audited main `645599a6c6`, not the older working-tree HEAD. [Pinned main source](https://github.com/pollinations/pollinations/tree/645599a6c6b97a1d55cc8b11ebce5a9f63767c87) is the reference.

| ID | What remains on main | Owning code / required proof |
| --- | --- | --- |
| G01 | App lookup parses JSON without checking HTTP status. A service-error payload becomes an unverified-app message, losing the endpoint distinction. | `components/auth/authorize.tsx:46`, `:163`, `:250`. Reproduce both a missing app and an HTTP failure; preserve the real error at the product boundary. |
| G02 | Authorization errors expose a single Decline/Go back action; the historical retry and session-expiry recovery expectations are not implemented. Device approve also reads only a top-level `message`, losing shared nested error messages. | `components/auth/authorize.tsx:356`, `:488`. Verify retry/cancel and 401 behavior in actual App and Device flows before choosing a minimal repair. |
| G03 | Direct-link Device consent fetches info only when URL scopes are absent, then uses the returned scope without checking the device status. It does not reproduce the old used/expired/unavailable recovery design. | `components/auth/authorize.tsx:137`–`:159`. Check code entry and direct links with/without scopes against the same device row. Server approval validation remains separate; this is not a claim that invalid codes can gain access. |
| G04 | `/device` maps non-OK responses without `error_description` to “Code not recognized”, including service failures with a nested shared error. | `components/auth/device.tsx:39`. Distinguish invalid/expired code from unavailable verification. Hyphen/space normalization is also absent (`:93`); treat adding it as a separate UX decision, not proof of a security defect. |
| G05 | Device denial ignores both an unsuccessful HTTP status and a thrown request, then reports “Access declined”. There is no denying state to match the old held-request recipe. | `components/auth/authorize.tsx:424`. Inject a rejected deny, verify the device row remains pending, then test retry. |
| G06 | Device approval failures after key creation have no cleanup. App code handoff failure starts deletion without awaiting or checking the result. | `components/auth/authorize.tsx:316`, `:397`, `:418`. Test known rejected handoffs and failed cleanup separately. Do not blindly delete on an ambiguous lost response: first establish whether the server accepted the handoff. |
| G07 | Standalone key loading collapses request failure and missing key into the same ownership message with no load retry. | `routes/edit-key.tsx:88`–`:98`, `:157`. Separately reproduce missing key, 401 and service failure. Keep the shared editor; do not replace the page in Flow. |
| G08 | **Runtime confirmed at `1b7e621066`:** Discord/connected-app reads and actions replace endpoint messages; Discord errors render as ordinary text and identity lookup failure silently drops details. Connection reads have no retry; reload recovers. Initial profile loading leaves the content blank. Profile read failure has a working Try again; sign-out failure allows retry. | `routes/_dashboard.account.tsx`, `components/account/connected-apps.tsx`; injected HTTP faults and explicit provider fixtures. Pending actions disable their buttons; failed sign-out/deletion leave the session, key and balances unchanged. Deletion preserves Better Auth error text. Keep those working protections. |
| G09 | **Runtime confirmed at `1b7e621066`:** balance/billing failures use generic copy; a balance or billing-write 401 offers no sign-in recovery. Auto top-up drops nested `error.message`, while flat business errors remain supported. Initial dashboard balance loading leaves the page blank; billing loading leaves an empty main area. | `routes/top-up.tsx`, `routes/_dashboard.tsx`, `routes/_dashboard.pollen.tsx`, `components/pollen/auto-top-up-panel.tsx`; read recovery succeeds after removing the fault. Injected errors are not proof of endpoint-generated failures. Preserve working Try again behavior in any product fix. |

G01–G10 and G12–G15 are fourteen grouped findings, with differing levels of evidence. G11 remains retired as a duplicate of G03. The ledger records impacted recipes, including repeated entry paths; recipe counts are not bug counts. Do not delete or weaken an expectation merely to make the Flow suite green. Represent current output honestly and record the desired recovery as a known gap with evidence; add the owning regression before fixing product code.

**G10 — model-catalog visibility:** `components/models/use-model-categories.ts` initializes an empty catalog and resets it to empty on failure. The consent picker has no loading or error message for that resource. App captures reproduce both states on main; Flow labels this limitation outside the product frame. This batch changes no product behavior.

**G13 — duplicate auto top-up saves:** the Save button remains enabled while PATCH `/api/stripe/auto-top-up` is pending. Both dashboard and standalone Top-up allow a second click and a second request. The switch/slider already disable. Owning code: `components/pollen/auto-top-up-panel.tsx` (`canEnable` / `AutoTopUpSaveButton`). Proposed product fix: include the existing saving state in Save’s disabled condition. Tests hold both requests; balances and billing preferences remain unchanged. This is not evidence of duplicate charges.

**G14 — Quest read/claim recovery:** failed catalog/reward reads display generic status text without a retry control; reload recovers. Claim failure displays generic copy, but retrying the claim works. A rewards-only 401 switches to an anonymous preview despite the dashboard session remaining signed in; deciding whether that needs explicit expiry recovery is an open design question. Failed automatic checks intentionally leave cached rewards usable with no alert; preserve that best-effort behavior rather than treating it as an automatic defect. Owner: `components/quests/quest-overview.tsx`. Evidence: injected 503/500/401, held checks/claims, reload and successful retry at `1b7e621066`.

**G15 — stale wallet after claiming:** the real claim handler credits the reward exactly once and the Quest page updates, but the dashboard sidebar keeps the old Quest balance until reload. Both ordinary claim and failure→retry paths reproduce this at `1b7e621066`; a second POST returns `claimed: false` and does not increase the balance again. Owners: `components/quests/quest-overview.tsx` (`handleClaimReward`) and `routes/_dashboard.tsx` (balance loader). Proposed minimal fix: refresh the existing dashboard balance after a successful claim; do not add a second wallet state or optimistic credit. Regression must compare the rendered wallet and persisted balance.

### Improvement backlog and evidence rules

**G12 — repeatable pending deletion:** at `1b7e621066`, both Models and Agents close the confirmation before awaiting DELETE. The list has no deleting indicator and its Delete control remains enabled, so another confirmation can be opened while the first request is pending. Browser checks reproduce this with held `DELETE /api/account/my-models/*` and `DELETE /api/account/agents/*`; the two fixture records remain unchanged because neither request reaches its handler. Situations: `dashboard-model-delete--action=delete&result=waiting` and `dashboard-agent-delete--action=delete&result=waiting`. Owner: `community-endpoints.tsx` (`handleDelete`/`handleDeleteAgent`) and `community-endpoint-card.tsx`. Smallest proposed improvement: track the pending item and disable its Delete control until settlement. Verify one outstanding submission, success removal and failure recovery in a separate product change. This is a UX gap, not evidence of data loss. Unlist already disables its control while pending, and failed list reads recover through **Try again**; preserve those existing behaviors.

Use the findings in this file as the product backlog and `scenario-audit.csv` as the coverage ledger. Do not create another competing inventory. A scenario can reveal several issues, and several scenarios can reveal the same issue. The former G11 Device-status finding is consolidated into G03; approval cleanup belongs to G06 and lost approval error details to G02.

| Work to investigate | Evidence at the tested baseline | Next proof / owner |
| --- | --- | --- |
| G05: failed Device decline claims success | Browser plus database checks: pending record remains while UI says Access declined | Confirm on refreshed main; Enter denial handling and its regression |
| G06: key lifecycle after rejected handoff | Browser/database evidence at `a9bb750a21`: injected approval HTTP 500 leaves one created key; Decline changes device status to denied but leaves that key | Known rejection versus ambiguous response; Enter approval/handoff transaction and key ownership |
| G01/G02/G04: endpoint errors and recovery | App/Device captures show lost distinctions and available actions; injected approval failure and recovery are captured at `a9bb750a21` | Check real endpoint envelopes and injected transport faults separately; Enter routes/components |
| G03: Device entry-path inconsistencies | Direct used-code consent and held-lookup captures; server approval validation remains separate | Compare manual entry, direct link and supplied scopes; Enter Device/authorize |
| G07: key editor | Ten editor states captured at `279edfad8f`; real budget save/return/SDK refresh passes. Missing key and failed reads share the ownership message | Preserve shared editor and working save; distinguish read failures at the Enter owner |
| G08: Account settings | 26 captures and 20 recovery/state checks; missing read retries, generic errors, blank profile loading | Preserve working pending guards, profile retry and deletion error detail; Enter Account/connected-app owners |
| G14/G15: Quests | 12 captures and 10 recovery/state checks; real claims/idempotency pass, sidebar remains stale | Minimal balance refresh and read retry; assess rewards-only 401 separately |
| G09/G13: wallet and billing | 42 captures; 18 recovery/state checks, including repeated held Save requests | Preserve read retries, expose endpoint errors and add the minimal saving guard; Enter wallet/billing owners |
| G10: model catalog loading/failure visibility | App captures show empty catalog without a resource error | Confirm current catalog contract; Enter model picker |
| G12: pending model/agent deletion | Two real-browser checks can reopen confirmation during a held DELETE; records unchanged | Minimal pending-item guard and success/failure regression; Enter resource list/card |
| Key secret delivery, issue #15401 | Source evidence only | Successful create followed by failed list refresh; Enter keys route |
| Billing reservation log on non-billable App failures | Prior real App integration logged `API key budget reservation is missing`; no incorrect charge established | Reproduce after the newer shared-error/Gen-tracking changes; shared billing and Gen tracking |

For each verified issue, retain: main SHA, Flow situation/link, setup and actions, expected versus actual behavior, HTTP status and response shape, relevant redacted browser/server logs, persistent state when relevant, owning file, smallest proposed simplification, and regression evidence. Mark source-only hypotheses as such. Close an item only with a merged fix and a rerun against the new main.

Review routes for their actual entry/return destinations and ownership, errors for accurate messages and recovery, logs for accurate cause/severity and needless duplication, and code for duplicate logic or dead branches. “Clean errors” means correct behavior and useful diagnostics at the source, not suppressing failures in Flow. An injected HTTP response demonstrates the consumer's handling; it does not prove that an endpoint emits that response or logs correctly. External fixture 503s belong to the harness boundary unless product evidence establishes otherwise.

### Decisions and newly missing coverage

- **D01 — checkout status:** six historical pending/check-failed/credited cases remain in the ledger as `deferred-not-on-main` and are removed from the active situation controls. Main has no `/api/stripe/checkout-status/*` endpoint. Two current **Checkout returned** cases supply the real `stripe_success=true` return URL without simulating a payment or credit. Standalone Top-up shows pending-confirmation copy and the app return link; the dashboard shows its ordinary wallet and also ignores the canceled flag. Captures and recovery checks prove these current contracts. Credit confirmation remains a separate design/product item.
- **D02 — login recovery:** main has different error codes/copy and a dashboard recovery link; the historical login-context helper was never merged. Use main's emitted codes (including `staging_is_invite-only`), and separately assess whether losing the original App/Device destination warrants a product fix. Different copy is not by itself a bug.
- **D03 — SDK/funding presentation:** a pending/failed profile read displays **Connected user** without a retry/error; Quest-only wallets with paid models selected have no dedicated paid-model warning. Both are captured at `279edfad8f`. Assess these as separate product decisions; Flow must not manufacture the missing UI.
- Add regression coverage for [#15401](https://github.com/pollinations/pollinations/issues/15401): a successful key creation followed by a failed session refresh may prevent delivery of the one-time secret. Main still awaits `refreshKeys()` before returning the created key (`routes/_dashboard.keys.tsx:78`). The existing “Created · copy key” recipes do not inject this failure. This remains source evidence, not a reproduced browser result.
- Admin `auth_error=cancelled` is now included. Captures and recovery checks separately verify initial session failure and main's retention of an established user during a failed background refresh.
- Cover main's current key variants/access contexts, including publishable keys without app metadata and device-bound key editing; exercise both dashboard dialogs and standalone editors. Preserve managed code agents and current model/publisher controls rather than narrowing the product to the old fixtures.
- Legal pages (`/terms`, `/privacy`, `/refunds`) exist on main but have no dedicated historical situation entries. Verify navigation to the actual routes; either add them to Screens explicitly or record them as linked static pages outside the flow inventory.
- Recheck active overlap before product fixes: [#14453](https://github.com/pollinations/pollinations/pull/14453) is open and changes zero-balance consent plus Stripe return handling. Its file/body scope was inspected, not its implementation reviewed. It is not part of the audited main. #15401 is an open issue, not a completed fix.
