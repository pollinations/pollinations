# Pollinations Flow extraction and delivery plan

## Current plan — 26 September 2026

**This section supersedes the historical plan below.** This development tool is now named **Pollinations Flow** and lives in `operations/flow`; **Pollinations Connect** remains the product login feature. The approved Git branch/workspace keep their existing names. The goal is to ship a usable, hosted review tool that faithfully runs current `main`, while building an evidence-backed backlog of improvements to the product. Flow must be useful before those improvements are implemented. The SDK, dashboard and Device reconciliation has runtime evidence. Clean-checkout startup, built-page serving without Vite and Linux container execution are verified. Public origins, hosted reviewer access/routing, source-version display and remote deployment remain open.

### Delivery decision

1. **Match main.** Use the real product routes, components, handlers, schemas and migrations from one recorded main commit. Preserve current behavior, including defects. Flow owns preparation, observation and evidence, never an alternative implementation of the product.
2. **Record improvements during reconciliation.** For each observed problem, capture reproduction steps, the actual route/request/response, relevant redacted logs and resulting state. Keep product defects separate from incorrect fixtures, injected faults and unavailable external services.
3. **Ship Flow as a hosted development environment.** Package the existing runtime, give independent review sessions isolated disposable data, verify the deployed journeys, then keep the deployment tied to tested main commits. The source remains in `operations/flow`.
4. **Improve the product through separate, granular PRs.** Fix the owning Enter/Gen/shared/SDK/UI/auth code with a regression test, merge it into main, and rebuild Flow from that main. Do not import historical UX-branch fixes into Flow just to make a situation look better.

The immediate work is to refresh the baseline, finish current-main scenario reconciliation, and prove the smallest hosted runtime. A product bug is an acceptable observed outcome; a misleading or broken review tool is not. The old instruction to fix product gaps before publishing Flow is superseded.

### Baseline and workspace

