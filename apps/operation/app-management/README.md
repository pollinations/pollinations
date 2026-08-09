# Community app management

This directory contains the agent that maintains `apps/catalog.json`. GitHub
workflows only schedule it, provide credentials, and publish its catalog
changes.

## Lifecycle

1. The daily screenshot workflow selects a rotating batch of 50 live-app URLs.
2. Playwright opens each page and waits for navigation, fonts, and late content.
3. The visual agent may wait, scroll, or use safe presentation controls until it
   finds a useful cover.
4. A separate guard approves every click, final visual review confirms every
   cover, and a second removal review confirms every deletion.
5. Approved screenshots are uploaded to `media.pollinations.ai` and written to
   the catalog.
6. A row is removed only after two 404/410 responses or a confirmed visual
   `remove` decision for a parked/repurposed domain, permanent shutdown, broken
   authentication callback, unrelated destination, or sexual content.
7. The catalog change lands through an auto-merge PR. After merge, the original
   submission issue receives the reason and restoration instructions.
8. A submitter or repository maintainer can reply that the app is fixed. The
   reactivation agent recovers the old row from Git history, interprets the
   reply, rechecks the live app, captures a fresh screenshot, and opens a
   restoration PR.

There is no separate deleted-app ledger. The catalog, Git history, pull request,
and original submission issue are the complete record.

## Architecture

- `ingestion/` handles new submissions: parsing, validation, AI review, and the
  catalog row that enters after maintainer approval.
- `management/` maintains existing entries: screenshots, confirmed removals,
  developer notification, Git-history recovery, and restoration.
- `performance/` refreshes the inexpensive daily metrics for every app:
  GitHub stars, BYOP status, request volume, and ranking.
- `catalog.js` is shared by all three blocks and owns the catalog schema,
  reading/writing, validation, and the small `validate` and `prepend` commands.
- `generate-catalog-outputs.js` regenerates both derived Markdown outputs:
  `apps/GREENHOUSE.md` and the Recent Apps section in the root `README.md`.

The boundaries are deliberate: ingestion adds apps, management can remove or
restore them and manages media, and performance only updates metrics.

Each script has a colocated Node test file. Run them with:

```bash
node --test apps/operation/app-management/*.test.js apps/operation/app-management/*/*.test.js
```

## Authentication

Routine runs remain anonymous unless `--auth-state` supplies the dedicated
reviewer browser state. When enabled, the agent may continue only through the
exact Google, GitHub, and `enter.pollinations.ai` origins and must return to the
original app before accepting a screenshot. Other login providers, expired
reviewer sessions, CAPTCHAs, and unexpected origins are reported as
`auth_required` and skipped.

Pollinations BYOP authorization is a separate explicit mode:
`--authorize-pollinations`. It requires `--auth-state`, sets the authorization
to 0 Pollen and one day, and refuses to click Authorize if those limits cannot
be verified. Authenticated reviews are serialized. Every new Pollinations key
is revoked after capture, the app's site data is cleared, and a cleanup failure
stops all later authenticated reviews in that run. Google is limited to
`openid`, email, and profile without offline access; Google and GitHub consent
screens that would create a broader new grant fail closed. Keep the
browser-state file outside tracked repository content. The remaining
reviewer-account limits are documented in `apps/README.md`.
