# Consumer app migration

Agreed 2026-10-30. Make apps independent first, extract them next, remove their
monorepo copies after verification. Operations stay in place. Open WebUI moves last.

## Sequence

1. **Make consumers standalone — first PR.** Replace repository-local dependencies
   with published npm packages where needed. Prove that each app builds or runs
   from an isolated copy. Preserve current behavior and deployment addresses.
2. **Extract low-use apps.** Create separate Pollinations repositories for CatGPT,
   OpenClaw, Sirius, and Websim. Preserve licenses and contributor attribution.
   Transfer CI/deployment ownership one app at a time, retaining current addresses
   initially and preventing competing deployments from the two repositories.
3. **Move domains separately.** Publish static apps through Pollinations Sites;
   retain backend Workers where needed. Verify new `.app` addresses, login,
   generation, assets, and deep links before redirecting old `.ai` addresses.
   Account for Gen's existing `.app` wildcard, registered callbacks, site-name
   ownership, and the five-sites-per-account limit.
4. **Migrate Open WebUI last.** Extract its deployment code while preserving its
   container, database, configuration, and existing user data. Verify login,
   conversation history, generation, and integrations before changing its domain.
5. **Remove migrated consumers — cleanup PR.** Remove source and deployment
   registrations only after their replacements work independently. Preserve
   catalog links and redirects. Community handoffs use the same sequence under
   accepting maintainers' own repositories and Pollinations accounts.
6. **Reorganize remaining services — separate PR.** Review the home of MCP and
   agent services after consumers are gone. Keep existing API endpoints stable;
   leave operations applications and their folder unchanged.

## Destinations

| App | Repository/account owner | Planned destination |
| --- | --- | --- |
| CatGPT | Pollinations, separate repository | `catgpt.pollinations.app` |
| OpenClaw | Pollinations, separate repository | `openclaw.pollinations.app` |
| Sirius Elevator | Pollinations, separate repository | `sirius-elevator.pollinations.app` |
| Websim | Pollinations, separate repository | `websim.pollinations.app` |
| Open WebUI | Pollinations, separate repository; migrate last | `openwebui.pollinations.app` |
| AI Dungeon Master | Proposed: `codevector-2003` | `ai-dungeon-master.pollinations.app` |
| Map to Isometric | Proposed: `AdityaTel89` | `map-to-isometric.pollinations.app` |
| Product Packaging Designer | Proposed: `prateekverma145` | `product-packaging-designer.pollinations.app` |
| Virtual Makeup | Proposed: `anmolsah` | `virtual-makeup.pollinations.app` |
| Opposite Prompt Generator | Proposed: `AnkitAnandMastery17` | `opposite-prompt-generator.pollinations.app` |
| Changelog Generator | Unresolved: review owner and functionality | Keep current address pending decision |

Maintainer acceptance is pending. Prepare outreach for review before sending it.
No app is automatically removed because a maintainer has not replied.

After verification, old website addresses redirect with HTTP 301 to their new
destinations, preserving relevant paths and query strings. Sirius's old address
is `sirius-cybernetics-elevator-challenge.pollinations.ai`. Update the existing
`chat.pollinations.ai` redirect when Open WebUI moves; preserve the React
showcase's redirect to the UI documentation.

MCP, Floret, Mama Barbara, Polli, and operations retain their existing endpoints.
Older Cloudflare projects and the other app directories require a separate
ownership review; absence of a deploy manifest does not prove they are unused.

## Validation and rollback

- First PR: isolated installs/builds, declared checks, and relevant browser/API
  checks using published dependencies; no domain or hosting changes.
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
- [x] Prepare and verify standalone builds for the five Pollinations-owned
  consumers (first PR; merge pending). Websim now uses published SDK/UI packages;
  CatGPT and OpenClaw render independently, Sirius builds independently, and
  Open WebUI passes its existing deployment dry-run independently.
- [ ] Extract the four low-use Pollinations-owned apps.
- [ ] Move verified destinations to `.app` and add redirects.
- [ ] Extract and migrate Open WebUI.
- [ ] Complete accepted community handoffs and remove migrated source.
- [ ] Reorganize remaining services separately.