| Reference | Current value |
| --- | --- |
| Active workspace | `/private/tmp/pollinations-connect-review-workspace` |
| Active branch | `codex/connect-review-workspace` |
| Product baseline | `a9bb750a2113d2d790090200be0fc26bb3623cdd` — integrated through merge `1fec592dcf`; final capture/recovery evidence stays at `279edfad8f` because the newer commit only changes internal Polli/news jobs |
| Latest remote main observed | `a9bb750a2113d2d790090200be0fc26bb3623cdd` — integrated; no Flow/product runtime paths changed after the tested `279edfad8f` baseline |
| Runtime evidence baselines | App/Device captures: `d3e84e005d`; Keys/Apps/Models/Agents/Wallet/Account/Quests/Admin captures and 71 resource/wallet/settings recovery checks: `1b7e621066`. Ten non-credential Device checks and the Admin recovery/callback/Journey checks also pass at `1b7e621066`. |
| Audited main | `645599a6c6b97a1d55cc8b11ebce5a9f63767c87` |
| Historical Connect UX source | `origin/codex/pollen-connect-ux` at `27e396e48b1ee3b5dffda6e8f8fc999f1cfd0a8b` |
| Extraction PR | [#15503 — feat(flow): add product flow review workspace](https://github.com/pollinations/pollinations/pull/15503), draft, `codex/connect-review-workspace` → `main` |
| Current changes | Imported tool renamed to operations/flow; main reconciliation, root workspace registration, lockfile and scenario ledger grouped into focused commits. Product behavior fixes remain separate. |

Do not work in `/Users/comsom/Github/pollinations`: it is an unrelated, dirty `codex/account-connect` checkout. The historical `/private/tmp/pollinations-pollen-connect-ux` workspace is no longer present; use the preserved remote source ref. Do not restore its complete product files over main.

The six newly integrated main commits touch Gen tracking/media, `shared/error.ts`, the CLI and Observability. All 94 pre-existing changed paths were preserved byte-for-byte through the fast-forward. Recheck the error/logging findings on this baseline; existing results must keep their original commit rather than silently becoming evidence for the newer main.

The merged extractions are #14936 (SDK browser auth), #14949 (dialog tooltips), #14951 (account/menu/wallet UI), and #15269–#15271 plus #15273 (shared controls, model catalog, Enter auth/resource UI, account/dashboard content). #15060 was closed and superseded by those UI extractions; it is not the active PR. Their simplifications remain authoritative, including the removal of SDK startup key validation and `retryConnection`.

### Draft checkpoint and remaining gates

The user authorized committing and pushing the current extraction as a draft. Six focused commits were pushed and draft PR #15503 was opened; this plan also records that published location. Earlier progress entries saying local/uncommitted/unpushed describe those earlier batches. This checkpoint does not certify all situations or deploy Flow.

- SDK, dashboard and Device reconciliation is complete for the declared inventory. The four Device approval rows now have captures and two recovery checks after scoped approval. This is not proof of every possible product state.
- The approved SDK, key-editor and key-reveal batch is complete; its disposable databases/contexts were discarded. Do not reuse that fulfilled scope for another credential batch.
- Inherited tests now collect against main. Retired login-context/API-error imports and unshipped checkout-status expectations were removed. The Discord lookup test preserves Better Auth's actual null response instead of inventing a 502 envelope. Credential-issuing tests are opt-in.
- The four newer main commits are integrated (model retirement announcements, Azure GPT-6, infrastructure documentation and Gemini environment configuration). No production credentials were loaded or deployed.
- Clean-copy installation, build, startup, browser navigation, fonts and an error capture pass in both development and built-page mode. The Linux image now passes the browser checks and isolates data, faults, resets, restart and replacement across two containers. Externally configurable origins, hosted access/routing and visible source revisions remain open. No remote deployment is included yet.

Local startup from the repository root: `npm ci`, then `npm run dev --workspace=pollinations-flow`. The predev hook installs Chromium; startup generates the shared UI CSS and fonts. Open `http://localhost:4180/flow`; local Worker transport uses 4181 and Admin uses 4182. To run another checkout alongside it, set `FLOW_PORT=4280` for dev, build and reset; the three ports become 4280–4282. These remain loopback origins, not remote hosting configuration. `npm run reset --workspace=pollinations-flow` explicitly resets this tool's local fixture account/data; it is not needed merely to open an existing running review. To serve the generated pages without Vite, run `npm run build --workspace=pollinations-flow`, then `npm run start --workspace=pollinations-flow`, with the same `FLOW_PORT` for both. This still runs locally from the checkout and uses the same real Workers and capture service. Local databases, generated assets and dependencies are ignored by Git.

Checkpoint validation: Flow typecheck/build and 111 focused non-credential tests passed again. Biome passed with two existing non-null-assertion warnings in the inventory test; the build retains the large-chunk warning. The prior capture/recovery results below remain the evidence for each scenario and were not rerun wholesale for publication.

### Final SDK/dashboard pass — 26 September

The final pass is committed in focused SDK, dashboard/capture, runtime-test and evidence commits on the existing draft PR. Main is integrated through #15505; the local Flow server remains running.

- Use the SDK's built-in `sessionStorage`; the custom adapter flagged by CodeQL #274 is removed. Start over clears only this app's SDK namespace. CodeQL and all other remote checks passed on `f9d535917a`; later commits must receive their own CI result.
- Six SDK states now reflect main, including profile loading/error staying connected as **Connected user**. The Map no longer invents profile retry or startup key validation.
- A real browser check proves one key/one OAuth exchange, reload restoration, Permissions preserving query/hash, allowance save, visibility-change refresh and disconnect. All ten standalone key-editor states and both key-reveal screens are captured. Capture route verification now includes fragments, so `/keys#secrets` and `/keys#apps` are verified correctly.
- Sign-in uses the real `/sign-in` dialog. Error pages use main's **Sign in** heading. Generic/staging recovery reaches `/news` when signed out; suspension exposes the billing email. Map exits match.
- Catalog uses an explicit local Tinybird health fixture for a real registry model, with a separate **Health unavailable** situation. Catalog and Activity recover through their real **Try again** controls. News reads the real shared feed/parser.
- SDK: 92 tests/typecheck pass. UI: 88 tests/typecheck pass. Flow default suite: 246 passed, 136 opt-in tests skipped; typecheck/build pass with the existing large-chunk warning. Browser recovery: five dashboard checks plus the SDK lifecycle pass at `279edfad8f`. Captures and credential-gated checks are separate from the default suite.

### Device and clean-startup checkpoint — 26 September

- Scoped Device approval covered `FLOW_REVIEW_API_KEY` only in disposable PR #15503 test databases/browser contexts. All four approval/error captures and both recovery checks pass. The success check follows Gen polling to completion. Failed approval reproduces G02/G06: no retry control, Decline is available, and the minted key remains. The test databases and contexts were disposed; this scope is fulfilled.
- A clean archive of `fab76ebdbc`, with only the bootstrap fixes applied, passes `npm ci` and Flow typecheck/build. The first build exposed unresolved fonts because only CSS had been generated. Flow now calls the UI package's existing font build too; all four font files are emitted in the clean build.
- The clean copy starts on 4280–4282 using the single `FLOW_PORT` setting, while the existing review remains on 4180–4182. Browser checks open/cancel the real **Create secret key** dialog, verify loaded fonts, render Flow's Map and capture the real catalog error situation. Existing review conditions remain unchanged. No reusable credentials are created by this smoke check.
- The final default Flow suite passes **248 tests** (136 opt-in cases skipped). A new real-runtime test runs two isolated Miniflare databases concurrently, changes their wallet conditions independently, injects a failure into one, resets the other and verifies both outcomes. A fresh runtime after disposal returns 409 until initialized. This proves the existing runtime boundary, not hosted reviewer routing or container isolation.
- The built-page launcher reuses the same runtime/capture server and Hono static middleware. Clean-copy browser checks pass without Vite: real key dialog, loaded fonts, Flow Map and catalog error capture. The build also now includes its preview image. Routing checks verify real entry paths, MIME types, missing assets and source/path traversal denial.
- At this earlier checkpoint, the local Playwright image download stalled before runtime execution. The later Linux proof below supersedes that incomplete result. The built-page launcher remains loopback-only; it is not a public deployment.

### Linux packaging and session checkpoint — 26 September

- **Passed at `5533567fbe1b28830389ac3c26fa09dae3896662`:** [CI / Flow container run 36256617887](https://github.com/pollinations/pollinations/actions/runs/36256617887) builds the full image on Linux amd64, then passes **248 default tests** (136 opt-in cases skipped). The image uses the pinned official Playwright 1.57.0 base, a repository-root allowlist and no local credentials, dependencies or databases.
- Real-browser proof passes against built assets: Create secret key opens and cancels without issuing a key, fonts load, Map renders, the selected catalog error opens through the Journey tab, **Try again** recovers after fault removal, and the capture service returns the error image. Two containers independently pass those checks. Wallet changes, injected faults and reset stay isolated; restarting one preserves its data, replacing it starts uninitialized, and neither changes the other review. All test containers are removed afterward.
- The two memory snapshots after browser/capture checks were **1.622 GiB** and **1.848 GiB**, each under a 3 GiB container limit. These are samples, not measured peaks or a hosted capacity guarantee. There is no shared volume or published port in the proof.
- Packaging exposed two actual runtime omissions: Gen's five imported Markdown guides were absent from the build context, and the built-page listener needed explicit IPv4 loopback to match the runtime transport. Both are fixed in Flow's packaging/launcher. Browser assertions now await completed UI transitions and use the agreed Screens → Journey preparation; no product behavior was changed to satisfy the proof.
- Separately, scoped `FLOW_REVIEW_SESSION` approval was fulfilled in a disposable local Linux arm64 container: Enter's real callback ran once against the explicit local GitHub fixture; its HttpOnly/Lax session cookie survived reload and was removed by sign-out. No values were logged. This used sanitized source and existing built browser assets with native Linux dependencies, not the full Dockerfile build. The container/browser context and temporary source copy were discarded. This is local callback evidence, not a hosted sign-in test or part of credential-free CI.
- Local full-image attempts hit Docker VM block-I/O errors and a read-only filesystem; the final full-image proof ran successfully on GitHub's Linux runner instead. The original local Flow remains available on 4180–4182 with its existing review state. No Cloudflare resources, secrets or production services were changed.

**Next:** configure public Enter/Admin origins and internal asset transport, add source-version/capture provenance, and implement the smallest authenticated reviewer-to-container routing using existing repository conventions. Then deploy a separate Cloudflare preview through GitHub Actions and verify its real URL, callback/cookies, capture/recovery and reviewer isolation. The PR remains draft until those hosting gates are met.

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

### Hosted runtime — recommendation and proof required

The current app is not a static site: `server.ts` runs Node, `runtime.ts` starts real Enter/Gen bundles in Miniflare with local databases, and `captures.ts` launches Chromium. `vite.live.config.ts` supplies development-only route/source serving, and runtime origins are currently fixed to localhost. Uploading its frontend build alone would not provide working Journey, preparation or captures.

**First candidate: a small Cloudflare Worker that routes a review session to a Container running the existing Node runtime.** The repository already uses Workers plus Containers in `operations/observability`. Cloudflare documents support for Linux runtimes/filesystems and addressing individual container instances; that makes this a reasonable candidate, not proof that Flow's Miniflare/Chromium bundle runs there. See [Containers overview](https://developers.cloudflare.com/containers/) and [container lifecycle](https://developers.cloudflare.com/containers/concepts/architecture/).

The Linux packaging proof above is complete. Finish the remaining hosting boundaries before deploying:

- Build product bundles, UI assets and Flow from one checkout; serve the real routes from built assets without a public Vite development server. Make review origins configurable at the host boundary. Show the product main SHA and Flow revision; mark local modifications explicitly. Capture evidence must record the same versions.
- Repeat the verified local journeys, callback/cookies, captures and restart through the deployed public origins. Audit environment-dependent behavior: `ENVIRONMENT=test`, local provider fixtures and the current forced development build mode are not production-environment parity and must not be hidden.
- Route independent reviewers to separate runtime containers. The two-container proof verifies the existing data/fault boundary, but the single server still shares state between its browser visitors. Reuse that tested boundary instead of adding product-level database partitioning. Verify hosted routing and resource limits under the real workload. A process restart preserves container-local data; container replacement starts a disposable review afresh.
- Keep real production accounts, wallets and provider actions outside scenario preparation. Reuse the existing access/auth conventions for access to the hosted tool; keep that identity separate from the simulated product identity inside a review. A public audience/domain and any required credential additions still need concrete configuration and scoped approval.
- Deliver the hosted review environment through GitHub Actions. Reuse the repository's deployment conventions; current Enter/Gen staging and production workflows do not deploy Flow. A main-backed review deployment uses isolated test data and must not change production Enter/Gen. Production deployments must retain the existing production-branch/workflow rule. Verify the URL, displayed SHA, direct routes, reset isolation and one actual error/recovery journey after deployment.

Cloudflare's [Container deployment guide](https://developers.cloudflare.com/containers/guides/deploy/) says version uploads do not deploy Containers or provide their preview URLs. A premerge test therefore needs a separate Worker/environment deployment, not an ordinary version preview. That preview must not reuse production Enter/Gen bindings or expose the unauthenticated local fixture controls.

Do not rewrite Enter/Gen to fit a static host or add a second scenario backend. Docker packaging and CI are added; no remote deployment or cloud infrastructure changes have been made.

### Decisions and newly missing coverage

- **D01 — checkout status:** six historical pending/check-failed/credited cases remain in the ledger as `deferred-not-on-main` and are removed from the active situation controls. Main has no `/api/stripe/checkout-status/*` endpoint. Two current **Checkout returned** cases supply the real `stripe_success=true` return URL without simulating a payment or credit. Standalone Top-up shows pending-confirmation copy and the app return link; the dashboard shows its ordinary wallet and also ignores the canceled flag. Captures and recovery checks prove these current contracts. Credit confirmation remains a separate design/product item.
- **D02 — login recovery:** main has different error codes/copy and a dashboard recovery link; the historical login-context helper was never merged. Use main's emitted codes (including `staging_is_invite-only`), and separately assess whether losing the original App/Device destination warrants a product fix. Different copy is not by itself a bug.
- **D03 — SDK/funding presentation:** a pending/failed profile read displays **Connected user** without a retry/error; Quest-only wallets with paid models selected have no dedicated paid-model warning. Both are captured at `279edfad8f`. Assess these as separate product decisions; Flow must not manufacture the missing UI.
- Add regression coverage for [#15401](https://github.com/pollinations/pollinations/issues/15401): a successful key creation followed by a failed session refresh may prevent delivery of the one-time secret. Main still awaits `refreshKeys()` before returning the created key (`routes/_dashboard.keys.tsx:78`). The existing “Created · copy key” recipes do not inject this failure. This remains source evidence, not a reproduced browser result.
- Admin `auth_error=cancelled` is now included. Captures and recovery checks separately verify initial session failure and main's retention of an established user during a failed background refresh.
- Cover main's current key variants/access contexts, including publishable keys without app metadata and device-bound key editing; exercise both dashboard dialogs and standalone editors. Preserve managed code agents and current model/publisher controls rather than narrowing the product to the old fixtures.
- Legal pages (`/terms`, `/privacy`, `/refunds`) exist on main but have no dedicated historical situation entries. Verify navigation to the actual routes; either add them to Screens explicitly or record them as linked static pages outside the flow inventory.
- Recheck active overlap before product fixes: [#14453](https://github.com/pollinations/pollinations/pull/14453) is open and changes zero-balance consent plus Stripe return handling. Its file/body scope was inspected, not its implementation reviewed. It is not part of the audited main. #15401 is an open issue, not a completed fix.

### Revised execution order and acceptance gates

1. **Refresh the approved extraction branch.** Preserve all imported and renamed Flow work, then integrate current main. Record the new SHA and recheck affected tests/findings. Keep the already-minimized root lockfile diff; verify absolute workspace, branch and baseline before changes.
2. **Finish main parity and record the backlog alongside it.** Recheck the App/Device evidence, complete the remaining SDK cases, then dashboard keys/apps/models/agents, wallet/account/quests and admin. Compare the inventory with current real routes so new main functionality is not omitted. Keep dashboard organization intact. Every group's gate is accurate preparation, request path, rendered output, available recovery, logs/state and mapping across views. Do not implement product fixes in this step.
3. **Complete shared preparation and observation.** Screens/Map/Journey/captures use the same situation identities; Journey executes exactly the selected situation. Preserve held requests, visible fault provenance, right-side controls and centered titles. Repair C01–C08 in the harness against current owners, without reintroducing unmerged product helpers.
4. **Prove and package the hosted runtime.** Follow the bounded proof above. Verify built assets, configurable origins, captures, isolated concurrent reviews and displayed source revision. Do not add a platform abstraction, permanent per-tester account database or remote production bindings merely to host the tool.
5. **Review, merge and deploy Flow.** Account for every historical row as verified, observed product gap, external reference or explicitly deferred; add current-main omissions. Complete the relevant suites and deployed smoke checks. A known product gap is not a Flow failure; silently replaced scenarios or broken imports are. Keep any genuine product behavior fixes out of the Flow extraction PR. Public availability, domain/access configuration and required credentials must be settled before deployment.
6. **Follow main and improve it through granular product PRs.** Address the evidence-backed backlog in priority order, with a regression test in the owner. After each main update, rebuild and verify Flow against that exact commit and show the deployed version. Never label old evidence as a fresh result or hide a newly broken case to keep the deployment green.

**1:1 boundary:** product rendering, validation, permissions, authentication, billing and error semantics come from current Enter/Gen/shared/SDK/UI/auth code. Flow owns only the review shell, explicit fixture preparation, transport fault injection, external-service simulation, observation and evidence. An HTTP fault injected by Flow must be labeled as injected; a deterministic identity is not a production login; a reference page is not the provider's UI. No fallback implementations, duplicated forms or review-only product error copy.

**Verification so far:** historical inventory expansion succeeded (295 unique scoped entries). Prior checks on the older `de1d40780d` extraction passed 56 tests in five files; eleven suites failed during import, and typecheck failed. Those checks do not validate the current main or complete flows. No credential-issuing runtime/capture tests were run in this audit, and no application code, credentials, PR or deployment was changed by this audit. New reusable credentials in this workspace require separate scoped approval; earlier approvals for other PR environments do not cover it.

### Implementation progress — 26 September 2026

- Fast-forwarded the approved workspace to fetched main `d3e84e005d`, preserving all imported work. No PR is open and nothing has been pushed.
- Reduced the root lockfile diff to 84 insertions / 1 deletion: workspace registration and five required entries, without unrelated version changes or reordering.
- Flow typecheck and Vite build pass. The dev server responds on `http://localhost:4180/flow` with the real Enter and Gen Workers on loopback.
- Updated missing source imports to review-only scenario specifications and current shared auth exports. These specifications are independent assertions/labels, never product error rendering. The toolbar's three absent icons now belong to Flow. The admin example's separate-root hosting problem remains C07; using the current auth API does not resolve that by itself.
- Moved Enter's unchanged highlights constants/type/parser into `components/news-faq/highlights.ts` so the capture server consumes the same parser without loading React/SVG browser modules. This is the only product-source refactor in this batch; no flow or error behavior changed.
- Updated the consent assertions for the current shared permission form. The legacy fixture catalog and several older tests still need reconciliation; the full Flow suite is not certified.
- Five non-credential suites passed: inventory, local provider, request faults, external-service fixtures and Vite proxy — **83 tests**. The proxy check logged a Vite HMR-port collision while the dev server was running; its assertions passed.
- Isolated the existing real App PKCE/SDK/Gen integration into `test/app-authorization.test.ts`, preserving its assertions. With the user's scoped `CONNECT_REVIEW_API_KEY` approval, `CONNECT_APP_AUTHORIZATION_TEST=1 npm run test --workspace=pollinations-flow -- test/app-authorization.test.ts` passed: **1 test**, making **84 passing tests across these six focused files**. It verified real key creation, single-use PKCE exchange, cookie/bearer separation, the SDK account/balance reads through Gen, allowance/empty-wallet responses and revoked/signed-out behavior. Its database was disposable and the runtime was closed afterward.
- The approved browser App journey passed on the running local instance: Pollinations Connect button → real Enter signed-out page → explicitly simulated local GitHub provider → real Enter callback/consent → real key creation/PKCE return → real SDK account menu. Consent showed budget **5 Pollen**, expiry **7 days**, and the requested scopes. The returned menu showed **Pollinations Agent**, **App budget: 5 Pollen**, **Permissions**, **Buy Pollen**, and **Disconnect**. The four observed states are recorded in the scenario ledger. No automatic Screens/Map captures were run.
- `Start over` preserved the initial signed-in conditions as designed; the browser account was explicitly set to signed-out before checking login. The local server and the connected browser journey are left running for review; their disposable database remains local. No production credentials or profiles were used.
- **Runtime finding to investigate:** both zero-balance/budget-exhausted text responses satisfied their assertions but logged `API key budget reservation is missing` during tracking. `shared/billing/track-helpers.ts` checks the reservation before its non-billable early return; this run does not prove a charge or a provider call. Preserve this evidence for the owning Gen/shared billing investigation, without suppressing it in Flow. Tinybird/product-event requests also logged the harness's explicit external-service 503s; external ingestion is not verified by this test.
- **Next after the App batch below:** reconcile the remaining SDK account/callback cases, then Device, dashboard and admin coverage. C01–C07 and G01–G09 remain open unless specifically resolved above. Full-suite/capture verification and an extraction PR are still pending; the App happy path alone is not merge-readiness evidence.

### App error/pending batch — 26 September 2026

- Removed silent Journey substitutions and exposed the held situations in its controls. Holds never release writes automatically. Their notice comes from the explicitly applied recipe, so an ordinary loading frame is not falsely labeled as injected.
- Journey and captures now share the initial sign-in/decline control steps. A simulated GitHub handoff remains explicit in Journey; captures continue that external-provider fixture separately. Updated App expectations to main's actual headings, disabled controls, messages, `/error` callback destination and `Go back` action.
- Observation distinguishes real App sign-in, submitting and error transitions. The example reads callback failure from SDK auth state without adding an error banner to the product menu. A 401 on key creation belongs under authorization errors, matching main's layout. UI product code is unchanged in this batch.
- Browser-verified: held App lookup remains pending with approval disabled; the model-catalog fault shows main's empty catalog; injected key-creation HTTP 500 is identified as “Allow access errors” and displays the unchanged endpoint message.
- The focused capture tests issue no keys: consent submissions are held or failed at `/api/api-keys`, before Enter handles them. **25 App captures passed** (two focused tests, including all malformed-link cases and declined access), plus **85 unit tests** for recipes, routes and inventory. Typecheck/build passed; Biome has only the three pre-existing non-null-assertion warnings in the inventory test. Screenshots came from real Enter/SDK components; their 25 ledger rows are marked `captured-current-main-2026-09-26`. Broader credential-issuing captures remain gated and were not run.
- G01, G02 and G10 are faithfully reproduced, not fixed. The capture service also logs explicit external-service 503s for model health/product events. Full inventory verification, Device/admin adaptation and publishing the PR remain outstanding. Everything remains local on `codex/connect-review-workspace`.

### Flow rename and Device reconciliation — 26 September 2026

- Development tool: `operations/flow`, package `pollinations-flow`, route `http://localhost:4180/flow`. HTML entries, imports, CSS/data attributes, fixture names, internal `/__flow/*` routes, test flags and root workspace registration use Flow. No compatibility alias or second implementation remains. Git workspace/branch identifiers and historical approvals below remain unchanged for traceability; the product's Pollinations Connect feature keeps its name.
- Device recipes use current Enter headings, form controls and messages. Direct consent carries the real device record's client ID to `/api/app-lookup`; it no longer silently skips attribution. The observer reads current DOM, grouping indistinguishable errors rather than inventing the failing endpoint. Screens/Map/Journey share those recipes.
- Removed invented retry, reauthentication and code-entry links from the Device map. Main’s error screen offers **Decline**. A failed decline renders **Access declined** while the device remains pending; the map and review note expose that outcome. Manual-code errors retain their real editable input and Continue action.
- **G03 — direct Device validation (previously duplicated as G11):** main ignores `status` from `/api/device/info` on direct authorization links and leaves Allow access enabled during that lookup. A used code can therefore display consent. Approval endpoints still enforce status; this is not proof of unauthorized approval. The scenarios label the limitation outside the real product frame.
- **54 non-credential Device captures passed**, covering 27 situations in both entry paths (mobile/dark and desktop/light). **150 focused unit tests**, **10 Device browser/record checks**, and Flow typecheck/build passed. The browser checks confirm decline does not remove an expired record and a failed decline leaves a pending record while showing success. A missing-device assertion was corrected to compare the absent record directly. Approval success/failure checks that create keys remain gated. Initial cold Vite dependency optimization interrupted one capture; the stable rerun passed. External model-health and product-event 503s are deliberate harness boundaries, not passing external-service checks.
- Scoped approval is pending for `FLOW_REVIEW_API_KEY` in disposable local Flow extraction databases: two Device integration approvals and four captures (success and approval failure across both entry paths). These checks are gated by `FLOW_DEVICE_APPROVAL_ERROR_TEST=1` and have not run. Do not reuse the consumed App-batch `CONNECT_REVIEW_API_KEY` approval. No product-source fixes, commits, pushes or PR creation in this batch.

### Main-backed delivery update — 26 September 2026

- Saved the revised goal: accurate main parity and a hosted Flow development environment, with product improvements recorded alongside reconciliation and delivered separately afterward. Existing historical deployment exclusions below are superseded by this current plan.
- Fast-forwarded `codex/connect-review-workspace` from `d3e84e005d` to fetched main `1b7e621066`; content hashes confirmed all 94 local changed paths were preserved. No stash, branch switch, product patch, commit or push was needed.
- Typecheck/build passed. All **150 distinct focused tests** passed across the initial run and a permitted loopback-socket rerun. The initial sandboxed run had 147 passes and three socket-related failures; rerunning the three affected files passed all 32 tests. A Vite HMR-port collision warning remains when the live server is on. This is not a full-suite or fresh browser/capture certification.
- Consolidated duplicate G11 into G03 and corrected approval references to G02/G06 in the ledger, review note and test comment. All 295 ledger rows remain. No assertions or product behavior changed. Biome and diff checks passed.
- Added C08 for runtime configuration parity and a bounded Worker/Container hosting proof. Hosting is a recommendation pending that proof. No hosted environment, domain, credential, database or deployment was created; the existing local app remains on.
- **Next:** reconcile execution flags/environment assumptions against main, then continue dashboard keys/apps/models/agents and remaining wallet/account/admin cases while preserving the existing App/Device evidence. Prove the packaged runtime before committing to the deployment setup. Credential-issuing Device checks remain separately gated.

### Runtime settings and dashboard Keys/Apps — 26 September 2026

- Flow reads each product Worker's compatibility settings directly from its Wrangler config. Local database/binding isolation is retained. `ENVIRONMENT=test`, development frontend routing and named external fixtures remain visible limitations; this does not establish full production-environment parity.
- Keys and Apps use main's `/keys#api-keys` and `/keys#app-keys` sections. Real dialogs determine the observed resource, including when the user opens the other section's dialog. The dashboard renders **Edit secret key**; standalone app access has its own existing heading. No product heading or behavior was changed to make the two look identical.
- **22 captures passed:** populated/empty lists and create/edit/delete ready, pending and failed situations. Keys were captured at mobile/dark and Apps at desktop/light. All submission writes were held or failed before the handler; no reusable credentials were created. The two **Created · copy key** cases remain unverified and gated.
- **Six browser recovery checks passed:** failed create/save/delete for both resources preserve the two fixture records, leave Cancel enabled, close the dialog on cancellation and map back to the correct section. They also verify that Screens/Map/Journey identify the same real dialog. An initial test selector matched hidden dialogs; it was corrected to check the accessible dialog, and the full rerun passed.
- **10 safe Device browser/record checks** passed again with the current execution flags (two credential cases skipped). **114 focused unit tests** passed across dashboard preview, live routes, review cases and inventory. Explicit external model-health and product-event 503s remain harness boundaries, not verified external services.
- Typecheck/build and diff checks passed. Biome reports only the three existing inventory-test non-null-assertion warnings. Restarted Flow on ports 4180/4181 with the new execution settings and preserved its local database. The live Journey reproduced the declared save HTTP 500 with an explicit injection notice; Cancel returned to the actual Secrets list. Left the clean Keys situation running for review.
- **Next:** Models/Agents recipes, then wallet/account/quests/admin and remaining SDK cases. Current main closes model/agent delete and visibility confirmations before their request completes; inspect and represent that real list-level pending/error behavior rather than retaining historical dialog expectations. Continue the hosted-runtime proof separately; no product fixes, remote infrastructure, PR or deployment in this batch.

### Models and Agents reconciliation — 26 September 2026

- Preserved main's shared `/my-models` page and real resource forms. Flow now uses **Create model**, **Create agent**, **Save changes**, **Unlist** and **Relist**, including the distinct **Edit endpoint agent** form. No product component, endpoint or copy was changed in this batch.
- Model and agent loads use their respective real endpoints. Main intentionally renders no collection loading content; Flow describes that outside the frame. Empty sections use the current create controls. Publishing, queued changes, prompt-agent configuration and endpoint probe success/failure all render through current product code.
- Delete/unlist pending and failed situations capture the list after the real confirmation closes. Flow's observer follows that list, and the Map labels the transition **Confirm / Cancel**, without claiming completion. Failed writes preserve records; unlist has a pending guard, while deletion does not (G12).
- Added eight code-agent situations: create form/pending/error, edit form/pending/error, and sync pending/error. The fixture is schema-validated local metadata with no deployed code. Each write is held or failed before Enter reaches GitHub or deployment services. These captures do not verify code deployment or runtime execution.
- **55 captures passed** (25 Models at mobile/dark, 30 Agents at desktop/light), including all 47 historical situations and eight new ones. **17 real-browser recovery checks passed** across the initial 15 passes and a focused rerun of two load-retry checks after correcting the test label from Retry to main's **Try again**. Checks cover records, available controls, cancellation/reopening, and Screens/Map/Journey observation.
- **121 focused tests**, typecheck and build passed. An initial fixture test was blocked by the sandbox's socket restriction; rerunning with local sockets permitted passed. Three existing inventory-test lint warnings and the build's large-chunk warning remain. Named external model-health/product-event 503s are deliberate fixture boundaries. No reusable credentials were issued, no code deployed, and no product fixes, commits, pushes or PR creation were included.
- Restarted the local Flow server with code-agent preparation loaded. The live Journey reproduced the code sync HTTP 500 and displayed both the injection source and the metadata-only boundary. Three code-agent recovery checks passed again after the final dialog assertion cleanup. Left the code-agent editor open for review.
- **Next:** wallet and standalone funding/billing reconciliation, then account/quests/admin and the remaining SDK cases. Keep the hosted-runtime proof on the plan. Success cases requiring credentials remain separately gated; the deployment and full main parity are not complete.

### Wallet and billing reconciliation — 26 September 2026

- Reconciled both real pages against main `1b7e621066`: wallet balances, signed-out standalone Top-up, load/401 errors, billing setup/status, held/failed writes, and checkout returns. No product source was changed in this batch.
- **42 captures passed:** 20 dashboard at desktop/light and 22 standalone Top-up at mobile/dark. **18 real-browser recovery/state checks passed**, covering Try again, available action retries, return links, unchanged balances/preferences, and Screens/Map/Journey mapping. All billing writes were held or failed before their handler; no real payment or reusable credential was created.
- Replaced historical checkout-status expectations with main’s actual return contract. Six historical cases stay in the ledger as deferred. Two staging error IDs were aligned with the existing current-main inventory; their verification remains source-only.
- Corrected the driver’s generic switch target and allowed each control to paint before dispatching a click, avoiding input during React draft initialization. Fixed obsolete heading/loading selectors and made the recovery checks await declared preparation completion. These are harness corrections, not product workarounds or changes to main.
- **119 focused tests**, typecheck and build passed. Two existing inventory-test non-null warnings and the build’s chunk-size warning remain. Product-event 503 logs are explicit local external-service boundaries. Earlier failed checks were traced to obsolete selectors, the desktop theme switch and premature preparation; the final targeted checks above passed.
- Updated C04/C05 and runtime evidence for G09; added G13 for duplicate pending saves. Current main’s blank dashboard loading states and generic error copy remain visible.
- **Next:** reconcile Account settings and Quests, then Admin and remaining SDK cases. Continue the packaged/hosted runtime proof; full main parity and remote deployment remain unfinished. Everything remains local, uncommitted and unpushed.

### Account settings and Quests reconciliation — 26 September 2026

- Reconciled current main `1b7e621066` without changing product code. Flow uses current headings, controls, blank loading states, generic errors and available recovery. Added seven missing situations: profile load/failure, sign-out pending/failure, catalog load/failure and rewards-only 401.
- **38 captures passed:** 26 Account settings at mobile/dark and 12 Quests at desktop/light. **30 recovery/state checks passed:** 20 Account settings and 10 Quests, including route observation and Screens/Map/Journey inventory mapping. All connection/sign-out/deletion writes were intercepted before handlers; no external credential was issued/revoked and no account was deleted.
- Fixed the external fixture's missing paginated GitHub reported-issue query and public profile read. The real Quest checker returns `success: true` with these fixtures. A successful local claim and failure→retry each credit exactly 5 fixture Pollen; repeating the claim returns `claimed: false` with no second credit. These are disposable local ledger checks, not production rewards.
- G08 is now runtime-backed. Added G14 for Quest read/claim recovery and G15 for the stale sidebar wallet after a successful claim. Captured/seeded “Reward claimed” remains distinct from the separately exercised real claim handler. Failed background checks remain usable by design; do not label that policy as a proven defect.
- Capture rejection checks also reject mismatched provider states and unrelated failures. Initial test failures came from old selectors, the actual blank profile-loading state, hidden confirmation alerts, and counting analytics writes as account actions; these harness expectations were corrected against source and browser evidence. Product-event ingest 503 logs remain an explicit local external-service boundary.
- **127 focused tests passed; typecheck, build, Biome on all six changed code/test files and diff checks passed.** The existing large-chunk build warning remains. The coverage ledger now has 310 active situations, 236 captured, four observed and 70 source-only, plus six deferred checkout-status rows.
- **Next:** Admin, remaining SDK cases and the remaining dashboard main/news/catalog/activity situations, followed by the packaged-runtime proof. Full main parity and hosted deployment remain unfinished. All work stays local, uncommitted and unpushed.

### Admin reconciliation — 26 September 2026

- Uses the current `@pollinations/auth` React/server exports and shared UI unchanged. Enter owns 4180; the Admin example owns `/` at 4182. Auth callbacks and sign-out retain the package’s real root navigation. Removed Flow’s response-Location rewrite and obsolete admin persona/fault query flags.
- Identity situations now start at the real `/auth/login` and issuer instead of constructing an unsigned `/app/sign-in` URL. The issuer’s query signature is required by main’s public-client lookup. Review actions stay in their origin’s storage and resume through normal navigation.
- **13 mobile/dark captures passed**: signed out; cancellation/admin-denied/expired/unavailable URL states; identity ready/pending/failure; suspended/staging/provider failures; session pending/failure. These rendered callback-error URLs are not proof of every upstream cause. Added the previously missing cancellation case.
- **Eight recovery checks passed**, covering seven signed-out/session-error controls and the real callback handler with missing state, cancellation and an invalid code. Cancellation correctly yields `auth_error=cancelled`; the earlier suspicion was disproved. No product bug is filed for it. A separate real Journey test passes Admin → Enter → Previous step, verifies captions and reports no page errors. Existing Account Discord read-error recovery also passes with the changed transport.
- Browser checks and captures now share one disposable HTTP transport. Playwright request interception alone missed redirects in a chain and could hit the running local database. The shared transport keeps native redirects in the selected disposable Workers. No product response is manufactured.
- Corrected the Map to show the real **Go to dashboard** exit; removed the nonexistent Admin profile-picture dashboard link. Preserved main’s account menu and generic sign-out error. No product UI/auth code was changed in this batch.
- **Approved batch completed:** the user approved `FLOW_REVIEW_ADMIN_OAUTH_TOKENS` and `FLOW_REVIEW_ADMIN_SESSIONS` in disposable local Flow extraction databases/browser contexts. All **three signed-in desktop/light captures and three recovery checks passed** behind `FLOW_ADMIN_OAUTH_TEST=1`, using real Enter OAuth. The checks cover the account menu, retained user during a failed background session refresh, retry after sign-out failure and successful sign-out returning to `/` with `/auth/session` reporting HTTP 401 and `user: null`. Browser contexts and runtimes were disposed afterward. The first recovery run reached sign-out but its final APIRequestContext read hit the forward proxy's unsupported CONNECT transport; moving that read to browser fetch preserved the assertion and the rerun passed. Future credential batches require their own scope; the independent Device gate remains pending.
- Coverage: **311 active situations; 252 captured, four observed, 55 source-only**, plus six deferred checkout-status rows. All 16 declared Admin situations now have capture evidence; this does not establish coverage of every shared-auth state. All captures retain their original main baseline. The hosted-runtime proof, remaining SDK cases and dashboard main/news/catalog/activity reconciliation remain outstanding.
- Everything remains local, uncommitted and unpushed on `codex/connect-review-workspace`. The Flow server remains running. Focused validation: 111 tests, the Account recovery regression, typecheck, build and Biome passed. The existing large-chunk build warning remains. The inherited `test/runtime.test.ts` still imports unmerged `api-error.ts`, so its old suite cannot collect; the Admin fault/restore check now lives with the reconciled Admin tests. Full-suite parity is still pending.

## Historical extraction plan — retained for traceability

**Date:** 17 September 2026

**Status:** Planning only. No extraction branches, PRs, deployments, or credential operations are authorized by this document.

**Purpose:** Deliver the useful changes from the Connect branch as small, coherent new PRs, preserve current main's functionality, and publish the Connect review app in one final PR.

Read the [PR structure](#6-proposed-pr-structure), [dependency order](#7-dependency-order-and-execution-waves), [mixed-file rules](#8-mixed-files-and-atomic-changes), and [execution checklist](#12-extraction-procedure) first. The [appendix](#appendix-a--complete-source-file-ownership-inventory) accounts for every changed source file.

## 1. Decision in one paragraph

Keep the existing branch as the reference for the work. Start each approved extraction from the then-current main, carrying over specific behaviors and their tests rather than replacing files with older branch versions. Deliver SDK recovery, shared UI, shared form controls, individual flow fixes, and independent editorial changes in separate PRs. Keep App and Device authorization together because they share the same implementation. Preserve main's wallet pages, Stripe return contracts, managed code agents, and publisher icons. Connect lands last, using the resulting product code directly. Its fixtures, captures, and navigation must demonstrate the declared situations; importing real components alone does not establish correctness.

## 2. Frozen references and confidence

**Revision:** Main sync and merged-extraction status updated 17 September 2026. P01–P12 are planning IDs, not GitHub PR numbers.

| Reference | Value |
| --- | --- |
| Repository workspace | /private/tmp/pollinations-pollen-connect-ux |
| Source branch | codex/pollen-connect-ux |
| Source HEAD / completed main merge | 72246bc39d2b0396375d4b94071fd46759c562b2 |
| Preserved pre-merge branch parent | d7dac212ad6808e248608d0597e59c2f2b381599 |
| Merged main parent / live extraction baseline | 7922d12d343830f2381921ddb68810bab47fe62d |
| Included main work | #14936 SDK auth; #14949 dialog tooltips; #14951 account/menu/wallet presentation; all intervening main changes |
| Remaining code delta against merged main | 223 files; +28,003 / −3,856 text lines |
| Connect files / other files | 84 / 139 |
| Commits relative to merged main | 112 source-only; 0 main-only |
| Snapshot scope | Live source at 72246bc39d against current main 7922d12d34; Appendix A remains the dated historical ownership inventory |


The first plan described the pre-merge branch against merge base 8236a3df6179a066511a5c262bcd2457029ec552 (234 files). That is historical context, not the extraction inventory. The merge preserves the entire previous branch as its first parent and reconciles main’s newer features with the accepted branch UI.

The appendix records the historical **44a3f92e5b → e312c98941** ownership inventory. It is no longer the live delta after the later main integrations and merged extractions. The current extraction comparison is **7922d12d34 → 72246bc39d**. Main is an ancestor. Refresh the relevant hunk ledger for each extraction; never apply the historical delta or replace whole files from it.

GitHub inspection covered metadata and file lists for 188 open PRs, including all 293 files in #14472. Relevant bodies and selected patches informed section 9. This is an overlap assessment, not a full correctness audit of 188 PRs. Recheck status, head, mergeability and CI for each extraction. File overlap alone is neither duplication nor a blocker.

### Post-merge evidence and limits

Historical merge evidence at e312c98941:

- SDK: 92 tests; UI: 71 tests; focused Enter model/authorization/device helpers: 118 tests; Connect non-credential suite: 238 tests. All 519 passed.
- SDK, UI and Connect typechecks and builds passed. Connect’s typecheck/build also includes the Enter frontend source.
- Connect socket tests passed with local socket permission after the sandbox initially blocked Vite and Miniflare listeners.
- Biome passed with three existing non-null-assertion warnings in review-inventory.test.ts. Diff checks passed. The commit hook reported that lefthook was unavailable; checks above were run explicitly.
- Credential-issuing runtime/login/capture suites and a fresh visual review were not run in this merge batch. Earlier captures are historical evidence only.
- Startup validation, its retry API, and its Connect situation were removed. OAuth callback waiting/errors and real account-request recovery remain. The Map now routes saved-key restoration directly to the connected account panel.
- Shared dialogs use main’s new header/footer compositions while retaining the branch’s copy, actions and layout. Model filter tokens include main’s new Status filter.

At 72246bc39d, the source branch is pushed and contains current main. The latest sync passed 104 focused Enter tests, 229 focused Gen tests, the complete Connect suite with 255 passed and 18 credential-gated skips, and the relevant Enter and Connect typechecks. PRs #14936, #14949 and #14951 are merged into main.

## 3. Non-negotiable boundaries

1. Product behavior belongs in Enter, Gen, shared code, SDK, or UI. Connect consumes it.
2. Connect may own review selection, route identification, deterministic setup, local transport fault injection, capture orchestration, and evidence. It must not duplicate authorization, balances, permissions, validation, or error rendering.
3. Deterministic fixture data and declared review metadata are legitimate. “Emergent UI” does not mean zero constants or zero testing code; it means the rendered product state is produced by the real implementation.
4. Screens, Map, and Journey share stable page/situation identities and preparation. Shared UI may have several legitimate entry paths and recovery destinations.
5. **Preserve Journey-tab execution:** opening a selected situation in Journey prepares and runs that situation. Repair preparation if necessary; do not change this into a passive tab switch.
6. Situation changes deliberately prepare the chosen state. Observation and background refresh must not reset it or replace it with a family's first case.
7. Preserve the approved viewer behavior: centered screen/title/arrows, right-side contextual controls, scrolling inside previews, and explicit screen navigation. Flag any visible or flow change before implementing it.
8. Preserve the real endpoint message where supplied. If the product's error is wrong, fix its source in the owning product PR. Never improve a screenshot by substituting prettier review-only copy.
9. Missing coverage remains a named gap until proved or explicitly excluded for a reason. Do not remove real product states merely to obtain a clean inventory.
10. Product fixes must be testable without shipping Connect. Connect adds cross-product verification.
11. No temporary compatibility layer, general runtime abstraction, or duplicated implementation solely to make a PR split easier.
12. No public hosting, per-tester account system, production database, DNS, or deployment infrastructure is included in this extraction. A merged Connect app is not automatically a publicly hosted service.

## 4. Disposition rules for every change

Each meaningful change receives one disposition and one owning PR. A file can contain several changes with different owners.

| Disposition | Meaning | Required evidence |
| --- | --- | --- |
| Already on main | Main already provides the needed behavior | Main implementation and relevant test; omit duplicate branch change |
| Keep | Improvement remains applicable | Concrete problem, resulting behavior, owning PR, regression check |
| Adapt | Improvement is useful but conflicts with current main | Main behavior to preserve, minimal adapted change, tests for both |
| Exclude | Unused, superseded, or no longer useful | Specific reason and proof no accepted behavior is lost |
| Deferred | Useful but outside this delivery or awaiting a decision | Named remaining work, impact on Connect, decision needed |

Record changes at behavior/hunk level in the extraction ledger:

| Source file / symbol / source commit | Disposition | Owning PR | Main feature preserved | Verification | Resulting commit / PR |
| --- | --- | --- | --- | --- | --- |
| Fill during extraction | Keep / Adapt / Already / Exclude / Deferred | P01–P12 | Concrete behavior | Command or manual check and result | Pending |

The appendix assigns an initial owner to all 236 changed files. It is a complete **file inventory**, not a claim that every hunk has been resolved. Mixed files require the ownership decisions in section 8 before staging.

## 5. Completed reconciliation and remaining extraction work

| Area | Current state | Remaining action |
| --- | --- | --- |
| Wallet/key editor | #14740’s standalone pages are baseline | P08 contains only residual confirmation, ownership, return and recovery changes |
| Stripe returns | Main’s return=top-up, redirect and portal handling coexist with branch credit confirmation | Preserve the reconciled result; include session_id parsing and owner-scoped checkout-status tests in P08 |
| Managed code agents | #14622, Sync from GitHub and publisher icons are preserved | P09/P11 contain only remaining recovery or organization changes |
| Account identity | Main AccountIdentity and accepted branch account/menu/wallet presentation were reconciled | Preserve the integrated result in P03; do not replace whole files from either historical version |
| Shared website UI | #14855 is included | P02 contains residual controls/accessibility improvements; #14917 is now included |
| Connect runtime | Uses the real code-agent SDK builder, UI Markdown source entry, updated Activity assertions and new quest fixture | Preserve these source-integration adaptations in P12 |
| AuthModalLoading | Required-title change affects callers | Include every affected caller atomically in P03 |
| ConfirmationDialog | Depends on auth action/error presentation | Keep in P03 with those dependencies; no abstraction just to change PR order |
| AppUserMenu callback | Only Connect consumes onStateChange | Check existing derived state before replacing callback with observation; preserve rendering |
| DashboardAuthRuntime | Connect uses it for the mounted sign-out landing | Prove sign-out/cancel/return behavior before removing the override |
| Unused exports/options | Consumer checks still required | Exclude only proven unused additions; retain necessary behavior such as portals |
| Product tests in Connect | Some product fixes have only Connect evidence | Move focused regression checks to the owning package; retain distinct integration tests |
| Cleanup verification | Final credential-dependent cleanup was not rerun during the merge | Complete product checks and the separately scoped disposable E2E batch |
| CI gating | Source adds Connect to the aggregate required gate | Review runtime, path filters and required-check behavior explicitly |

The merge resolved integration conflicts. Each extraction still needs behavior-level ownership and its own verification; a clean merge and smoke checks do not prove every proposed PR is independently complete.

## 6. Proposed PR structure

**Starting structure: eleven core workstreams and one optional workstream.** P01–P12 are stable planning IDs, not existing GitHub PR numbers or a promise to create twelve PRs. Omit a group if main already supplies all its changes; split or combine only for an independently reviewable outcome. All resulting PRs are new and ultimately target main. Existing PRs in section 9 are coordination inputs, not branches to absorb wholesale.

| ID | Proposed title | Group | Prerequisites | Visible or behavioral change |
| --- | --- | --- | --- | --- |
| P01 — complete | fix(sdk): handle browser auth failures — #14936 | SDK | Merged into main | Browser storage/navigation fixes and SDK CI; no startup validation or retry API |
| P02 — first slice complete | refactor(ui): align shared controls and accessibility — #14949 | UI | Current main; remaining options travel with real consumers | Dialog tooltip behavior merged; broader control changes stay independently justified |
| P03 — P03a complete, P03b next | refactor(ui): share account and authentication presentation | UI | P01 and accepted P02 slices | #14951 merged account/menu/wallet status; sign-in, error, result and confirmation presentation remain |
| P04 | refactor(enter): share consent and key permission controls | Flows / shared forms | P03 | Permissions, model selection, budget and expiry controls |
| P05 | fix(enter): preserve App and Device authorization recovery | Flows | P04 | Validation, sign-in, errors, cancellation and key cleanup |
| P06 | fix(auth): preserve dashboard sign-in and sign-out recovery | Flows | P03 | Admin/internal dashboard auth and return behavior |
| P07 | refactor(enter): separate keys and connected app management | Flows / dashboard | P04, P05's error helper | Resource pages, create/edit/delete/revoke behavior |
| P08 | fix(billing): confirm wallet credit and preserve account returns | Flows / billing | P03, P05's error helper, P07's editor changes | Wallet, return paths, owner key ID and edit-key action |
| P09 | fix(enter): preserve dashboard and account settings errors | Flows / dashboard | P05's error helper, P07; shared wallet recovery from P08 if used | Load failures, session expiry and settings actions |
| P10 | fix: clarify connection terminology and service errors | Copy | Behavior prerequisites only for the documentation describing them | Independent terminology and default 503 wording |
| P11 | refactor(enter): separate model and agent management | Optional UI / flows | P04, P09; current main features preserved | Resource navigation and remaining management layout |
| P12 | feat(connect): add the local product review workspace | Connect | Accepted product PRs merged; optional work resolved | Connect app, fixtures, views, capture verification and CI |

P10 may ship earlier if limited to independent wording. Documentation for behavior that has not landed waits for its owning PR.

Proposed branch names, to be approved before creation:

| PR | Proposed branch |
| --- | --- |
| P01 | codex/sdk-connection-recovery |
| P02 | codex/ui-controls-accessibility |
| P03a — complete | codex/ui-auth-account-presentation |
| P03b — next | codex/ui-auth-result-presentation |
| P04 | codex/enter-shared-permission-controls |
| P05 | codex/enter-authorization-recovery |
| P06 | codex/dashboard-auth-recovery |
| P07 | codex/enter-keys-apps-management |
| P08 | codex/wallet-credit-confirmation |
| P09 | codex/dashboard-settings-errors |
| P10 | codex/connect-terminology-copy |
| P11 | codex/model-agent-management |
| P12 | codex/connect-review-workspace |

These branches were not created by this planning work; verify availability before creation. Each gets its own dedicated worktree and PR.


### P01 — Complete: browser auth failures

[PR #14936](https://github.com/pollinations/pollinations/pull/14936) merged on 15 September 2026 at `39268722d32fdfcd53e5ea57f77a7b230c0c3590`. The final scope keeps browser storage/navigation error handling, retains an exchanged key in memory if persistence fails, restores saved keys without an Enter startup request, and adds SDK tests to CI. GitHub checks completed without failures. The final PR reports 92 passing SDK tests; that final-head count was not rerun locally during the 16 September planning review.

**Accepted simplification:** startup key validation and `retryConnection` were removed. They are not deferred requirements. The Connect branch now uses the merged SDK unchanged in those six React files. AppUserMenu and the Connect inventory have been reconciled; do not restore the removed API or its scenario in later extraction. SDK-only recovery changes are complete; general terminology remains P10 and `KeyInfo.id` stays with its endpoint/consumer in P08.

The source inventory below is refreshed against the recorded main parent. Read current main before extracting any remaining SDK/UI hunks; do not copy source files wholesale over the merged implementation.

### P02 — Shared controls and accessibility

**Outcome:** Reusable controls gain the accepted focus, layout, and accessibility changes, in independently justified slices.

**Completed slice — tooltip behavior inside dialogs:** [PR #14949](https://github.com/pollinations/pollinations/pull/14949) merged at `3c5d8bf787` on 16 September. The real Enter API-key dialog reproduced the backdrop covering budget/expiry tooltips. The patch portals to the nearest dialog, retaining body portals outside dialogs. Browser checks covered both themes and mobile/desktop sizes; 48 UI tests, typecheck and build passed. Connect integrated this main commit in `69d6354c56`; the merge changed only the Tooltip comment, and UI typecheck/Biome passed. Its code delta is now 230 files, +27,693 / −4,061 lines against that main commit (excluding this plan). The larger inventory above remains the explicitly dated earlier snapshot.

Keep button sizing, surface styling and other accepted visual changes for a separate slice. New Dialog, Dropdown, CopyButton and EditableCombobox options should travel with their first real consumer when they are required; do not bulk-publish options solely because the source branch contains them. The source accessibility test file mixes auth and controls tests: extract only tests relevant to each PR. Tests for the rejected startup retry API have been removed.

- Own Button, IconButton, Chip, Dialog, Dropdown, Tooltip, CopyButton, EditableCombobox, InfoTip, required icons, and tokens.
- #14855 and #14917 are already baseline. Reuse DialogHeader/DialogFooter where applicable; preserve the approved branch layout and accessibility improvements rather than introducing a parallel composition.
- Preserve keyboard focus, disabled/loading behavior, dropdown portals, dialog initial focus, and accessible names.
- Exclude LockOpenIcon and unused configurable options if the complete consumer search still confirms they are unnecessary.
- Keep ConfirmationDialog in P03 because its dependencies are in auth presentation.
- Export only APIs used by a product consumer or by a declared later PR; land tightly coupled caller changes atomically.

**Checks:** UI typecheck/build and relevant controls-accessibility tests; visual comparison of dialogs/dropdowns and affected app buttons in both themes.

**Suggested commits:** focus/interaction fixes; accepted visual/token changes and matching exports.

### P03 — Account, authentication, and wallet presentation

**First delivery (P03a) — complete:** [PR #14951](https://github.com/pollinations/pollinations/pull/14951) merged at `e121960cf9`. It delivers the shared account avatar/dashboard link, menu trigger, wallet status and existing AppUserMenu/Enter identity consumers. Destinations remain caller-owned, menus without a dashboard link remain valid, and the rejected public state callback was not restored.

**Next delivery (P03b):** shared sign-in, error, authorization-result and confirmation presentation, with only the minimum product callsites required to prove those components. Keep consent form controls in P04, App/Device lifecycle and cleanup in P05, dashboard authentication behavior in P06, wallet confirmation/returns in P08, and Connect in P12. Carry control changes only when a P03b consumer requires them.

**Outcome:** Product consumers share one set of account, permission, sign-in, error, result, and funding components.

- AppUserMenu is reconciled with the merged P01 SDK. Preserve that simplification and the handling for real errors from existing actions.
- Extract the reconciled AccountIdentity/AccountMenu result, preserving main’s composition and the accepted avatar link, menu trigger and shared wallet rows. Keep real image/name inputs; do not replace them with a Connect illustration.
- Carry AuthModal/layout/action primitives, sign-in buttons, auth error content, DeviceAuthorizationResult, AccountPollen, status/funding presentation, and ConfirmationDialog.
- Include all main callsites affected by required AuthModalLoading titles. This PR must build before the later authorization refactor exists.
- Share checked, non-editable required permission rows rather than keeping an Admin-specific variant.
- Preserve account refresh behavior: existing identity stays visible while refresh runs.
- Prefer a DOM state attribute over AppUserMenu.onStateChange, using the state already computed by the component. Connect observes it in P12.
- Do not move wallet calculations or authorization decisions into the presentation package.
- Leave the new owner-ID-dependent edit-key wiring for P08. Do not add a placeholder ID or temporary fallback.
- Exclude PollenModelNotice and its export/test if it still has no product consumer.
- Move a new component with its first real consumer if exporting it here would create an otherwise unused public API.

**Checks:** UI suites, both themes and sizes, Enter frontend build, and AppUserMenu consumers in playground, websim, and maintained React apps. Verify identity, allowance, zero allowance, loading, errors, required permissions, and sign-out actions.

**Suggested commits:** account/identity composition; auth/result/confirmation presentation plus callers; wallet/status presentation plus consumers.

### P04 — Shared consent and key controls

**Outcome:** Consent, new-key, and edit-key forms use the same real permission and model-selection controls.

- Carry AccountPermissionsInput, ModelPermissionsInput, ConsentModelPicker, model filter tokens, budget/expiry inputs, and the shared permission state.
- Carry catalog-derived model categories, selected counts, paid-only metadata, and catalog loading/error/retry state.
- Split models.tsx: extracting ModelFilterTokens belongs here; unrelated search behavior and page restructuring belong later.
- Split shared authorize-config: expiry/budget helpers used by these controls belong here; authorization-request validation belongs in P05.
- Update all callers when useModelCategories changes return shape.
- Remove permission-ui only when all consumers have migrated.
- Keep permission semantics unchanged except explicitly documented fixes. Empty model selection, all models, and a restricted list remain distinct.
- #14695 changes developer earnings markup; #13706/#13707/#13708 propose different paid-model permission policies. These are separate product choices, not missing form-refactor requirements.

**Checks:** focused authorize-config and model-categories tests; compare consent/create/edit values, submitted permissions, expiry boundaries, paid-only identification, unknown/mixed models, and catalog failure/retry. Build Enter frontend.

**Suggested commits:** shared permission inputs; catalog/model picker integration; validation and atomic caller migration.

### P05 — App and Device authorization

**Outcome:** Both entry paths use the real shared authorization implementation and recover without leaving invisible errors or undelivered keys.

- Keep the propless Authorize implementation and its App/Device branches in one PR.
- Own request validation, app lookup, sign-in context, consent submission, pending state, retry, cancellation, and completion.
- Preserve browser OAuth code/PKCE and supported direct-redirect semantics. Preserve Device code-entry and direct-link entry paths.
- Carry api-error with its focused product regression tests; later dashboard/billing PRs consume it.
- Keep endpoint-specific bodies and HTTP status available to recovery logic. Do not convert all errors into a generic banner.
- Carry source login-error definitions and their consumers together; preserve suspended/invite-only/session-expired distinctions.
- Verify app identity lookup distinguishes missing app/invalid redirect from unavailable provider data.
- Freeze submitted permission values and prevent duplicate actions during submission.
- Include undelivered-key cleanup after failed code creation or failed device delivery. Prove cleanup targets only the new, undelivered key.
- Prove successful delivery retains its key. Cleanup failure must remain visible and must not be represented as successful deletion.
- Compare developer earnings markup (#14695), account restrictions (#14681/#13579), embedded consent top-up (#14453), and remaining OAuth lifecycle work (#12320) by behavior. Preserve agreed semantics; do not import separate policies or close/repurpose those PRs.

**Checks:** focused Enter request/validation tests; product tests for HTTP and network failure after key creation; delete-failure handling; retry/cancel destinations; successful key retention. Then separately authorized local E2E checks through Gen → Enter and callback/device results.

**Suggested commits:** source errors/request validation; shared sign-in and lookup recovery; submission/cancel lifecycle; undelivered-key cleanup and regression coverage.

**Merge blocker:** critical cleanup behavior cannot ship supported only by a skipped Connect test.

### P06 — Admin and internal dashboard authentication

**Outcome:** Sign-in, cancellation, session refresh, access denial, and sign-out behave consistently for actual dashboard consumers.

- Own packages/auth React/server changes and Economics/Observability caller updates.
- Preserve cancellation returning to the requested page in an explicitly signed-out state.
- Preserve protection against immediate re-login after cancel, failure, or explicit sign-out.
- Preserve current-user display during recoverable session refresh failure.
- Verify non-admin denial, invalid state, token exchange failure, session loading, and sign-out failure.
- Remove DashboardAuthRuntime only after a concrete destination design works for the root-mounted consumers and Connect's mounted example. A sign-out landing change is a product behavior change and must be flagged.
- Prefer fixing the actual destination contract or using the product's normal mount/route configuration over a general fetch/location/navigation adapter.
- Do not infer that one consumer makes an API invalid; assess the responsibility and minimum necessary interface.

**Checks:** packages/auth React/server tests; Economics and Observability builds; sign-in/cancel/sign-out/focus refresh at root and mounted paths. Session-issuing live checks require a separately scoped batch.

**Suggested commits:** callback/cancel recovery; session/sign-out behavior; consumer and presentation updates.

### P07 — Keys and Apps management

**Outcome:** API keys and connected apps have distinct resource pages while using shared create/edit/confirmation controls.

- Carry /apps, the Keys page changes, connected app listing, key listing, forms, delete/revoke confirmation, and relevant navigation.
- Keep only the /apps navigation hunk here; /agents belongs to P11 if accepted.
- Preserve current main's key capabilities and editor behavior.
- Make failed create/update/delete/revoke actions retain context and explain the real error.
- Preserve the metadata update order so a refresh cannot display stale key settings.
- Separate editor dialog changes here from standalone page mode and wallet-return integration in P08.
- Generate the route tree from this PR's actual routes.
- Compare #12530’s section-anchor navigation with the accepted separate resource pages before publication. Do not combine competing navigation designs by default.

**Checks:** independent empty and populated lists; metadata update then refresh; create/update errors; cancel confirmation; failed and successful delete/revoke; permission values. Credential-creating cases are scoped separately.

**Suggested commits:** resource routing/list separation; shared key form integration; action recovery and regression tests.

### P08 — Wallet confirmation and account returns

**Outcome:** Users return to the correct page, see credited funds only after confirmation, and can edit their own app allowance.

- #14740’s /top-up and /edit-key pages are baseline. Extract only remaining behavior from the reconciled source; do not re-add the pages.
- Preserve checkout's return=top-up contract and redirect parameter handling.
- Preserve billing-portal return-to-top-up handling and the four affected existing regression tests, adapting assertions only for an intentional documented change.
- Add the owner-scoped checkout-status check and credit-confirmation UI where absent.
- Confirm a seeded payment scenario changes the wallet balance and ledger consistently. A ledger row alone is not proof of the displayed balance.
- Carry /account/key's opaque ID, response schema, SDK KeyInfo.id, tests, and AppUserMenu edit-key link in this PR.
- The key ID is an identifier, not authorization. The editor must still enforce ownership.
- Reuse main's update helper and return validation wherever equivalent.
- Add wallet error propagation and 401 recovery without replacing the existing pages.
- Carry the page-mode editor shell only if still needed after comparison with main.
- Preserve the distinction between Paid Pollen, Quest Pollen, and an app's spending allowance.
- Keep auto top-up's disabled-while-saving fix with its action.
- Include top-up-search.ts session_id parsing with credit confirmation. Preserve website-v2 caller return requirements (#14472). #14731’s low-balance key_id links do not replace the SDK /account/key ID contract.

**Checks:** focused account-key and Stripe tests; default and top-up checkout/portal returns; valid/invalid return inputs; pending/credited/failed status; foreign-session ownership; repeated return; wallet 401/retry; owner-only key editing.

**Suggested commits:** owner key ID contract and consumer; payment credit confirmation; wallet/editor return and recovery fixes.

### P09 — Dashboard and Account settings recovery

**Outcome:** Real data-loading and settings errors remain visible, and session expiry takes users through coherent recovery.

- Own dashboard loader/error presentation and Account settings action errors.
- Preserve endpoint messages for Discord and other settings actions, with retry where the action is actually retryable.
- Distinguish empty data from load failure and signed-out/session-expired states.
- Extract model-list load/retry and mutation-error retention fixes here even if P11's broader reorganization is deferred.
- Keep those fixes on current main's code-agent and publisher-capable forms.
- Reuse api-error from P05 and any wallet recovery component actually introduced by P08.
- Do not include News parser extraction here: that extraction exists for Connect verification and belongs to P12.
- Keep Accounts/News/Quests and other unchanged paths working; no route fallback that hides a failed loader.

**Checks:** expected endpoint message, correct HTTP/session handling, retry outcome, retained form/list state, and healthy recovery. Check list contents and action results rather than only the page heading.

**Suggested commits:** dashboard load/session recovery; Account settings endpoint errors; minimal resource action recovery.

### P10 — Independent copy and documentation

**Outcome:** Naming and generic service messages accurately describe the product.

- Carry independent Pollen Connect/BYOP terminology across website copy, README, guide, and API documentation sources.
- Carry the default 503 change from an unsupported maintenance claim to temporary service unavailability, together with its real consumer assertion.
- This changes default source wording; it must not replace more specific endpoint messages.
- Keep new behavior's labels, examples, and tests with P01–P09 when they are required to understand that behavior.
- Auth error semantics such as suspension, invalid state, and session expiry stay with P05/P06.
- Keep legal identity and infrastructure names unchanged.
- Resolve existing public documentation links and anchors deliberately. Do not add a broad compatibility layer as part of terminology cleanup.
- Do not regenerate APIDOCS.md; update its source and let the established post-deployment process generate it.
- Keep the 503 correction and naming edits in separate commits. If maintainers want independent merge timing, split those commits into separate PRs rather than coupling them artificially.

**Checks:** docs route/schema/anchor tests, changed website copy rendering, and the focused upstream 503 assertion. Review the final text independently of Connect screenshots.

### P11 — Models and Agents reorganization, optional

**Outcome:** Apply only the accepted route and management-layout improvements without regressing current capabilities.

- Separate /agents from /my-models only if the current product decision still calls for it.
- Preserve managed code agents, prompt agents, their types and validation, Sync from GitHub, publisher icon URLs, and related helpers.
- Reapply useful form/search improvements onto main; avoid importing the large historical rewrite.
- Core load/retry/action-error fixes ship in P09 and are not deferred with this layout work.
- Generate route and navigation changes together.
- Flag the visible organization change before implementation.
- Compare #12530 navigation and #14751 hidden publication without bundling either feature into this layout change. Main’s code-agent capabilities remain baseline.

**Checks:** prompt-agent and code-agent creation/editing, sync, publishing, icon persistence, model filtering, failed mutation, and route navigation.

**Suggested commits:** minimal route/navigation separation; accepted search/form organization and its current-main regression checks.

**Deferral rule:** If deferred, Connect must represent the real routes that ship on main. Update its catalog/recipes to that code; never keep a copied /agents screen or silently declare coverage for a route that is absent.

### P12 — Connect review workspace

**Outcome:** A local review app renders and verifies the actual merged product implementations across Screens, Map, and Journey.

- Own operations/flow, root workspace/scripts/lockfile changes, and Connect CI.
- Include the News parser extraction with the product's minimal consumer update; it is shared product logic used by the review, not a second parser.
- Keep example-app and external-provider references explicitly identified as such.
- Retain the merge’s adapters for Enter’s code-agent SDK builder and the UI Markdown entry, Activity usage/earnings assertions and agent-usage quest fixture. They align Connect with the new product baseline.
- Keep one preparation sequence for captures and Journey, including deterministic reset and scenario data.
- Scope resets and condition writes to the review runtime/database.
- Keep injected HTTP failures and held requests distinct from errors actually emitted by an endpoint.
- Verify stable route/situation selection in the URL, actual iframe route, state observation, buttons, and Map recovery edges.
- Preserve the existing viewer and accepted Journey-tab execution semantics.
- Avoid product runtime flags, copied UI, test-only auth bypasses in Gen/Enter, or production endpoints that serve fixtures.
- Exclude confirmed unused illustrations, public options, compatibility paths, or generated captures. Verify consumers before deletion.
- Regenerate the root lockfile from current manifests and inspect unrelated churn. Do not copy the old branch lockfile over main.
- Prove source changes invalidate the relevant build/capture and that theme/size changes cannot display an unlabelled stale result.
- Product regression tests belong to their product PRs. Keep distinct Gen → Enter, prepared-state, mapping, and capture checks here.
- Keep this plan as planning material; decide deliberately whether it belongs in the submitted app documentation.

**Checks:** typecheck/build; safe unit/inventory tests; actual navigation and capture smoke across every declared section; explicit credential-dependent coverage separately; clean-checkout startup using local SDK/UI/Worker sources.

**Suggested commits:** local Worker/product-source startup; shared preparation and fault evidence; screen catalog and the three viewers; captures and cross-product assertions; workspace scripts, CI and documentation. Keep each commit focused and the final PR runnable from a clean checkout.

**CI decision:** The source currently adds Connect to the aggregate required gate. Measure real runtime and reliability, inspect path filtering, and review gate behavior before landing. Neither automatically making it optional nor automatically accepting the new requirement is part of this plan.

**Delivery boundary:** This PR adds the local review app. Hosting it at connect.pollinations.ai or connect.myceli.ai, using real tester login, and designing isolated hosted databases require a separate plan and request.

## 7. Dependency order and execution waves

| Wave | Work | Exit condition |
| --- | --- | --- |
| 0 | Main reconciliation complete at e312c98941; refresh PR overlap checks and next-PR hunk ownership | No unexplained overlap or unassigned behavior in the first extraction |
| 1 | P01 merged; next P02 controls; independent P10 wording if ready | Each builds/tests against its own declared base |
| 2 | P03 shared presentation and atomic callers | Product consumers work without Connect |
| 3 | P04 shared forms; P06 dashboard auth | Contracts and affected consumers verified |
| 4 | P05 App/Device authorization | Critical error/cancel/cleanup behavior proved |
| 5 | P07 Keys/Apps; P08 wallet; P09 dashboard/settings, in dependency order | Main features preserved and per-flow regressions covered |
| 6 | P11 optional organization; finish dependent P10 documentation | Every deferred item accounted for in Connect's intended catalog |
| 7 | P12 Connect on merged product code | Full evidence matrix and source-integrity checks complete |

Numbers are identifiers, not a strict sequence. P06 does not need to wait for unrelated wallet work. Shared files alone do not establish a dependency.

Prefer main-targeted PRs after prerequisites merge. Use a stack only if explicitly chosen for review, with each PR based on its immediate prerequisite and the incremental diff clearly identified. Never publish a later PR that silently includes all earlier changes.

## 8. Mixed files and atomic changes

| Hotspot | Required split |
| --- | --- |
| packages/sdk/src/types.ts | KeyInfo.id belongs to P08, with endpoint, schema, consumers and tests |
| packages/sdk/README.md | Recovery behavior P01; independent naming P10 |
| packages/ui/src/index.ts and module index files | Each export travels with its component and valid consumer; unused exports excluded |
| AccountIdentity.tsx / AccountMenu.tsx | P03: preserve reconciled identity/menu composition, real account data and shared wallet rows |
| AppUserMenu.tsx / AppUserMenuView.tsx | State/presentation P03; new owner-ID editor wiring P08; Connect observes real state in P12 |
| AuthModal.tsx / DashboardSignIn.tsx | Shared presentation P03; any new dashboard-specific behavior P06 |
| AuthModalLoading callers on main | Required-title adaptation P03, even in otherwise later-owned files |
| ConfirmationDialog.tsx | P03 with the auth action/error dependency; form callers in their owning PR |
| shared/auth/authorize-config.ts | Form budget/expiry helpers P04; request validation P05; preview-only message export assessed for P12 |
| authorize.tsx | Minimal shared-control adoption P04; complete authorization lifecycle P05 |
| create-api-key.ts | Form integration P04/P07 as needed; real error-helper adoption P05; no duplicate parser |
| edit-api-key-dialog.tsx | Shared controls P04; management behavior P07; page/return integration P08 |
| models.tsx | Token extraction P04; minimal load/retry P09; search/organization P11 |
| community-endpoints components | Core error retention P09; optional layout/route restructuring P11 |
| dashboard-shell.tsx / dashboard-theme.ts | /apps P07; /agents P11; do not land a nav item before its route |
| routeTree.gen.ts | Regenerate in every PR that changes routes; never stage the full source version early |
| account.ts | ID response/schema P08; documentation-only scope clarification travels with the relevant contract or P10 |
| top-up-search.ts | P08: session_id parsing with checkout credit confirmation; retain main return fields |
| stripe.ts and Stripe tests | P08 on current main; preserve checkout and portal contracts |
| shared/error.ts and fetchUpstream.test.ts | Default 503 wording P10, together |
| News highlights.ts and news-banner.tsx | P12, with one product implementation |
| Connect test files importing product helpers | Product regression cases move to P04/P05/P09 as appropriate; integration cases remain P12 |
| Root package.json, package-lock.json, CI workflow | SDK test step P01; Connect-specific integration P12; regenerate lockfiles instead of copying old dependency state |
| UI README and BYOP guide | API/behavior documentation with owner; independent terminology P10; review-environment explanation P12 if needed |

For a signature change, search every current-main consumer and migrate it in the same PR. Do not leave compatibility shims or broken interim consumers to satisfy this table.

## 9. Main and open-PR coordination

### 9.1 Already merged: subtract from new PR scope

| Existing GitHub PR | Verified status | Consequence |
| --- | --- | --- |
| [#14855 — shared website UI](https://github.com/pollinations/pollinations/pull/14855) | Included; 500787426b is the source’s main parent | P02/P03 preserve controls, menus and Markdown entry; deliver only remaining improvements |
| [#14740 — standalone wallet/key editor](https://github.com/pollinations/pollinations/pull/14740) | Merged and included | P08 adds residual confirmation/ownership/recovery, not the already-shipped pages |
| [#14622 — managed code agents](https://github.com/pollinations/pollinations/pull/14622) | Merged and included | Preserve capabilities in P09/P11 and runtime integration in P12 |
| [#14917 — DialogHeader/DialogFooter](https://github.com/pollinations/pollinations/pull/14917) | Included in e312c98941 | Already baseline; reuse this composition |

#14472 remains open even though its UI extraction #14855 is merged.

### 9.2 Open PRs requiring concrete comparison

Statuses were checked on 15 September 2026. Shared-file counts compare changed paths against our 236-file delta, not overlapping hunks. These PRs are coordination inputs, not automatic dependencies.

| Existing GitHub PR | Affected work | Required decision or preservation |
| --- | --- | --- |
| [#12320 — connected app OAuth lifecycle](https://github.com/pollinations/pollinations/pull/12320), draft; 14 shared files | P01/P05/P07 | PKCE already exists. Compare distinct delegated-key revocation, disconnect versus local logout and grouped/bulk connected-app management. Neither import the historical implementation wholesale nor declare all its scope superseded |
| [#12530 — dashboard section navigation](https://github.com/pollinations/pollinations/pull/12530); 5 shared files | P07/P11 | Contextual anchors within combined pages differ from our accepted separate resource pages. Explain overlap; do not add both navigation systems |
| [#14453 — Stripe top-up inside consent](https://github.com/pollinations/pollinations/pull/14453); 4 shared files | P05/P08 | Embedded pack selector/direct checkout is an alternative to the accepted standalone wallet flow, not a missing prerequisite |
| [#14472 — website v2](https://github.com/pollinations/pollinations/pull/14472); 17 shared files out of 293 | P02/P03/P08/P10/P12 CI | Some shared UI already landed. Preserve remaining caller contracts for connect, Add Pollen/disconnect, purchase confirmation and return to Play; leave website launch and purchase features in their own PR |
| [#14695 — adjustable developer earnings markup](https://github.com/pollinations/pollinations/pull/14695); 7 shared files | P04/P05/P07 | Pricing feature: 10–50%, default 25%, with key metadata/editor/consent changes. This is not HTML markup. Preserve its fields if it lands; do not add pricing policy through form refactoring |
| [#14681 — Stripe fraud bans](https://github.com/pollinations/pollinations/pull/14681); 6 shared files, and [#13579 — payment-failure restrictions](https://github.com/pollinations/pollinations/pull/13579); 16 | P05/P08/P09/P10 | Separate restriction proposals affect sign-in, errors and payment eligibility. Preserve adopted backend meaning; do not introduce or soften policy through recovery/copy changes |
| [#14924 — PostHog conversion tracking](https://github.com/pollinations/pollinations/pull/14924); 4 shared files | P05/P08 | Preserve callback/checkout tracking if merged; keep analytics separate |
| [#14912 — 403 key-management links](https://github.com/pollinations/pollinations/pull/14912); no shared delta files | P05/P09/P10 | Adjacent Gen/MCP error contract. Keep endpoint messages/links visible; zero file overlap does not mean zero consumer impact |
| [#14731 — low-balance key_id links](https://github.com/pollinations/pollinations/pull/14731); no shared delta files | P08 | Related notice-link/attribution contract; does not substitute for SDK /account/key ID response and owner-only editing |
| [#14751 — hidden publication](https://github.com/pollinations/pollinations/pull/14751), [#14650 — actionable quest badge](https://github.com/pollinations/pollinations/pull/14650), [#12375 — disabled-model copy](https://github.com/pollinations/pollinations/pull/12375) | P09/P10/P11 | Check publication fields, nav/refresh and narrow copy overlap; retain distinct features in their own PRs |
| [#13962 — shared error hierarchy](https://github.com/pollinations/pollinations/pull/13962) | P05/P10 | Compare shared/error.ts semantics before the small default-503 correction; do not couple an entire class refactor to copy |

### 9.3 Watchlist, not prerequisites

The broad file scan also found these areas. Their full implementations were not audited here; recheck only the relevant group when extracting its owner:

- **Paid/Quest permissions (P04/P07/P08):** #13706/#13707/#13708 propose different policies, not three agreed requirements.
- **Models/agents/community access (P09/P11):** #14258, #13988, #13796, #13743, #13742, #13464, #12563, #12562, #12529 and #12471.
- **Wallet/account expansion (P08/P09):** gifting #14053/#14637/#12513, organizations #12576, payment formatting #13601 and balance policy #12047.
- **Broader protocols/models:** OAuth resource binding #12635, privacy #12035, routing/pooling #12825/#12818 and moderation #13423. Keep separate from recovery/layout fixes.
- **SDK embeddings #14419/#14418/#14398:** main already has embedding capability. Compare residual API/docs if relevant; titles alone do not justify closing a PR or adding work to P01.

Only a concrete conflict in the behavior being extracted can block that extraction. Recheck each relevant PR’s status/head immediately before publishing, record actual duplicated behavior and link the relevant PRs in the new description. This plan does not authorize merging, closing, editing, commenting on or requesting review of existing PRs.

## 10. Verification and evidence

### 10.1 Every product PR

- Pin workspace, head branch, base SHA and tested head SHA.
- Show the concrete trigger and before/after behavior.
- Run the owning package's focused regression tests and relevant typecheck/build.
- Build affected consumers when a shared public signature or style changes.
- Preserve current-main tests and features in overlapping files.
- Include tests with the behavior they prove. Directly import real product helpers; use the existing test infrastructure.
- State tests run, pass/fail/skip counts, unverified cases, and why any case was skipped.
- Do not infer complete correctness from a suite that excluded credential-dependent cases.
- Do not add UI snapshot tests for simple label-only edits; use targeted review unless behavior needs a regression check.

### 10.2 Critical scenario matrix

| Area | Required proof |
| --- | --- |
| SDK | Valid/invalid restored connection; transient check failure; retry; storage failure; navigation failure; disconnect |
| Shared UI | Required permissions; account refresh; real identity/avatar; status badges; keyboard/focus; themes/sizes |
| App authorization | Valid consent; invalid request; unavailable lookup; sign-in failure; session expiry; cancel; successful callback; failed delivery cleanup |
| Device authorization | Enter-code and link paths; missing/expired/used code; lookup error; approval error; retry/cancel; success; key cleanup failure |
| Admin/internal auth | Initial sign-in; non-admin denial; canceled return; invalid state; session refresh failure; explicit sign-out and failure |
| Keys/Apps | Empty/populated list; create/edit errors; metadata persistence; cancel/delete/revoke; owner checks |
| Wallet | Paid/Quest/allowance distinctions; pending/credited payment; actual balance; portal/checkout return contracts; 401 recovery |
| Settings/dashboard | Endpoint-specific errors; retry; preserved form data; empty versus failed load; session recovery |
| Models/Agents | Main's prompt/code agents, sync and icons retained; catalog retry and failed mutation |
| Connect | Selected route and situation match preparation, visible result, product actions, URL identity, and Map edges |

### 10.3 Connect's evidence must prove the situation

For each declared situation, record or assert:

1. Source product route/component and stable situation ID.
2. Entry path and deterministic preparation.
3. Loaded route, not only a heading.
4. Situation-specific content or state: exact relevant error, list contents, balance/badge, disabled/pending control, or action result.
5. Whether a failure came from the endpoint or an explicitly injected transport response.
6. Recovery destination/action and corresponding Map edge where applicable.
7. Capture freshness and the actual source version.
8. Runtime/database cleanup after verification.

An alert selector that can match Connect's own bootstrap error is insufficient. Identical screenshots can still represent distinct entry-path coverage; deduplicate rendering where equivalent without discarding different protocol/recovery tests.

### 10.4 Commands verified in current manifests

These are command references, not a claim that they were run while writing this plan. Replace the root with the approved extraction workspace and choose only the tests needed for that PR.

| Package | Commands |
| --- | --- |
| SDK | npm --prefix /private/tmp/pollinations-pollen-connect-ux/packages/sdk run typecheck; npm --prefix /private/tmp/pollinations-pollen-connect-ux/packages/sdk run build; npm --prefix /private/tmp/pollinations-pollen-connect-ux/packages/sdk test -- src/react/PolliProvider.test.tsx src/react/hooks.test.tsx |
| UI | npm --prefix /private/tmp/pollinations-pollen-connect-ux/packages/ui run typecheck; npm --prefix /private/tmp/pollinations-pollen-connect-ux/packages/ui run build; npm --prefix /private/tmp/pollinations-pollen-connect-ux/packages/ui test |
| Auth | npm --prefix /private/tmp/pollinations-pollen-connect-ux/packages/auth run typecheck; npm --prefix /private/tmp/pollinations-pollen-connect-ux/packages/auth test -- test/react.test.ts test/server.test.ts |
| Enter | npm --prefix /private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai run typecheck; npm --prefix /private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai run build:frontend; focused npm test file selections |
| Gen | npm --prefix /private/tmp/pollinations-pollen-connect-ux/gen.pollinations.ai run typecheck; focused docs and upstream-error tests |
| Connect | npm --prefix /private/tmp/pollinations-pollen-connect-ux/operations/flow run build; explicitly selected safe tests and capture checks |

Follow repository local-environment setup before Enter tests, including its decrypt-vars requirement, while honoring the separate secret-mutation boundary. Do not print environment files or credential values.

Do not run an unrestricted Connect runtime suite casually: it includes credential-issuing cases. Inspect test selection and environment gates first. The source has distinct CONNECT_CAPTURE_TEST, CONNECT_DEVICE_APPROVAL_ERROR_TEST, and CONNECT_AUTHORIZATION_CLEANUP_TEST gates; these are switches, not authorization.

The previous local pass/skip counts are historical evidence. New PRs need results at their own heads. This plan does not claim a fresh full CI or successful cleanup E2E run.

## 11. Credential-dependent verification

Complete safe extraction and verification before requesting the remaining specific operation.

For each necessary disposable batch, state the actual credential names, exact local environments, reason, impact, execution order, verification, and database-disposal rollback. Request the scoped approval required by AGENTS.md. Past approvals do not automatically cover a new batch.

The pending cleanup regression requires creating a key through the real flow, failing its delivery, checking deletion or surfaced deletion failure, and discarding the database. Name every credential/session the selected harness actually creates; do not assume a narrow test creates only the obvious key.

Continue unrelated safe checks while any credential operation is pending. Do not touch existing local profiles or production as part of disposable verification.

## 12. Extraction procedure

### Phase A — Establish the plan against current main

- [x] Merge main 500787426b into the source while preserving accepted branch work; pin d7dac212ad and record verification.
- [x] Refresh PR metadata and reconcile the 236-file inventory for that snapshot.
- [x] Incorporate main through 44a3f92e5b, including #14917 and #14936; reconcile the accepted UI and simplify SDK consumers.
- [ ] Refresh source/main references, PR statuses and this inventory after that integration.
- [ ] Obtain approval for the named extraction branch/worktree before creating it, as required by the session's Git instructions.
- [ ] Pin the first extraction base and capture its current-main feature checks.
- [ ] Complete Keep/Adapt/Already/Exclude/Deferred decisions for that PR's hunks.
- [ ] Resolve any needed UI behavior decision and flag the visible change.
- [ ] Confirm no new shared API or duplicated logic is being introduced only for the split.

### Phase B — Extract one coherent PR

- [ ] Work in the dedicated workspace with the expected branch.
- [ ] Apply minimal accepted changes to current-main implementations.
- [ ] Preserve source attribution when carrying commits; use new commits for adapted hunks.
- [ ] Include necessary callers, exports, documentation, generated routes, and tests.
- [ ] Inspect the staged diff for source-only pages, deleted main capabilities, old lockfile content, fixtures, and unrelated cleanup.
- [ ] Format supported changed source files with Biome; inspect errors unfiltered.
- [ ] Run focused tests and affected consumer builds.
- [ ] Record remaining verification limits precisely.
- [ ] Prepare a short PR description stating problem, changed behavior, dependencies, and validation.
- [ ] Publish only when requested within the approved branch/PR scope.

### Phase C — After each merge

- [ ] Record the actual merge commit and PR in the ledger.
- [ ] Compare accepted behaviors against the new main.
- [ ] Mark newly superseded work Already on main; do not keep applying an obsolete patch.
- [ ] Refresh remaining PR bases without force-pushing or rewriting the source reference.
- [ ] Update downstream dependency/caller decisions.
- [ ] Retest only affected behavior unless new failures justify a wider check.

### Phase D — Final recombination

- [ ] Every source change has a disposition and a final owner.
- [ ] Every accepted improvement is present on the merged tree.
- [ ] Every named current-main capability is retained.
- [ ] Deferred/excluded changes have explicit reasons and consequences.
- [ ] Product regression tests execute without requiring Connect.
- [ ] Connect runs against the merged product tree from a clean checkout.
- [ ] All declared review situations have meaningful evidence or an explicit gap.
- [ ] Journey-tab execution, contextual controls, and Map destinations match the agreed behavior.
- [ ] Required credential-dependent verification is complete.
- [ ] CI behavior is tested and approved; missing/failed checks are not converted to success.
- [ ] No credentials, local databases, generated captures, or unrelated build output are included.

Do not require byte equality with a mechanically rebased old branch: legitimate adaptation to current main changes the implementation. Require complete change accounting plus preserved behavior and independent regression evidence. A final diff is useful for finding unexplained residuals, not a replacement for that evidence.

## 13. Decisions and stop conditions

**Defaults already decided:** keep main's Stripe contracts and features; retain the accepted Connect viewer; preserve Journey-tab execution; use one shared App/Device implementation; keep error transformations in product source; keep Connect local for this delivery.

**Decisions that may need user input after a concrete comparison:**

- A new visual conflict with later main changes. The d7dac212ad identity/menu reconciliation is already baseline; do not reopen it without a concrete remaining problem.
- Whether P11's broader Models/Agents organization remains worth shipping.
- A sign-out destination change that affects product consumers.
- Final Connect CI gating if the measured behavior requires changing existing required checks.
- Any public hosting or per-tester authentication work, which is outside this plan.

**Stop only the affected extraction when:**

- Its workspace/branch does not match the approved target.
- A conflict cannot be resolved without losing main behavior or changing an agreed flow.
- A credential mutation lacks scoped approval.
- A critical regression check fails or its only supposed proof is skipped.
- The proposed solution requires copied product logic, invented error rendering, or a new general framework solely for Connect.

Continue unrelated read-only and safe work. Record the concrete issue rather than declaring the whole project blocked.

## 14. Immediate next work

1. P01 is complete on main as #14936. Preserve its narrower merged behavior: no startup validation request and no `retryConnection` API.
2. P02’s dialog-tooltip slice is complete on main as #14949. Carry any remaining control change only with the product consumer that requires it.
3. P03a is complete on main as #14951. Do not restore the rejected public AppUserMenu state callback or duplicate balance presentation.
4. Create `codex/ui-auth-result-presentation` from current main for P03b. Extract sign-in, error, result and confirmation presentation plus minimum callers; exclude P04–P09 behavior and Connect.
5. Refresh the P03b hunk ledger against current main before editing. The appendix is historical ownership evidence, not an apply-ready patch.
6. Keep #12320’s server revocation and connected-app management separate; KeyInfo.id remains P08. Resolve remaining navigation and top-up overlaps before P07/P08/P11 publication, and land Connect last.

No rewrite or replacement of the approved UI is planned. The outcome is a smaller set of independently reviewable changes with existing main behavior and open-PR boundaries accounted for.

## Appendix A — Complete source file ownership inventory

Generated from merged-main 44a3f92e5b → source e312c98941. The 230 rows exclude this documentation file; #14917 and #14936 are already included. Status A/M/D describes the source branch delta, not what a new PR should add/delete. “Exclude candidate” is a proposed disposition requiring the stated consumer check. All other rows require Keep/Adapt/Already/Deferred decisions during hunk extraction.


### A1. Product, package, documentation, and integration files — 153

| Source status | Source file | Proposed owner | Extraction instruction |
| --- | --- | --- | --- |
| M | [.github/workflows/ci-pull-request-checks.yml](/private/tmp/pollinations-pollen-connect-ux/.github/workflows/ci-pull-request-checks.yml) | P12 | SDK test step is baseline; residual Connect integration and aggregate gate review only. |
| M | [BRING_YOUR_OWN_POLLEN.md](/private/tmp/pollinations-pollen-connect-ux/BRING_YOUR_OWN_POLLEN.md) | P10; behavior owners | Separate terminology from SDK/auth behavior documentation. |
| M | [README.md](/private/tmp/pollinations-pollen-connect-ux/README.md) | P10; behavior owners | Separate terminology from SDK/auth behavior documentation. |
| M | [enter.pollinations.ai/frontend/src/components/account/connected-apps.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/account/connected-apps.tsx) | P07 + P09 | Connected app management plus load/session recovery. |
| M | [enter.pollinations.ai/frontend/src/components/auth/app-attribution.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/auth/app-attribution.tsx) | P05; P03/P04 callsites | Product auth implementation; minimum earlier shared-UI/form migration as necessary. |
| A | [enter.pollinations.ai/frontend/src/components/auth/auth-account-identity.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/auth/auth-account-identity.tsx) | P03 + P05 | Compose main AccountIdentity; avoid competing duplicate composition. |
| M | [enter.pollinations.ai/frontend/src/components/auth/authorize.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/auth/authorize.tsx) | P05; P03/P04 callsites | Product auth implementation; minimum earlier shared-UI/form migration as necessary. |
| A | [enter.pollinations.ai/frontend/src/components/auth/connection-error-screen.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/auth/connection-error-screen.tsx) | P05; P03/P04 callsites | Product auth implementation; minimum earlier shared-UI/form migration as necessary. |
| A | [enter.pollinations.ai/frontend/src/components/auth/consent-model-picker.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/auth/consent-model-picker.tsx) | P04 | Shared model selection consumed by consent and key forms. |
| M | [enter.pollinations.ai/frontend/src/components/auth/device.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/auth/device.tsx) | P05; P03/P04 callsites | Product auth implementation; minimum earlier shared-UI/form migration as necessary. |
| A | [enter.pollinations.ai/frontend/src/components/auth/sign-in-again.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/auth/sign-in-again.tsx) | P08 + P09 | Move with first real wallet/session consumer; later flows reuse it. |
| A | [enter.pollinations.ai/frontend/src/components/auth/sign-in-screen.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/auth/sign-in-screen.tsx) | P05; P03/P04 callsites | Product auth implementation; minimum earlier shared-UI/form migration as necessary. |
| M | [enter.pollinations.ai/frontend/src/components/community-endpoints/agent-delete-confirmation.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/community-endpoints/agent-delete-confirmation.tsx) | P09 + P11 | Minimal failure/retry fixes P09; optional restructuring P11; preserve main code agents/icons. |
| M | [enter.pollinations.ai/frontend/src/components/community-endpoints/agent-dialog.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/community-endpoints/agent-dialog.tsx) | P09 + P11 | Minimal failure/retry fixes P09; optional restructuring P11; preserve main code agents/icons. |
| M | [enter.pollinations.ai/frontend/src/components/community-endpoints/base-model-input.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/community-endpoints/base-model-input.tsx) | P09 + P11 | Minimal failure/retry fixes P09; optional restructuring P11; preserve main code agents/icons. |
| M | [enter.pollinations.ai/frontend/src/components/community-endpoints/community-endpoint-card.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/community-endpoints/community-endpoint-card.tsx) | P09 + P11 | Minimal failure/retry fixes P09; optional restructuring P11; preserve main code agents/icons. |
| M | [enter.pollinations.ai/frontend/src/components/community-endpoints/community-endpoint-delete-confirmation.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/community-endpoints/community-endpoint-delete-confirmation.tsx) | P09 + P11 | Minimal failure/retry fixes P09; optional restructuring P11; preserve main code agents/icons. |
| M | [enter.pollinations.ai/frontend/src/components/community-endpoints/community-endpoint-dialog.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/community-endpoints/community-endpoint-dialog.tsx) | P09 + P11 | Minimal failure/retry fixes P09; optional restructuring P11; preserve main code agents/icons. |
| M | [enter.pollinations.ai/frontend/src/components/community-endpoints/community-endpoint-toggle-confirmation.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/community-endpoints/community-endpoint-toggle-confirmation.tsx) | P09 + P11 | Minimal failure/retry fixes P09; optional restructuring P11; preserve main code agents/icons. |
| M | [enter.pollinations.ai/frontend/src/components/community-endpoints/community-endpoints.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/community-endpoints/community-endpoints.tsx) | P09 + P11 | Minimal failure/retry fixes P09; optional restructuring P11; preserve main code agents/icons. |
| M | [enter.pollinations.ai/frontend/src/components/community-endpoints/deployments.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/community-endpoints/deployments.tsx) | P09 + P11 | Minimal failure/retry fixes P09; optional restructuring P11; preserve main code agents/icons. |
| M | [enter.pollinations.ai/frontend/src/components/community-endpoints/model-listing-fields.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/community-endpoints/model-listing-fields.tsx) | P09 + P11 | Minimal failure/retry fixes P09; optional restructuring P11; preserve main code agents/icons. |
| M | [enter.pollinations.ai/frontend/src/components/community-endpoints/price-table.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/community-endpoints/price-table.tsx) | P09 + P11 | Minimal failure/retry fixes P09; optional restructuring P11; preserve main code agents/icons. |
| M | [enter.pollinations.ai/frontend/src/components/community-endpoints/prompt-agent-fields.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/community-endpoints/prompt-agent-fields.tsx) | P09 + P11 | Minimal failure/retry fixes P09; optional restructuring P11; preserve main code agents/icons. |
| M | [enter.pollinations.ai/frontend/src/components/keys/account-permissions-input.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/keys/account-permissions-input.tsx) | P04 | Shared controls/helpers; remove old utility only after all callers migrate. |
| M | [enter.pollinations.ai/frontend/src/components/keys/api-key-dialog.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/keys/api-key-dialog.tsx) | P04 + P07 | Shared inputs and key/app management behavior. |
| M | [enter.pollinations.ai/frontend/src/components/keys/api-key-list.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/keys/api-key-list.tsx) | P07 + P09 as needed | Key actions/list behavior; preserve explicit load errors. |
| M | [enter.pollinations.ai/frontend/src/components/keys/edit-api-key-dialog.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/keys/edit-api-key-dialog.tsx) | P04 + P07 + P08 | Controls; management action; standalone page mode/return integration. |
| M | [enter.pollinations.ai/frontend/src/components/keys/expiry-days-input.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/keys/expiry-days-input.tsx) | P04 | Shared controls/helpers; remove old utility only after all callers migrate. |
| M | [enter.pollinations.ai/frontend/src/components/keys/key-delete-confirmation.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/keys/key-delete-confirmation.tsx) | P07 + P09 as needed | Key actions/list behavior; preserve explicit load errors. |
| M | [enter.pollinations.ai/frontend/src/components/keys/key-permissions.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/keys/key-permissions.tsx) | P04 | Shared controls/helpers; remove old utility only after all callers migrate. |
| A | [enter.pollinations.ai/frontend/src/components/keys/model-permissions-input.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/keys/model-permissions-input.tsx) | P04 | Shared controls/helpers; remove old utility only after all callers migrate. |
| M | [enter.pollinations.ai/frontend/src/components/keys/model-selection.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/keys/model-selection.ts) | P04 | Shared controls/helpers; remove old utility only after all callers migrate. |
| D | /private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/keys/permission-ui.ts (deleted in source branch) | P04 | Shared controls/helpers; remove old utility only after all callers migrate. |
| M | [enter.pollinations.ai/frontend/src/components/keys/pollen-budget-input.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/keys/pollen-budget-input.tsx) | P04 | Shared controls/helpers; remove old utility only after all callers migrate. |
| M | [enter.pollinations.ai/frontend/src/components/keys/publishable-key-settings.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/keys/publishable-key-settings.tsx) | P04 + P07 | Shared inputs and key/app management behavior. |
| M | [enter.pollinations.ai/frontend/src/components/keys/types.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/keys/types.ts) | P07 + P08 | Keep form/standalone editor types with actual consumers. |
| M | [enter.pollinations.ai/frontend/src/components/layout/dashboard-shell.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/layout/dashboard-shell.tsx) | P07 + P11 | Keys/Apps and optional Agents navigation in separate hunks. |
| M | [enter.pollinations.ai/frontend/src/components/layout/dashboard-theme.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/layout/dashboard-theme.ts) | P07 + P11 | Keys/Apps and optional Agents navigation in separate hunks. |
| M | [enter.pollinations.ai/frontend/src/components/models/model-categories.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/models/model-categories.ts) | P04 | Shared catalog selection/data contract with atomic callers. |
| A | [enter.pollinations.ai/frontend/src/components/models/model-filter-tokens.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/models/model-filter-tokens.tsx) | P04 | Shared catalog selection/data contract with atomic callers. |
| M | [enter.pollinations.ai/frontend/src/components/models/models.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/models/models.tsx) | P04 + P09 + P11 | Token extraction; load/retry; optional search/layout changes. |
| M | [enter.pollinations.ai/frontend/src/components/models/use-model-categories.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/models/use-model-categories.ts) | P04 | Shared catalog selection/data contract with atomic callers. |
| A | [enter.pollinations.ai/frontend/src/components/news-faq/highlights.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/news-faq/highlights.ts) | P12 | One real highlights parser shared with Connect verification. |
| M | [enter.pollinations.ai/frontend/src/components/news-faq/news-banner.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/news-faq/news-banner.tsx) | P12 | One real highlights parser shared with Connect verification. |
| M | [enter.pollinations.ai/frontend/src/components/pollen/auto-top-up-panel.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/pollen/auto-top-up-panel.tsx) | P08; P03 first consumers | Wallet behavior on main pages; presentation changes only where first needed. |
| M | [enter.pollinations.ai/frontend/src/components/pollen/pollen-balance.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/pollen/pollen-balance.tsx) | P08; P03 first consumers | Wallet behavior on main pages; presentation changes only where first needed. |
| M | [enter.pollinations.ai/frontend/src/components/pollen/pollen-pack-controls.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/pollen/pollen-pack-controls.tsx) | P08; P03 first consumers | Wallet behavior on main pages; presentation changes only where first needed. |
| A | [enter.pollinations.ai/frontend/src/components/pollen/wallet-payment-status.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/components/pollen/wallet-payment-status.tsx) | P08; P03 first consumers | Wallet behavior on main pages; presentation changes only where first needed. |
| M | [enter.pollinations.ai/frontend/src/hooks/use-github-sign-in.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/hooks/use-github-sign-in.ts) | P05 | Sign-in recovery and context. |
| A | [enter.pollinations.ai/frontend/src/lib/account-action-return.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/lib/account-action-return.tsx) | P08 | Reuse/adapt current main equivalents; preserve returns and endpoint errors. |
| A | [enter.pollinations.ai/frontend/src/lib/api-error.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/lib/api-error.ts) | P05 | Product-owned response parsing; later flows import it. |
| M | [enter.pollinations.ai/frontend/src/lib/top-up-search.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/lib/top-up-search.ts) | P08 | Preserve main return fields; session_id parsing travels with owner-scoped checkout credit confirmation. |
| M | [enter.pollinations.ai/frontend/src/lib/create-api-key.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/lib/create-api-key.ts) | P04 + P05 + P07 | Control/validation integration and real error handling; no duplicate helper. |
| A | [enter.pollinations.ai/frontend/src/lib/device-request.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/lib/device-request.ts) | P05 | Real entry/recovery implementation and product tests. |
| A | [enter.pollinations.ai/frontend/src/lib/load-wallet.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/lib/load-wallet.ts) | P08 | Reuse/adapt current main equivalents; preserve returns and endpoint errors. |
| A | [enter.pollinations.ai/frontend/src/lib/sign-in-context.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/lib/sign-in-context.ts) | P05 | Real entry/recovery implementation and product tests. |
| M | [enter.pollinations.ai/frontend/src/lib/update-api-key.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/lib/update-api-key.ts) | P08 | Reuse/adapt current main equivalents; preserve returns and endpoint errors. |
| M | [enter.pollinations.ai/frontend/src/routeTree.gen.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/routeTree.gen.ts) | P07 + P11; route owners | Regenerate from routes actually present in each PR. |
| M | [enter.pollinations.ai/frontend/src/routes/_dashboard.account.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/routes/_dashboard.account.tsx) | P09; P03 callsites | Settings/load recovery; only mandatory UI contract updates earlier. |
| A | [enter.pollinations.ai/frontend/src/routes/_dashboard.agents.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/routes/_dashboard.agents.tsx) | P11 | Optional route reorganization; preserve main model/agent types. |
| A | [enter.pollinations.ai/frontend/src/routes/_dashboard.apps.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/routes/_dashboard.apps.tsx) | P07 | Keys/Apps routes with matching navigation. |
| M | [enter.pollinations.ai/frontend/src/routes/_dashboard.keys.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/routes/_dashboard.keys.tsx) | P07 | Keys/Apps routes with matching navigation. |
| M | [enter.pollinations.ai/frontend/src/routes/_dashboard.my-models.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/routes/_dashboard.my-models.tsx) | P11 | Optional route reorganization; preserve main model/agent types. |
| M | [enter.pollinations.ai/frontend/src/routes/_dashboard.pollen.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/routes/_dashboard.pollen.tsx) | P08; P03 callsites | Keep main pages; adapt residual behavior and mandatory loading titles. |
| M | [enter.pollinations.ai/frontend/src/routes/_dashboard.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/routes/_dashboard.tsx) | P09; P03 callsites | Settings/load recovery; only mandatory UI contract updates earlier. |
| M | [enter.pollinations.ai/frontend/src/routes/app.sign-in.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/routes/app.sign-in.tsx) | P05; P03/P04 callsites | Flow recovery; earlier signature/control updates only when atomic migration requires them. |
| M | [enter.pollinations.ai/frontend/src/routes/authorize.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/routes/authorize.tsx) | P05; P03/P04 callsites | Flow recovery; earlier signature/control updates only when atomic migration requires them. |
| M | [enter.pollinations.ai/frontend/src/routes/device.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/routes/device.tsx) | P05; P03/P04 callsites | Flow recovery; earlier signature/control updates only when atomic migration requires them. |
| M | [enter.pollinations.ai/frontend/src/routes/edit-key.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/routes/edit-key.tsx) | P08; P03 callsites | Keep main pages; adapt residual behavior and mandatory loading titles. |
| M | [enter.pollinations.ai/frontend/src/routes/error.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/routes/error.tsx) | P05; P03/P04 callsites | Flow recovery; earlier signature/control updates only when atomic migration requires them. |
| M | [enter.pollinations.ai/frontend/src/routes/top-up.tsx](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/frontend/src/routes/top-up.tsx) | P08; P03 callsites | Keep main pages; adapt residual behavior and mandatory loading titles. |
| A | [enter.pollinations.ai/src/auth-errors.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/src/auth-errors.ts) | P05 | Real source auth and lookup errors. |
| M | [enter.pollinations.ai/src/auth.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/src/auth.ts) | P05 | Real source auth and lookup errors. |
| M | [enter.pollinations.ai/src/routes/account.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/src/routes/account.ts) | P08 + P10 | ID contract P08; profile-scope documentation follows actual semantics. |
| M | [enter.pollinations.ai/src/routes/app-lookup.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/src/routes/app-lookup.ts) | P05 | Real source auth and lookup errors. |
| M | [enter.pollinations.ai/src/routes/stripe.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/src/routes/stripe.ts) | P08 | Adapt to main return contracts; omit helper if existing implementation suffices. |
| A | [enter.pollinations.ai/src/utils/stripe-checkout-return.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/src/utils/stripe-checkout-return.ts) | P08 | Adapt to main return contracts; omit helper if existing implementation suffices. |
| M | [enter.pollinations.ai/test/account-key.test.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/test/account-key.test.ts) | P08 | Owner key ID and billing contracts; retain current main tests. |
| M | [enter.pollinations.ai/test/authorize-config.test.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/test/authorize-config.test.ts) | P04 + P05 | Split shared form validation and authorization-request assertions. |
| A | [enter.pollinations.ai/test/device-request.test.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/test/device-request.test.ts) | P05 | Real device/request/auth failure checks. |
| M | [enter.pollinations.ai/test/integration/api-keys.test.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/test/integration/api-keys.test.ts) | P07 + P04/P05 as needed | Associate each assertion with its actual validation/action behavior. |
| M | [enter.pollinations.ai/test/integration/stripe.test.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/test/integration/stripe.test.ts) | P08 | Owner key ID and billing contracts; retain current main tests. |
| M | [enter.pollinations.ai/test/model-categories.test.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/test/model-categories.test.ts) | P04 | Catalog/selection/paid-only helper regressions. |
| M | [enter.pollinations.ai/test/staging-access.test.ts](/private/tmp/pollinations-pollen-connect-ux/enter.pollinations.ai/test/staging-access.test.ts) | P05 | Real device/request/auth failure checks. |
| M | [gen.pollinations.ai/src/docs/apidocs-recipes.md](/private/tmp/pollinations-pollen-connect-ux/gen.pollinations.ai/src/docs/apidocs-recipes.md) | P10 | Source documentation/default 503 assertion; preserve unrelated main work. |
| M | [gen.pollinations.ai/src/docs/authentication.md](/private/tmp/pollinations-pollen-connect-ux/gen.pollinations.ai/src/docs/authentication.md) | P10 | Source documentation/default 503 assertion; preserve unrelated main work. |
| M | [gen.pollinations.ai/src/docs/introduction.md](/private/tmp/pollinations-pollen-connect-ux/gen.pollinations.ai/src/docs/introduction.md) | P10 | Source documentation/default 503 assertion; preserve unrelated main work. |
| M | [gen.pollinations.ai/src/routes/docs.ts](/private/tmp/pollinations-pollen-connect-ux/gen.pollinations.ai/src/routes/docs.ts) | P10 | Source documentation/default 503 assertion; preserve unrelated main work. |
| M | [gen.pollinations.ai/test/docs.test.ts](/private/tmp/pollinations-pollen-connect-ux/gen.pollinations.ai/test/docs.test.ts) | P10 | Source documentation/default 503 assertion; preserve unrelated main work. |
| M | [gen.pollinations.ai/test/image/fetchUpstream.test.ts](/private/tmp/pollinations-pollen-connect-ux/gen.pollinations.ai/test/image/fetchUpstream.test.ts) | P10 | Source documentation/default 503 assertion; preserve unrelated main work. |
| M | [operations/economics/web/src/main.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/economics/web/src/main.tsx) | P06; P03 callsites | Auth consumers and only required shared-presentation adaptation. |
| M | [operations/observability/frontend/src/main.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/observability/frontend/src/main.tsx) | P06; P03 callsites | Auth consumers and only required shared-presentation adaptation. |
| M | [package-lock.json](/private/tmp/pollinations-pollen-connect-ux/package-lock.json) | P12 | Apply only Connect integration; regenerate lockfile and review CI gate explicitly. |
| M | [package.json](/private/tmp/pollinations-pollen-connect-ux/package.json) | P12 | Apply only Connect integration; regenerate lockfile and review CI gate explicitly. |
| M | [packages/auth/src/react.ts](/private/tmp/pollinations-pollen-connect-ux/packages/auth/src/react.ts) | P06 | Preserve auth recovery; assess runtime removal against real return paths. |
| M | [packages/auth/src/server.ts](/private/tmp/pollinations-pollen-connect-ux/packages/auth/src/server.ts) | P06 | Preserve auth recovery; assess runtime removal against real return paths. |
| M | [packages/auth/test/react.test.ts](/private/tmp/pollinations-pollen-connect-ux/packages/auth/test/react.test.ts) | P06 | Preserve auth recovery; assess runtime removal against real return paths. |
| M | [packages/auth/test/server.test.ts](/private/tmp/pollinations-pollen-connect-ux/packages/auth/test/server.test.ts) | P06 | Preserve auth recovery; assess runtime removal against real return paths. |
| M | [packages/sdk/README.md](/private/tmp/pollinations-pollen-connect-ux/packages/sdk/README.md) | P10 | Only independent terminology remains; merged recovery documentation is baseline. |
| M | [packages/sdk/src/types.ts](/private/tmp/pollinations-pollen-connect-ux/packages/sdk/src/types.ts) | P08 | KeyInfo.id travels with Enter response/schema and editor consumer. |
| M | [packages/ui/README.md](/private/tmp/pollinations-pollen-connect-ux/packages/ui/README.md) | P03 + P08 + P10 | Document APIs/behavior with owner; naming separately. |
| M | [packages/ui/src/compositions/AccountIdentity.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/compositions/AccountIdentity.tsx) | P03 | Preserve reconciled identity/menu presentation and real account data; extract only the delta over main. |
| M | [packages/ui/src/compositions/AccountMenu.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/compositions/AccountMenu.tsx) | P03 | Reconcile with main; include caller migrations; exclude unused public options. |
| A | [packages/ui/src/compositions/ConfirmationDialog.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/compositions/ConfirmationDialog.tsx) | P03 | Reconcile with main; include caller migrations; exclude unused public options. |
| M | [packages/ui/src/compositions/CopyButton.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/compositions/CopyButton.tsx) | P02 | Generic control changes and corresponding consumers/tests. |
| M | [packages/ui/src/compositions/EditableCombobox.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/compositions/EditableCombobox.tsx) | P02 | Generic control changes and corresponding consumers/tests. |
| M | [packages/ui/src/compositions/InfoTip.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/compositions/InfoTip.tsx) | P02 | Generic control changes and corresponding consumers/tests. |
| M | [packages/ui/src/index.ts](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/index.ts) | P02 + P03 + P08 | Stage only exports required by each PR; omit unused exports. |
| M | [packages/ui/src/modules/app-user-menu/AppUserMenu.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/app-user-menu/AppUserMenu.tsx) | P03 + P08 | Presentation/derived state P03; new owner-ID-dependent link P08; omit observer callback. |
| A | [packages/ui/src/modules/app-user-menu/AppUserMenuView.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/app-user-menu/AppUserMenuView.tsx) | P03 + P08 | Presentation/derived state P03; new owner-ID-dependent link P08; omit observer callback. |
| M | [packages/ui/src/modules/app-user-menu/sdk.ts](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/app-user-menu/sdk.ts) | P03 + P08 | Presentation/derived state P03; new owner-ID-dependent link P08; omit observer callback. |
| A | [packages/ui/src/modules/auth/AuthErrorContent.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/auth/AuthErrorContent.tsx) | P03 | Reconcile with main; include caller migrations; exclude unused public options. |
| M | [packages/ui/src/modules/auth/AuthModal.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/auth/AuthModal.tsx) | P03 | Reconcile with main; include caller migrations; exclude unused public options. |
| M | [packages/ui/src/modules/auth/DashboardSignIn.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/auth/DashboardSignIn.tsx) | P03 + P06 | Shared display P03; auth-state and recovery meaning P06. |
| A | [packages/ui/src/modules/auth/DeviceAuthorizationResult.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/auth/DeviceAuthorizationResult.tsx) | P03 | Reconcile with main; include caller migrations; exclude unused public options. |
| A | [packages/ui/src/modules/auth/GitHubSignInButton.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/auth/GitHubSignInButton.tsx) | P03 | Reconcile with main; include caller migrations; exclude unused public options. |
| M | [packages/ui/src/modules/auth/LoginButton.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/auth/LoginButton.tsx) | P03 | Reconcile with main; include caller migrations; exclude unused public options. |
| M | [packages/ui/src/modules/auth/PollinationsSignInButton.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/auth/PollinationsSignInButton.tsx) | P03 | Reconcile with main; include caller migrations; exclude unused public options. |
| A | [packages/ui/src/modules/auth/ProviderSignInButton.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/auth/ProviderSignInButton.tsx) | P03 | Reconcile with main; include caller migrations; exclude unused public options. |
| A | [packages/ui/src/modules/auth/dashboard-sign-in-errors.ts](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/auth/dashboard-sign-in-errors.ts) | P03 + P06 | Shared display P03; auth-state and recovery meaning P06. |
| M | [packages/ui/src/modules/auth/index.ts](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/auth/index.ts) | P03 | Reconcile with main; include caller migrations; exclude unused public options. |
| A | [packages/ui/src/modules/wallet/AccountPollen.test.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/wallet/AccountPollen.test.tsx) | P03 | Reconcile with main; include caller migrations; exclude unused public options. |
| A | [packages/ui/src/modules/wallet/AccountPollen.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/wallet/AccountPollen.tsx) | P03 | Reconcile with main; include caller migrations; exclude unused public options. |
| M | [packages/ui/src/modules/wallet/Balance.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/wallet/Balance.tsx) | P03 | Reconcile with main; include caller migrations; exclude unused public options. |
| A | [packages/ui/src/modules/wallet/PollenAmountSlider.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/wallet/PollenAmountSlider.tsx) | P03 + P08 | Shared component with first consumer; wallet action integration P08. |
| A | [packages/ui/src/modules/wallet/PollenFundingAction.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/wallet/PollenFundingAction.tsx) | P03 + P08 | Shared component with first consumer; wallet action integration P08. |
| A | [packages/ui/src/modules/wallet/PollenModelNotice.test.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/wallet/PollenModelNotice.test.tsx) | P03 — exclude candidate | Reconfirm no active consumer, then omit component, export, and redundant test. |
| A | [packages/ui/src/modules/wallet/PollenModelNotice.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/wallet/PollenModelNotice.tsx) | P03 — exclude candidate | Reconfirm no active consumer, then omit component, export, and redundant test. |
| A | [packages/ui/src/modules/wallet/PollenStatusBadge.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/wallet/PollenStatusBadge.tsx) | P03 | Reconcile with main; include caller migrations; exclude unused public options. |
| M | [packages/ui/src/modules/wallet/index.ts](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/wallet/index.ts) | P03 | Reconcile with main; include caller migrations; exclude unused public options. |
| M | [packages/ui/src/modules/wallet/wallet-display.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/modules/wallet/wallet-display.tsx) | P03 | Reconcile with main; include caller migrations; exclude unused public options. |
| M | [packages/ui/src/primitives/Button.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/primitives/Button.tsx) | P02 | Preserve current main controls; omit unused icons/options after consumer check. |
| M | [packages/ui/src/primitives/Chip.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/primitives/Chip.tsx) | P02 | Preserve current main controls; omit unused icons/options after consumer check. |
| M | [packages/ui/src/primitives/Dialog.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/primitives/Dialog.tsx) | P02 | Preserve current main controls; omit unused icons/options after consumer check. |
| M | [packages/ui/src/primitives/Dropdown.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/primitives/Dropdown.tsx) | P02 | Preserve current main controls; omit unused icons/options after consumer check. |
| M | [packages/ui/src/primitives/IconButton.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/primitives/IconButton.tsx) | P02 | Preserve current main controls; omit unused icons/options after consumer check. |
| M | [packages/ui/src/primitives/Tooltip.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/primitives/Tooltip.tsx) | P02 | Preserve current main controls; omit unused icons/options after consumer check. |
| M | [packages/ui/src/primitives/controls-accessibility.test.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/primitives/controls-accessibility.test.tsx) | P02 | Preserve current main controls; omit unused icons/options after consumer check. |
| M | [packages/ui/src/primitives/icons/index.tsx](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/primitives/icons/index.tsx) | P02 | Preserve current main controls; omit unused icons/options after consumer check. |
| M | [packages/ui/src/styles/tokens.css](/private/tmp/pollinations-pollen-connect-ux/packages/ui/src/styles/tokens.css) | P02 | Preserve current main controls; omit unused icons/options after consumer check. |
| M | [pollinations.ai/src/copy/content/auth.ts](/private/tmp/pollinations-pollen-connect-ux/pollinations.ai/src/copy/content/auth.ts) | P10 | Independent product terminology. |
| M | [pollinations.ai/src/copy/content/play.ts](/private/tmp/pollinations-pollen-connect-ux/pollinations.ai/src/copy/content/play.ts) | P10 | Independent product terminology. |
| M | [shared/auth/api-key-creation.ts](/private/tmp/pollinations-pollen-connect-ux/shared/auth/api-key-creation.ts) | P12 evidence / exclude | Only branch change imports equivalent message for review; prefer real endpoint assertion if sufficient. |
| M | [shared/auth/authorize-config.ts](/private/tmp/pollinations-pollen-connect-ux/shared/auth/authorize-config.ts) | P04 + P05; P12 evidence | Budget/expiry P04; request validation P05; inspect preview-only exported message. |
| A | [shared/auth/login-errors.ts](/private/tmp/pollinations-pollen-connect-ux/shared/auth/login-errors.ts) | P05 | Source error definitions and all actual consumers together. |
| M | [shared/error.ts](/private/tmp/pollinations-pollen-connect-ux/shared/error.ts) | P10 | Default 503 wording and corresponding real consumer assertion. |


### A2. Connect files — 83

| Source status | Source file | Proposed owner | Extraction instruction |
| --- | --- | --- | --- |
| A | [operations/flow/.gitignore](/private/tmp/pollinations-pollen-connect-ux/operations/flow/.gitignore) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/capture-document.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/capture-document.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/capture-types.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/capture-types.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/captures.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/captures.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/conditions-data.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/conditions-data.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/conditions.css](/private/tmp/pollinations-pollen-connect-ux/operations/flow/conditions.css) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/conditions.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/flow/conditions.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/connect-admin.html](/private/tmp/pollinations-pollen-connect-ux/operations/flow/connect-admin.html) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/connect-example.html](/private/tmp/pollinations-pollen-connect-ux/operations/flow/connect-example.html) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/dev.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/dev.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/enter-entry.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/enter-entry.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/fixtures.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/fixtures.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/github-profile.json](/private/tmp/pollinations-pollen-connect-ux/operations/flow/github-profile.json) | P12 | Inspect use; preserve truthful fixture/reference identity and exclude unused assets. |
| A | [operations/flow/live-admin.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/flow/live-admin.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/live-client.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/live-client.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/live-example.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/flow/live-example.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/local-provider.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/local-provider.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/package.json](/private/tmp/pollinations-pollen-connect-ux/operations/flow/package.json) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-account-actions.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-account-actions.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-admin.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-admin.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-app-login.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-app-login.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-canvas-data.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-canvas-data.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-canvas.css](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-canvas.css) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-canvas.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-canvas.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-dashboard-driver.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-dashboard-driver.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-dashboard.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-dashboard.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-device.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-device.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-diagram.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-diagram.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-flows.html](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-flows.html) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-gallery-data.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-gallery-data.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-gallery.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-gallery.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-journey-state.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-journey-state.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-journey.css](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-journey.css) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-journey.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-journey.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-preview.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-preview.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-provider.css](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-provider.css) | P12 | Inspect use; preserve truthful fixture/reference identity and exclude unused assets. |
| A | [operations/flow/pollen-connect-provider.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-provider.tsx) | P12 | Inspect use; preserve truthful fixture/reference identity and exclude unused assets. |
| A | [operations/flow/pollen-connect-screen.html](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-screen.html) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-screen.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-screen.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-wallet-preview.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-wallet-preview.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/pollen-connect-window.css](/private/tmp/pollinations-pollen-connect-ux/operations/flow/pollen-connect-window.css) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/public/pollen-connect-preview/moss.png](/private/tmp/pollinations-pollen-connect-ux/operations/flow/public/pollen-connect-preview/moss.png) | P12 | Inspect use; preserve truthful fixture/reference identity and exclude unused assets. |
| A | [operations/flow/reset.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/reset.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/review-cases.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/review-cases.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/review-consent.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/review-consent.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/review-dashboard-fixtures.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/review-dashboard-fixtures.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/review-dashboard.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/review-dashboard.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/review-device-admin.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/review-device-admin.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/review-driver.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/review-driver.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/review-funding.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/review-funding.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/review-inventory.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/review-inventory.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/review-prepare.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/review-prepare.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/review-requests.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/review-requests.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/review-services.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/review-services.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/review-setup.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/review-setup.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/review-storage.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/review-storage.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/review.css](/private/tmp/pollinations-pollen-connect-ux/operations/flow/review.css) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/review.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/flow/review.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/runtime-frame.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/flow/runtime-frame.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/runtime-journey.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/flow/runtime-journey.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/runtime.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/runtime.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/screen-route.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/screen-route.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/server.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/server.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/source-styles.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/source-styles.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/test/account-actions.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/test/account-actions.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/test/captures.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/test/captures.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/test/consent-preview.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/test/consent-preview.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/test/dashboard-preview.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/test/dashboard-preview.test.ts) | P12; P09 product cases | Keep preview checks; move any standalone product regression cases with their owner. |
| A | [operations/flow/test/dev-proxy.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/test/dev-proxy.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/test/device-inventory.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/test/device-inventory.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/test/gallery-inventory.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/test/gallery-inventory.test.ts) | P12; P05 product cases | Move direct sign-in-context regression coverage to the product owner. |
| A | [operations/flow/test/live-routes.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/test/live-routes.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/test/local-provider.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/test/local-provider.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/test/local-sign-in.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/test/local-sign-in.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/test/review-cases.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/test/review-cases.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/test/review-device-admin.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/test/review-device-admin.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/test/review-inventory.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/test/review-inventory.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/test/review-requests.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/test/review-requests.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/test/review-services.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/test/review-services.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/test/runtime.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/test/runtime.test.ts) | P12; P05 product cases | Separate product-helper/cleanup regression cases from runtime integration checks. |
| A | [operations/flow/tsconfig.connect-lab.json](/private/tmp/pollinations-pollen-connect-ux/operations/flow/tsconfig.connect-lab.json) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/vite.live.config.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/vite.live.config.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/flow/vitest.config.ts](/private/tmp/pollinations-pollen-connect-ux/operations/flow/vitest.config.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
