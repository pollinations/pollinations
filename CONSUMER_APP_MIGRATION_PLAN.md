# Consumer app migration

Agreed 2026-10-30. Make apps independent first, extract them next, remove their
monorepo copies after verification. Operations stay in place. Open WebUI moves last.

## Sequence

1. **Check existing repositories first — every app.** Search Pollinations repos,
   including private and archived ones, and the app's upstream links. Compare code,
   history, licenses, branches, and deployments before selecting a destination.
   Reuse a suitable existing repository; create one only when none fits.
2. **Migrate one low-use app per PR, starting with Websim.** Make it independent in
   its destination repository using published packages. Test that repository's
   build, deployment, login, and generation. Transfer deployment ownership, then
   remove the monorepo copy in the same app's migration PR. Preserve attribution
   and current addresses; prevent competing deployments. Expand PR #18751 for
   Websim rather than adding a separate preparation or cleanup PR.
3. **Move domains separately.** Publish static apps through Pollinations Sites;
   retain backend Workers where needed. Verify new `.app` addresses, login,
   generation, assets, and deep links before redirecting old `.ai` addresses.
   Account for Gen's existing `.app` wildcard, registered callbacks, site-name
   ownership, and the five-sites-per-account limit.
4. **Migrate Open WebUI last.** Extract its deployment code while preserving its
   container, database, configuration, and existing user data. Verify login,
   conversation history, generation, and integrations before changing its domain.
5. **Complete community handoffs.** Use the same verified migration sequence under
   accepting maintainers' own repositories and Pollinations accounts. Remove each
   app and its deployment registration in its own migration PR; preserve catalog
   links and redirects.
6. **Reorganize remaining services — separate PR.** Review the home of MCP and
   agent services after consumers are gone. Keep existing API endpoints stable;
   leave operations applications and their folder unchanged.

## Destinations

| App | Repository/account owner | Planned destination |
| --- | --- | --- |
| CatGPT | Reuse [pollinations/catgpt](https://github.com/pollinations/catgpt) after comparison | `catgpt.pollinations.app` |
| OpenClaw | Pollinations, separate repository | `openclaw.pollinations.app` |
| Sirius Elevator | Reuse [existing Sirius repository](https://github.com/pollinations/sirius-cybernetics-elevator-challenge) after comparison | `sirius-elevator.pollinations.app` |
| Websim | [pollinations/websim](https://github.com/pollinations/websim), created after inventory check | `websim.pollinations.app` |
| Open WebUI | Pollinations, separate repository; migrate last | `openwebui.pollinations.app` |
| AI Dungeon Master | Proposed: `codevector-2003` | `ai-dungeon-master.pollinations.app` |
| Map to Isometric | Proposed: `AdityaTel89` | `map-to-isometric.pollinations.app` |
| Product Packaging Designer | Proposed: `prateekverma145` | `product-packaging-designer.pollinations.app` |
| Virtual Makeup | Proposed: `anmolsah` | `virtual-makeup.pollinations.app` |
| Opposite Prompt Generator | Proposed: `AnkitAnandMastery17` | `opposite-prompt-generator.pollinations.app` |
| Changelog Generator | Unresolved: review owner and functionality | Keep current address pending decision |

Maintainer acceptance is pending. Prepare outreach for review before sending it.
No app is automatically removed because a maintainer has not replied.

Repository inventory checked on 2026-10-30: 128 accessible Pollinations repos,
including 85 archived repos. CatGPT contains the original comic app and already
has GitHub Pages deployments. Sirius contains an older Next.js implementation;
no GitHub deployment records were returned. Preserve their existing history and
visibility. Before extraction, no matching organization repository was found for Websim, OpenClaw,
Open WebUI, or the six community apps listed above. Recheck before each migration;
a name match alone is not permission to overwrite existing work.

After verification, old website addresses redirect with HTTP 301 to their new
destinations, preserving relevant paths and query strings. Sirius's old address
is `sirius-cybernetics-elevator-challenge.pollinations.ai`. Update the existing
`chat.pollinations.ai` redirect when Open WebUI moves; preserve the React
showcase's redirect to the UI documentation.

MCP, Floret, Mama Barbara, Polli, and operations retain their existing endpoints.
Older Cloudflare projects and the other app directories require a separate
ownership review; absence of a deploy manifest does not prove they are unused.

## Validation and rollback

- Each app: isolated installs/builds, declared checks, and relevant browser/API
  checks using published dependencies, followed by verification from its actual
  destination repository before removing the monorepo copy.
- Before extraction: make license/attribution and standalone dependencies explicit.
- Before cutover: verify the replacement and keep the old deployment available.
  Restore old routing if the replacement fails. Delete hosting resources only
  after the replacement and a subsequent deployment are verified.
- Production changes run through GitHub Actions. Any required credential mutation
  needs its separately scoped approval; existing credentials may be used normally.
- Complete required validation before opening each PR. Record any missing access
  promptly rather than silently skipping authenticated checks.

## Progress

- [x] Audit repository deployments and agree the extraction sequence.
- [x] Check existing Pollinations repositories; identify CatGPT and Sirius homes.
- [x] Prepare and verify standalone builds for the five Pollinations-owned
  consumers. Websim now uses published SDK/UI packages in its own repository;
  CatGPT and OpenClaw render independently, Sirius builds independently, and
  Open WebUI passes its existing deployment dry-run independently.
- [x] Extract and deploy Websim from [its own repository](https://github.com/pollinations/websim).
  Preserve 17 app-history commits and the MIT license. Build CI, Worker dry-run,
  desktop/mobile rendering, PKCE request, and live authenticated generation pass.
  A dedicated account-owned token has Editor access to Websim alone. The existing
  Worker, asset binding, and both domains are verified. PR #18751 removes its
  monorepo source and deployment manifest; merge and production promotion remain.
- [ ] Finish Websim deployment handoff. Once #18751 reaches the monorepo's
  production branch, set `AUTO_DEPLOY=true` in `pollinations/websim` and verify
  its next production deployment. Until then, new-repo deployments are manual.
- [ ] Extract CatGPT, OpenClaw, and Sirius using the same sequence.
- [ ] Move verified destinations to `.app` and add redirects.
- [ ] Extract and migrate Open WebUI.
- [ ] Complete accepted community handoffs and remove migrated source.
- [ ] Reorganize remaining services separately.
