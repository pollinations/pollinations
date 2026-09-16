# Connect branch extraction and delivery plan

**Date:** 16 September 2026

**Status:** Planning only. No extraction branches, PRs, deployments, or credential operations are authorized by this document.

**Purpose:** Deliver the useful changes from the Connect branch as small, coherent new PRs, preserve current main's functionality, and publish the Connect review app in one final PR.

Read the [PR structure](#6-proposed-pr-structure), [dependency order](#7-dependency-order-and-execution-waves), [mixed-file rules](#8-mixed-files-and-atomic-changes), and [execution checklist](#12-extraction-procedure) first. The [appendix](#appendix-a--complete-source-file-ownership-inventory) accounts for every changed source file.

## 1. Decision in one paragraph

Keep the existing branch as the reference for the work. Start each approved extraction from the then-current main, carrying over specific behaviors and their tests rather than replacing files with older branch versions. Deliver SDK recovery, shared UI, shared form controls, individual flow fixes, and independent editorial changes in separate PRs. Keep App and Device authorization together because they share the same implementation. Preserve main's wallet pages, Stripe return contracts, managed code agents, and publisher icons. Connect lands last, using the resulting product code directly. Its fixtures, captures, and navigation must demonstrate the declared situations; importing real components alone does not establish correctness.

## 2. Frozen references and confidence

**Revision:** Main merge, SDK reconciliation and residual inventory updated 16 September 2026. P01–P12 are planning IDs, not GitHub PR numbers.

| Reference | Value |
| --- | --- |
| Repository workspace | /private/tmp/pollinations-pollen-connect-ux |
| Source branch | codex/pollen-connect-ux |
| Source HEAD / completed main merge | e312c989414cb8834fa195d36c3bc7ddcea23e28 |
| Preserved pre-merge branch parent | d7dac212ad6808e248608d0597e59c2f2b381599 |
| Merged main parent / inventory baseline | 44a3f92e5b6e33fb79cf034362d1fc36bf488d8e |
| Included main work | #14936 simplified SDK auth; #14917 DialogHeader/DialogFooter; intervening main changes |
| Remaining code delta against merged main | 230 files; +27,698 / −4,062 text lines |
| Connect files / other files | 83 / 147 |
| Commits relative to merged main | 106 source-only; 0 main-only |
| Snapshot scope | Code at e312c98941; this plan is recorded in a separate documentation commit |


The first plan described the pre-merge branch against merge base 8236a3df6179a066511a5c262bcd2457029ec552 (234 files). That is historical context, not the extraction inventory. The merge preserves the entire previous branch as its first parent and reconciles main’s newer features with the accepted branch UI.

The appendix is the exact **44a3f92e5b → e312c98941** code delta. Main is an ancestor. The six SDK React files from P01 now match main exactly and have been removed from the residual inventory. The seven unexplained working-tree deletions were restored before the merge; no product code was lost through those deletions. Refresh the inventory after later main integrations; never apply the entire delta as one PR.

GitHub inspection covered metadata and file lists for 188 open PRs, including all 293 files in #14472. Relevant bodies and selected patches informed section 9. This is an overlap assessment, not a full correctness audit of 188 PRs. Recheck status, head, mergeability and CI for each extraction. File overlap alone is neither duplication nor a blocker.

### Post-merge evidence and limits

At e312c98941:

- SDK: 92 tests; UI: 71 tests; focused Enter model/authorization/device helpers: 118 tests; Connect non-credential suite: 238 tests. All 519 passed.
- SDK, UI and Connect typechecks and builds passed. Connect’s typecheck/build also includes the Enter frontend source.
- Connect socket tests passed with local socket permission after the sandbox initially blocked Vite and Miniflare listeners.
- Biome passed with three existing non-null-assertion warnings in review-inventory.test.ts. Diff checks passed. The commit hook reported that lefthook was unavailable; checks above were run explicitly.
- Credential-issuing runtime/login/capture suites and a fresh visual review were not run in this merge batch. Earlier captures are historical evidence only.
- Startup validation, its retry API, and its Connect situation were removed. OAuth callback waiting/errors and real account-request recovery remain. The Map now routes saved-key restoration directly to the connected account panel.
- Shared dialogs use main’s new header/footer compositions while retaining the branch’s copy, actions and layout. Model filter tokens include main’s new Status filter.

The merge and reconciliation are local commits; no push, new PR or deployment is part of this update.

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
| P02 | refactor(ui): align shared controls and accessibility | UI | Current main; subtract baseline #14855/#14917 work | Controls, focus, spacing and tokens |
| P03 | refactor(ui): share account and authentication presentation | UI | P01, P02 | Shared account, sign-in, error and wallet presentation |
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
| P03 | codex/ui-auth-account-presentation |
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

**First delivery (P03a):** shared account avatar/dashboard link and menu trigger, with existing AppUserMenu and Enter identity consumers. Keep destinations caller-owned, preserve menus without a dashboard link, and omit unused layout/portal options. Authentication, funding and error behavior remain separate follow-ups within P03; this first PR does not complete the whole group.

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

- Own operations/connect, root workspace/scripts/lockfile changes, and Connect CI.
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
| Connect | npm --prefix /private/tmp/pollinations-pollen-connect-ux/operations/connect run build; explicitly selected safe tests and capture checks |

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

1. P01 is complete on main as #14936. Preserve its narrower merged behavior: no startup validation request and no `retryConnection` API. Do not reopen the merged PR or restore those rejected additions from the source branch.
2. Start with P02’s proposed dialog-tooltip slice: reproduce the existing behavior, then extract only the justified fix and regression test. Keep broader visual changes separately reviewable.
3. Obtain approval for the next extraction branch/worktree before creating it. Use current main as the base; preserve main’s DialogHeader/DialogFooter and other intervening work.
4. P03’s SDK reconciliation is complete. Refresh the relevant hunk ledger against then-current main; the appendix is a residual ownership inventory, not an apply-ready patch.
5. Keep #12320’s server revocation and connected-app management separate; KeyInfo.id remains P08. Resolve remaining navigation and top-up overlaps before P07/P08/P11 publication, and land Connect last.

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
| A | [operations/connect/.gitignore](/private/tmp/pollinations-pollen-connect-ux/operations/connect/.gitignore) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/capture-document.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/capture-document.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/capture-types.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/capture-types.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/captures.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/captures.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/conditions-data.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/conditions-data.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/conditions.css](/private/tmp/pollinations-pollen-connect-ux/operations/connect/conditions.css) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/conditions.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/connect/conditions.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/connect-admin.html](/private/tmp/pollinations-pollen-connect-ux/operations/connect/connect-admin.html) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/connect-example.html](/private/tmp/pollinations-pollen-connect-ux/operations/connect/connect-example.html) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/dev.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/dev.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/enter-entry.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/enter-entry.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/fixtures.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/fixtures.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/github-profile.json](/private/tmp/pollinations-pollen-connect-ux/operations/connect/github-profile.json) | P12 | Inspect use; preserve truthful fixture/reference identity and exclude unused assets. |
| A | [operations/connect/live-admin.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/connect/live-admin.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/live-client.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/live-client.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/live-example.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/connect/live-example.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/local-provider.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/local-provider.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/package.json](/private/tmp/pollinations-pollen-connect-ux/operations/connect/package.json) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-account-actions.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-account-actions.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-admin.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-admin.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-app-login.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-app-login.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-canvas-data.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-canvas-data.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-canvas.css](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-canvas.css) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-canvas.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-canvas.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-dashboard-driver.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-dashboard-driver.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-dashboard.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-dashboard.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-device.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-device.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-diagram.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-diagram.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-flows.html](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-flows.html) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-gallery-data.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-gallery-data.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-gallery.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-gallery.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-journey-state.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-journey-state.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-journey.css](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-journey.css) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-journey.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-journey.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-preview.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-preview.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-provider.css](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-provider.css) | P12 | Inspect use; preserve truthful fixture/reference identity and exclude unused assets. |
| A | [operations/connect/pollen-connect-provider.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-provider.tsx) | P12 | Inspect use; preserve truthful fixture/reference identity and exclude unused assets. |
| A | [operations/connect/pollen-connect-screen.html](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-screen.html) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-screen.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-screen.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-wallet-preview.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-wallet-preview.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/pollen-connect-window.css](/private/tmp/pollinations-pollen-connect-ux/operations/connect/pollen-connect-window.css) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/public/pollen-connect-preview/moss.png](/private/tmp/pollinations-pollen-connect-ux/operations/connect/public/pollen-connect-preview/moss.png) | P12 | Inspect use; preserve truthful fixture/reference identity and exclude unused assets. |
| A | [operations/connect/reset.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/reset.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/review-cases.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/review-cases.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/review-consent.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/review-consent.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/review-dashboard-fixtures.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/review-dashboard-fixtures.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/review-dashboard.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/review-dashboard.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/review-device-admin.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/review-device-admin.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/review-driver.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/review-driver.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/review-funding.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/review-funding.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/review-inventory.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/review-inventory.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/review-prepare.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/review-prepare.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/review-requests.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/review-requests.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/review-services.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/review-services.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/review-setup.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/review-setup.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/review-storage.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/review-storage.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/review.css](/private/tmp/pollinations-pollen-connect-ux/operations/connect/review.css) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/review.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/connect/review.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/runtime-frame.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/connect/runtime-frame.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/runtime-journey.tsx](/private/tmp/pollinations-pollen-connect-ux/operations/connect/runtime-journey.tsx) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/runtime.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/runtime.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/screen-route.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/screen-route.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/server.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/server.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/source-styles.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/source-styles.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/test/account-actions.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/test/account-actions.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/test/captures.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/test/captures.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/test/consent-preview.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/test/consent-preview.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/test/dashboard-preview.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/test/dashboard-preview.test.ts) | P12; P09 product cases | Keep preview checks; move any standalone product regression cases with their owner. |
| A | [operations/connect/test/dev-proxy.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/test/dev-proxy.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/test/device-inventory.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/test/device-inventory.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/test/gallery-inventory.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/test/gallery-inventory.test.ts) | P12; P05 product cases | Move direct sign-in-context regression coverage to the product owner. |
| A | [operations/connect/test/live-routes.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/test/live-routes.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/test/local-provider.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/test/local-provider.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/test/local-sign-in.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/test/local-sign-in.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/test/review-cases.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/test/review-cases.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/test/review-device-admin.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/test/review-device-admin.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/test/review-inventory.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/test/review-inventory.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/test/review-requests.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/test/review-requests.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/test/review-services.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/test/review-services.test.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/test/runtime.test.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/test/runtime.test.ts) | P12; P05 product cases | Separate product-helper/cleanup regression cases from runtime integration checks. |
| A | [operations/connect/tsconfig.connect-lab.json](/private/tmp/pollinations-pollen-connect-ux/operations/connect/tsconfig.connect-lab.json) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/vite.live.config.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/vite.live.config.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
| A | [operations/connect/vitest.config.ts](/private/tmp/pollinations-pollen-connect-ux/operations/connect/vitest.config.ts) | P12 | Keep/adapt to the merged product tree; exclude only confirmed unused code. |
