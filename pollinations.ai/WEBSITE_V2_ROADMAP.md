# Website V2 — finalization roadmap

> Keep the personality. Make the promises precise. Make the first experience dependable.

**Updated:** 28 September 2026

**Branch / PR:** `feat/website-v2` · [#14472](https://github.com/pollinations/pollinations/pull/14472)

**Reviewed baseline:** `ee4739669c11cb67367767983706a2e3b71799f2`

**Status:** In progress; completed, partial, and deferred work is tracked below. This document changes no product behavior and authorizes no deployment or moderation action.

## 1. What we are finishing

Pollinations.ai should explain a coherent platform: models and ready-made agents, developer tools, connected user wallets, and a community that builds on them. The website should make it easy to understand the offer, try it, build with it, and contribute.

This is a focused finalization pass—not another redesign. Keep the illustrations, day/night identity, existing page structure, and shared UI language. Fix inaccurate promises, broken journeys, misleading data, and distracting presentation.

| Page | Primary job | The visitor should leave understanding… |
| --- | --- | --- |
| Hello | Explain the platform and its value | What Pollinations provides, what Pollen is, how to start, and which earning paths exist today. |
| Play | Demonstrate the product reliably | What they can generate, which agent/model is selected, what access or payment is required, and what happens to uploads. |
| Apps | Show credible community-built examples | What each app does, where it runs, whether it connects their wallet, and how to list their own app. |
| Community | Turn interest into participation | How to contribute, which decisions are open, and how the project is progressing. |

Enter is the reference for shared controls and product terminology, not a reason to turn the marketing website into a dashboard. Shared-package changes must also be checked in Enter and affected consumers.

## 2. How to read this roadmap

- **Verified:** checked against the current source or public endpoint while preparing this roadmap. Source verification is not the same as an end-to-end test.
- **Reported:** observed in the supplied reviews; reproduce before implementing. Counts, availability, and catalog order are snapshots, not permanent requirements.
- **Decision:** needs an explicit product/design/maintainer choice. Recommendations below are not approvals.
- **Deferred:** deliberately not being implemented now. Keep the finding, reason, and revisit condition; do not treat it as completed or silently resume it.

Leave a task unchecked until its acceptance criteria pass. Record the commit and validation evidence beside its ID when completed. Use one cohesive commit per task where practical; do not mix unrelated fixes or repository-wide formatting.

**Working agreement (28 September 2026):** keep this work on `feat/website-v2` and push each validated step in granular commits. Preserve other agents' work. Do not split supporting changes into separate PRs unless requested. Pushing does not authorize analytics or production deployments, secret changes, or merging the website PR.

**Roadmap upkeep:** after each step, record what changed, its commit and checks, what still needs validation, and any decision to defer or decline a proposal. Keep partially completed tasks unchecked. Older entries that say “local” or “not pushed” are historical checkpoints, not a reliable current branch status; reconcile them against Git and user validation before the final readiness review.

**Latest validated commits:** C6 `4c6504393b`; C7 scoped copy fixes `2e4e30c0c6`; V1 earnings-link layout `7c0b66e2e4`. Each was pushed after 139 website tests and the production build passed, with targeted browser checks. C7 remains partial; these checks do not close the final cross-site review.

### Deliberately not doing now

| Item | Decision / reason | Revisit condition |
| --- | --- | --- |
| D4 / V2 · Shared button contrast | Findings retained; no UI changes. Shared `@pollinations/ui` colors also affect Enter and other consumers after rebuild/deployment. Avoid a website-only override. | Agree on the shared treatment and validate affected consumers before implementing/pushing it. |
| B6 · Full app-destination sweep | User deferred the full catalog audit. This is not evidence that every listing is healthy; no bulk removals. | Revisit during final readiness review if prioritized, or investigate concrete broken links separately. |
| C4 · Publishing actions | Keep the single “Open dashboard” action. User rejected three buttons and declined creating a new publishing guide. | Reopen only if an existing suitable guide or a specific journey problem justifies changing the agreed single-action layout. |
| B3 · Weekly analytics endpoint | Source work does not authorize deployment; user chose to keep the endpoint update local. | Separate approval for staging verification and production promotion. |

### Important corrections to the reviews

| Topic | Final direction |
| --- | --- |
| Headline | Keep the shared wallet as a differentiator. Do not replace the headline with a generic “One platform” message. |
| Model earnings | Keep **75% of the model’s listed price**. It is not necessarily 75% of everything the user pays, because app earnings can add a markup. |
| App earnings | Conditional on the integration and earnings setting. Explain the existing 1 → 1.25 → 0.25 example; do not imply that merely listing an app earns usage revenue. |
| Agent earnings | Do not promise publisher revenue today. The managed-agent wrapper has no owner-set price; underlying model/tool calls can still cost Pollen. |
| Earned balances | Explain Paid versus Quest Pollen without implying either can currently be cashed out. Verify wording against billing behavior and current docs. |
| History archive | Treat the missing archive as a launch dependency, not proof that no pipeline exists. The job exists but currently excludes manual runs. |
| App popularity | The developer-total fallback applies to **non-BYOP apps**; BYOP apps already use hostname-based attribution. Fix the distinction, not an imagined universal failure. |
| Catalog sync | It runs on matching pushes to `main`, daily, and manually—not only daily. Branch-only catalog edits do not change the public feed. |
| Local styling | Website layout and artwork wrappers are legitimate. Audit overrides of shared control behavior; do not delete every local class. |
| “Pollen Pay” | This name was previously chosen. Do not automatically rename it to “Connect User Wallets”; decide consumer wording separately from developer documentation terminology. |
| App quality | Similar listings warrant evidence-based review, not an accusation of reward farming. Language, account age, or a numeric username alone proves nothing. |

## 3. Decisions to settle

These should not block independent correctness fixes.

| ID | Decision | Recommendation | Status |
| --- | --- | --- | --- |
| D1 | Keep “Every model, one wallet”? | Consider **“Hundreds of models. One wallet.”** Avoid a universal claim, retain the differentiator, and check wrapping rather than retaining the `9ch` constraint blindly. | Pending |
| D2 | What should Apps show first? | Use a maintained, representative featured selection; retain New as a deliberate choice. Do not make Popular the default until attribution is trustworthy. | Pending |
| D3 | Consumer name for connected-wallet apps | Retain **Pollen Pay** provisionally; explain it briefly and replace raw true/false labels with readable choices. Keep **Connect user wallets** in developer copy. | Pending |
| D4 | Shared button hover and keyboard-focus contrast | Preserve flat styling; review the measured dark amber hover and light focus-ring findings in V2 before any package-wide change. | Deferred; findings recorded, no color change approved |
| D5 | Who belongs in Supporters? | Have the relationship owner approve names, category, and links. A paid provider is not automatically a supporter; absence from README is not proof of an error. | Pending |
| D6 | Questionable listings and outdated votes | Maintainer reviews the evidence and decides corrections, removal, or issue closure. No automatic deletions or reward changes. | Pending |

## 4. Execution checklist

### Phase A — product correctness and trustworthy claims

Fix these before calling V2 ready for production. Removing an unsupported claim or temporarily hiding an unsupported control is preferable to displaying misleading behavior.

**A1 completed — 27 September 2026:** User validated the local result. Updated Floret's canonical ID and made it the deliberate default without replacing explicit choices. Missing selections offer the existing, enabled agent picker instead of silently changing agents. Validation: 85 website tests, formatting, type-check/production build, desktop/mobile browser checks, and an authenticated production Floret response through the website's real chat transport passed. Pushed to `feat/website-v2` as `418244f377` on 28 September; no deployment requested.

- [x] **A1 · Restore Floret and choose a dependable initial agent.** **Completed and user-validated.** The website now uses `community/pollinations-ai/floret` as the deliberate default and preserves explicit selections. If the chosen/default agent is absent, it offers an enabled selector rather than silently picking the first catalog entry. Welcome text, attachment support, and routing controls use the corrected identity. Validation evidence is recorded above. [Play sources][play-models] · [Live catalog][catalog]

- [ ] **A2 · Do not accept audio that generation ignores.** **Implemented and pushed — awaiting user validation (28 September 2026).** Keep controls driven by the live catalog's modalities and supported endpoints, not model-name allowlists. Reference-audio generation now uploads and forwards the file URL through the shared SDK; voice changing and isolation send multipart files to their declared endpoints without requiring a text prompt. Existing speech and transcription remain supported. Reference uploads use the shared temporary/public-upload notice. Validation: 96 SDK tests and 95 website tests, type-check/build, desktop/mobile UI checks, and authenticated live speech, transcription, voice-changing, isolation, and reference-music requests passed. Live test media was synthetic; the music reference needed at least 10 seconds. No catalog/backend changes. Pushed as `3448da6f6d`; no deployment requested. [Playground][playground]

- [ ] **A3 · Preserve the intended action across sign-in.** **Implemented locally — awaiting user validation (28 September 2026).** Same-tab session drafts retain the agent, media tab/task, model, prompt, routing, and generation settings for 30 minutes after the last save. No draft state goes into URLs or telemetry; files, credentials, and conversation history are not saved. Pending files get a reattach notice. Catalog loading no longer replaces restored models or resets their settings, and chat initialization preserves restored text. Validation: 107 website tests, formatting, type-check/build, a real Enter authorization round trip (user completed consent), media and routing reload checks, and mobile layout passed. The selected Pen agent and unsent text survived sign-in; video model, portrait format, 1080P resolution, 10-second duration, and Floret routing survived reload. No request was automatically sent. Not committed, pushed, or deployed. [Chat][chat] · [Playground][playground]

- [ ] **A4 · Correct catalog classification and availability scope.** **Community count fixed locally — awaiting user validation; availability deferred (28 September 2026).** The count now uses the catalog's explicit `community: true` flag and is labeled “community models and agents.” Desktop/mobile checks matched the live catalog (111 community entries; 196 official entries excluded). Regression coverage includes provider-qualified official IDs, community models and agents, and absent classification. All 108 website tests, formatting, and type-check/build passed. The live statistics endpoint does not return `official_availability`, so the website already hides it; the proposed local slash-based query remains undeployed and must be corrected before any future analytics deployment. No analytics changes or deployment in this step. **Remaining:** validate the count with the user; document and verify availability's population, time window, and denominator in staging before any separately approved production deployment. Keep the availability claim hidden until trustworthy. [Catalog stats][stats] · [Health query][health]

- [ ] **A5 · Make paid access and agent capabilities visible before generation.** **Reported UI gap.** Reuse Enter/SDK metadata for Paid-Pollen requirements, capability limits, and available health information. Distinguish a free agent wrapper from paid underlying calls; do not invent a fixed cost for variable multi-step agent work. **Done when:** users can understand why a selection needs Paid Pollen before submitting, and failed/degraded agents are not presented as a dependable default.

- [ ] **A6 · Repair first-party entry links.** **Implemented locally — awaiting user validation (28 September 2026).** Apps and Community now link to `app-submission.yml`. Browser verification opened the actual “Submit an app” form with the `APP-SUBMISSION` label; no issue was submitted. `/docs` and `/docs/` redirect GET/HEAD requests to the API documentation with HTTP 301. Live local-worker checks confirmed the redirect, including query strings, while `/docs/missing` and unrelated unknown URLs remain 404. Browser redirect verification, all 122 website tests, formatting, and the production build passed. No visual changes, commit, push, or deployment in this step. [Community links][community-page] · [Template][submission-template] · [Worker][worker]

### Phase B — discovery, community data, and launch dependencies

- [ ] **B1 · Make the Apps first impression representative.** **Reported content issue; D2 required.** Review the initial visible listings and existing featured selection for useful variety and clear descriptions. Inspect duplicate-looking apps by behavior, provenance, and submission evidence. **Done when:** the default view follows the agreed selection policy; New remains available; maintenance ownership is clear. Listing removal or reward action requires a separate maintainer decision.

- [ ] **B3 · Use only BYOP traffic for app popularity.** **Implemented locally — awaiting user validation (28 September 2026).** BYOP-only was already agreed. Popular ordering, popularity badges, and the Hello showcase now ignore non-BYOP developer totals. Other apps remain listed, with unknown usage sorted after measured usage rather than treated as zero. Weekly featured cards cannot relabel stale developer-wide daily totals as BYOP usage. The producer and shared analytics endpoints are unchanged; the separate weekly endpoint deployment remains deferred. All 139 website tests, formatting, and the production build passed; desktop/mobile browser checks confirmed non-BYOP listings remain accessible without popularity badges and no horizontal overflow. **Data caveat:** the current live directory has no BYOP app meeting the unchanged 100-requests/day showcase threshold, so Hello hides the shelf using its existing empty-state behavior; its position is unchanged. No commit, push, or deployment in this step. [Metrics producer][app-metrics] · [Showcase selection][stats]

- [ ] **B4 · Verify automatic history refresh after merge.** **Launch dependency, not a confirmed automation failure (28 September 2026).** GitHub's default `main` branch already schedules daily/weekly/monthly summary generation, but the separate PR-history refresh job exists only on website-v2. Once merged, it is configured to refresh `community-pr-history.json` on `news` daily at 06:00 UTC. The archive currently returns 404, so the website uses its bundled August 30 snapshot; summaries and images are separate news-branch data. **Done when:** the scheduled job succeeds after merge, the website reads the published archive, and coverage, dates, monthly totals, and freshness are verified. A manual archive-only action is optional recovery tooling, not required routine operation; no implementation agreed. Keep generated monthly backfill out of the website PR and leave Buffer/Discord/Reddit publishing unchanged. [History workflow][history-workflow] · [Archive URL][history-archive]

- [x] **B5 · Refresh the contribution and voting journeys.** **Implemented with user approval (28 September 2026).** “Explore open quests” links to open `POLLEN-QUEST` issues instead of the empty beginner-issue list. Login and payment votes were closed on September 26; the user explicitly chose to retain model vote #5321 unchanged. “Help shape Pollinations” now groups the four contribution cards and compact voting rows in one shared panel, with “Suggest an idea” alongside and the illustration below the content. The automatic open-question feed and explicit zero-vote message remain. **Layout decision:** do not stretch a single vote into a large, mostly empty card or place it over the characters. No issues or labels were modified. Validation: desktop/mobile browser checks, 139 website tests, formatting, and production build passed. [Community page][community-page]

- [ ] **B6 · Verify app destinations and public attribution.** **Full sweep deferred by user; not independently repeated here.** Recheck malformed URLs, persistent failures, and author display names when revisited. Distinguish bot protection and transient outages from dead apps. **Done when:** external links use valid destinations and cannot resolve accidentally as on-site paths; confirmed failures have an owner-approved correction; missing attribution does not expose an unexplained internal ID. Do not bulk-delete from the reported failure count.

- [ ] **B7 · Reconcile Supporters with actual relationships.** **Reported discrepancy; D5 required.** Compare the website, README, and current relationship records. **Done when:** the owner-approved list uses accurate supporter/partner/provider distinctions and valid destinations. Counts alone are not acceptance criteria. [Community data][community-data]

### Phase C — copy, positioning, and reading order

Preserve working copy. Make surgical changes, not a second blanket rewrite.

- [x] **C1 · Explain Pollen at first mention.** **Approved and implemented (28 September 2026).** The Hello intro now reads: “Build AI apps with models, ready-made agents, and shared infrastructure. Pay for usage with Pollen, our platform credit—buy it or earn it through Quests.” The headline and layout remain unchanged; detailed wallet rules stay further down the page. No dollar-equivalence or cash-redemption promise is added. [Hello][hello]

- [x] **C2 · Make the two hero actions match their destinations.** **Approved and implemented (28 September 2026).** “Start for free” sends visitors to `https://enter.pollinations.ai/keys`, using Enter's existing sign-in flow. The first-key quest awards 0.25 Quest Pollen and is automatically claimed; do not imply unlimited generation or access to Paid-only models. “Read the docs” now opens `https://gen.pollinations.ai/docs#tag/quick-start`, verified in the live documentation to show the first API examples. Both labels and button styles are preserved; the general Docs menu still opens the overview.

- [x] **C3 · Explain the platform without implying app hosting exists today.** **Approved and implemented (28 September 2026).** Build now reads: “Build with models and agents, connect user wallets, and add tools through one platform.” Agent publishing uses “the user’s Pollen” instead of “the caller’s Pollen.” The existing distinction between ready-made and published agents remains; app listing is described as discovery and app hosting stays under “On the way.” No layout or feature changes. [Build and publishing cards][devkit]

- [ ] **C4 · Clarify publishing journeys without adding CTA clutter.** **Deferred; retain the single “Open dashboard” button.** User rejected three separate buttons and declined creating a new guide. The original three-action proposal is not the implementation plan. If reopened, use existing destinations to clarify app listing, model publishing, and agent publishing without implying that listing means hosting or deploying an app.

- [ ] **C5 · Make earnings understandable without changing their meaning.** **Example simplified with user approval (28 September 2026):** “With app earnings enabled, 1 Pollen of usage costs the user 1.25 Pollen. Your app earns 0.25 Pollen.” The user explicitly chose to omit the cashout sentence from this note. Separate model/app/agent rows and documentation links remain; model earnings stay tied to listed price. **Remaining:** review whether Paid/Quest earnings distinctions need supporting explanation, verifying any proposed wording against billing and publishing docs before adding it. Do not promise agent earnings today, cash redemption, app self-usage rewards, or 75% of a marked-up total. [Earnings section][money]

- [x] **C6 · Keep privacy notices short and correctly linked.** **Approved and implemented (28 September 2026).** Keep “May use third-party models and tools. Don’t share sensitive information.” The shared upload notice now reads “Uploaded files are public and stored temporarily.” and links to Privacy, whose retention section covers uploaded media. Existing placement, quiet styling, and attachment-dependent visibility remain unchanged; no new card or tooltip.

- [ ] **C7 · Finish a terminology and copy-layout pass.** **Approved fixes implemented (28 September 2026):** navigation uses “Sign in” on desktop and mobile; Pollen Pay displays “Yes / No” while retaining boolean filter values; homepage search/social descriptions and the no-JavaScript fallback use the approved intro explaining Pollen. **Remaining final pass:** use Pollinations.ai consistently; keep “model publisher,” “app developer,” and “agent publisher” meaningful; distinguish listing, publishing, and hosting. Resolve D3 before renaming Pollen Pay. **Done when:** CTA labels, icons, descriptions, headings, metadata, and destinations agree across Hello, Play, Apps, Community, and Enter. Avoid unsupported “all/every/free” claims and hardcoded live counts.

### Phase D — quiet, consistent visual polish

- [x] **Community votes · Remove the standalone divider.** **Implemented (28 September 2026).** Removed only the horizontal rule above the vote/suggestion row; retained its 20px top padding. Browser computed styles confirmed a 0px border and unchanged padding.

- [x] **Homepage opening · Explain, show the tools, then introduce Quests.** **Approved and implemented (28 September 2026).** Hero now reads “Build with AI. Everything connected.” with the approved API/agents/wallets introduction and Pollen explained as credits. Keep “Start for free” in the hero for direct onboarding; “Read the docs” is a quieter shared inline link. Tools now follow the hero, then the simplified Quests card with one “Explore Quests” action. Removed the duplicate key CTA and key-security aside from this marketing card; no API documentation or security behavior changed. Search/social metadata and no-JavaScript copy match. Artwork, mobile 20px gutters, and Live Now placement are preserved. Verified section order, link destinations, and 320/390/768/1280px overflow checks.

- [x] **Homepage counts · Put numbers beside their purpose.** **Approved and implemented (28 September 2026).** Removed the hero statistics strip and its unused component. The existing live catalog counts appear as small muted labels under “One API, every model” and “Ready-made agents”; the API description no longer repeats an approximate count. Missing data shows no invented value. Weekly traffic, MCP server count, and availability are not promoted in the homepage hero. Shared statistics loading and Community remain unchanged. Verified desktop/light and mobile/dark layouts, live labels, and no horizontal overflow; all 139 tests and the production build passed.

- [x] **V1 · Keep earnings documentation icons beside their text.** **Implemented and verified (28 September 2026).** Each shared documentation link is a non-shrinking inline-flex unit beside wrapping earnings text. The book and external arrow stay together, with a 24px-high hit area, descriptive accessible name, and visible keyboard focus. Verified desktop, tablet, and 320/390px mobile widths. Existing white earnings text, link colors, and destinations are unchanged. [Earnings section][money]

- [ ] **V2 · Fix CTA contrast through the shared UI contract.** **Audited 28 September 2026; changes deferred, D4 required.** Homepage primary/secondary CTA text measured approximately 8–15:1 in both themes. Shared dark amber controls used by Play and Apps are approximately 4.50:1 at rest; their declared hover colors calculate to approximately 3.30:1. The light-mode keyboard ring is approximately 1.42:1 against the page surface; dark focus is stronger. These are computed-color estimates, not a complete screenshot/pixel audit of every state or consumer. Keyboard focus was inspected in the browser; hover colors were checked against shared source and resolved theme tokens. **Proposed, not implemented:** darken the shared amber hover fill and strengthen the light focus ring, preserving the flat design. A package change affects Enter and other consumers after rebuild/deployment, not just website-v2; do not add a website-only override. **Revisit:** agree on the shared treatment, check normal/hover/focus/active/disabled states in both themes, and validate Enter plus affected apps before pushing. **Done when:** enabled normal-size text meets 4.5:1 contrast, large text meets 3:1, and focus is visible. Preserve shared authentication behavior and naming; no one-off auth redesign.

- [x] **V3 · Make votes and voice selection fit their content.** **Completed (28 September 2026).** Votes use B5's compact rows. Voice selection now uses the shared searchable combobox beside the model picker, wrapping on mobile, with a bounded scrolling list. Options come only from the selected model's catalog voices; unmatched search text never replaces the valid selection. Existing model-change validation and draft persistence remain. Verified keyboard search/selection, Escape, empty search results, model-specific voice reset, reload persistence, absence for transcription, and desktop/mobile layouts in light/dark themes. All 139 website tests, formatting, and production build passed; no generation requests or shared-package changes. [Community page][community-page] · [Playground][playground]

- [x] **V4 · Rebalance mobile branding and illustration weight.** **Reviewed; mobile edge-to-edge follow-up implemented (28 September 2026).** Keep the compact logo/menu, existing artwork, and page worlds; no wordmark addition, image resizing, or regeneration. Below 640px, top-level website sheets reach both viewport edges and retain their rounded corners. User clarified the mobile content gutter must match Enter's 20px: page content, hero copy, header control, and the full-width earnings section now align to that inset; hero/closing art remains full bleed. Layouts at 640px and above are unchanged. Removed the reserved two-sided scrollbar gutter below that breakpoint so it cannot inset the sheets. Website-only change; shared UI and Enter are untouched. Browser checks covered all four routes at 390px in both themes, plus 320/639/640/1280px shell measurements and Play at 768px; the 20px follow-up was measured across all four routes at 320/390/640/1280px with no document-width overflow. Mobile navigation and Audio controls remained usable. All 139 tests and the production build passed.

- [ ] **V5 · Run the final layout and performance pass.** **Partial audit at `276bba08bf` (28 September 2026); no product changes.** All four routes passed document-width overflow checks at 375/768/1280px in both themes; sampled loaded images reported no failures. Responsive heroes selected 1024px variants on smaller viewports and retained high loading priority. Community's journal remained 530.75px high across the sampled August/July month change at 375px; Apps search showed a usable no-results state. Carousel fixed-height copy and reduced-motion guards were inspected in source, not fully exercised live: the current feed exposes no featured carousel. **Production build passed. Asset baseline:** entry + vendor JS approximately 169KB gzip, CSS 18KB gzip, Play route 91KB gzip; four font files total approximately 189KB uncompressed WOFF2. Current hero 1024px files are 26–60KiB; all V2 artwork totals approximately 3.2MiB on disk, not per-page transfer. The older V1 set remains on disk and is not selected by `ART_SET`; no assets were deleted. **Remaining before sign-off:** hosted production-build loading benchmarks (LCP/CLS and network/cache behavior), actual 200% zoom and reduced-motion interaction checks, populated featured-carousel navigation/height checks, and long-content/chat-growth edge cases. Current localhost development checks are not a real-device performance benchmark or a complete no-layout-shift guarantee. Preserve the Live Now position and the reverted participation-card layout.

## 5. Validation gates

### Before calling an implementation task done

- [ ] Reproduce the issue against the current PR head; distinguish source evidence from runtime evidence.
- [ ] Run relevant existing tests and add targeted coverage for the real contract, not only fixtures preserving old IDs.
- [ ] Run formatting checks on changed source files and a production build. From the repository root, the website commands are `npm test --prefix pollinations.ai` and `npm run build --prefix pollinations.ai`.
- [ ] For shared UI/SDK changes, run the owning package’s checks and inspect affected Enter screens. Do not broaden a website fix into an unreviewed shared redesign.
- [ ] Complete required authenticated/end-to-end checks with existing authorized test access. Keep credentials out of output; ask for a secure access location if missing rather than silently skipping tests.

### Final browser matrix

| Surface | Required checks |
| --- | --- |
| Every public page | Light/dark; roughly 375px, 768px, and 1280px; keyboard navigation; focus; 200% zoom; reduced motion; loading/empty/error states. |
| Hello | First-visit comprehension; CTA destinations; real count definitions; earnings links/math; section order; above-the-fold visual balance. |
| Play | Logged out/in; authorization return; insufficient/Paid-only balance; curated default absent/unavailable; every supported media path; attachments; inline media; copy/clear/download controls; privacy notices. |
| Apps | Default, New, Popular; search; single category; platform/Pollen Pay filters; URL/back-button state; empty results; valid external links; carousel height and keyboard controls. |
| Community | Zero/one/multiple votes; contribution links; live/stale/unavailable counters; month selection; all-time monthly points; month-view daily points; journal sizing and images; archive coverage. |
| Enter / shared consumers | Connect/sign-in, menus, buttons, dropdowns, theme states, and any screen touched by a shared-component change. |
| Worker / public URLs | Direct route loads, `/docs`, legal links, intentional 404s, metadata/canonical URLs, cache behavior, and preview-versus-production differences. |

## 6. Release order and scope boundaries

1. **Implement and validate Phase A**, then data/discovery work in Phase B. Copy and isolated layout fixes can proceed while product decisions are pending.
2. **Validate the complete branch locally and at the fixed preview URL.** Record results and unresolved items; do not equate a successful build with approval to merge.
3. **Merge only with the requested approval.** Do not assume this roadmap authorizes a merge, push, new PR, secret mutation, or production deployment.
4. **Complete launch prerequisites after merge:** publish the history archive once; verify the catalog sync picked up approved changes; validate/deploy any required analytics change through the permitted staging-first process. If a data dependency is not ready, omit the dependent claim instead of fabricating a fallback value.
5. **Promote through the normal release path.** Production Cloudflare deployments run through approved GitHub Actions from `production`, following the separate promotion PR. No local production Worker deployment.
6. **Smoke-test the public site and dependencies.** Confirm the expected build, links, feed freshness, count scopes, auth flow, and core generation paths. Have a rollback plan for the website and any separately deployed data change.

Out of scope without a separate decision: bulk catalog deletion, reward revocation, supporter/endorsement claims, closing votes, changing social publishing behavior, secret rotation, and generating replacement artwork kits. Generated monthly backfill must not be bundled into the website PR.

## 7. Definition of done

- [ ] Phase A blockers are fixed and tested; no misleading claim or silently ignored input remains.
- [ ] Every Phase B–D task is completed or explicitly deferred with an owner and reason.
- [ ] Decisions D1–D6 and the mobile-branding choice are recorded; the implemented result matches them.
- [ ] Earnings, wallet, access, privacy, and hosting copy match the product—not an aspirational future version.
- [ ] The browser matrix and affected shared consumers pass, with evidence attached to the relevant task/PR.
- [ ] Launch prerequisites are verified independently from frontend deployment.
- [ ] Final diff contains only intended changes; commits are cohesive; no secrets or generated backfill are included.
- [ ] Maintainer signs off on merge and release separately.

## Deferred — reconsider after all other fixes and validation

- [ ] **B2 · Review catalog description truncation.** **Deferred by the website owner (28 September 2026).** Submission ingestion slices descriptions at 200 characters, allowing mid-word endings. Revisit only after the rest of the website is corrected and validated; this is not a current launch blocker. Discuss explicit length validation and a separate cleanup of existing clipped descriptions, then agree on scope before implementing. No catalog or ingestion changes are approved in this step. Any eventual fix must be checked in the public feed after sync. [Ingestion][submission] · [Catalog sync][catalog-sync]

## Evidence and limitations

This roadmap reconciles the original website review with the supplied review-of-the-review. Source checks were repeated at the baseline above; public checks confirmed the new Floret identity and the missing history archive. It is **not** a fresh full-browser certification, paid-generation test, or repeated audit of every external app URL.

The second review’s exact traffic totals, model counts, failed-link totals, contrast measurement, and listing-quality judgments remain dated observations to recheck. Its introductory statement that the earnings icons “wrap correctly” conflicts with its final confirmed-defect table; use the explicit visual reproduction gate in V1 rather than treating both as facts.

The Pollinations app-review guidelines informed the shared SDK/UI, theme, and validation gates. Marketing-page layout is intentionally not forced into the compact app-shell pattern.

[play-models]: https://github.com/pollinations/pollinations/blob/ee4739669c11cb67367767983706a2e3b71799f2/pollinations.ai/src/ui/play/chat-models.ts
[catalog]: https://gen.pollinations.ai/models
[chat]: https://github.com/pollinations/pollinations/blob/ee4739669c11cb67367767983706a2e3b71799f2/pollinations.ai/src/ui/play/Chat.tsx
[playground]: https://github.com/pollinations/pollinations/blob/ee4739669c11cb67367767983706a2e3b71799f2/pollinations.ai/src/ui/play/Playground.tsx
[stats]: https://github.com/pollinations/pollinations/blob/ee4739669c11cb67367767983706a2e3b71799f2/pollinations.ai/src/data/publicStats.ts
[health]: https://github.com/pollinations/pollinations/blob/ee4739669c11cb67367767983706a2e3b71799f2/enter.pollinations.ai/observability/endpoints/weekly_health_stats.pipe
[community-page]: https://github.com/pollinations/pollinations/blob/ee4739669c11cb67367767983706a2e3b71799f2/pollinations.ai/src/routes/community.tsx
[community-data]: https://github.com/pollinations/pollinations/blob/ee4739669c11cb67367767983706a2e3b71799f2/pollinations.ai/src/data/community.ts
[submission-template]: https://github.com/pollinations/pollinations/blob/ee4739669c11cb67367767983706a2e3b71799f2/.github/ISSUE_TEMPLATE/app-submission.yml
[worker]: https://github.com/pollinations/pollinations/blob/ee4739669c11cb67367767983706a2e3b71799f2/pollinations.ai/src/worker.ts
[submission]: https://github.com/pollinations/pollinations/blob/ee4739669c11cb67367767983706a2e3b71799f2/operations/app-management/ingestion/submission.js
[catalog-sync]: https://github.com/pollinations/pollinations/blob/ee4739669c11cb67367767983706a2e3b71799f2/.github/workflows/data-sync-app-catalog-tinybird.yml
[app-metrics]: https://github.com/pollinations/pollinations/blob/ee4739669c11cb67367767983706a2e3b71799f2/operations/app-management/performance/update-metrics.js
[history-workflow]: https://github.com/pollinations/pollinations/blob/ee4739669c11cb67367767983706a2e3b71799f2/.github/workflows/news-generate-summary.yml
[history-archive]: https://raw.githubusercontent.com/pollinations/pollinations/news/operations/social/news/community-pr-history.json
[hello]: https://github.com/pollinations/pollinations/blob/ee4739669c11cb67367767983706a2e3b71799f2/pollinations.ai/src/routes/index.tsx
[devkit]: https://github.com/pollinations/pollinations/blob/ee4739669c11cb67367767983706a2e3b71799f2/pollinations.ai/src/ui/home/DevKit.tsx
[money]: https://github.com/pollinations/pollinations/blob/ee4739669c11cb67367767983706a2e3b71799f2/pollinations.ai/src/ui/home/MoneyMoves.tsx
