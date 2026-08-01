# Implementation: Admin-Controlled Dashboard Status Notice

**Issue**: [#12585](https://github.com/pollinations/pollinations/issues/12585)  
**Parent**: [#10482](https://github.com/pollinations/pollinations/issues/10482)

## Overview

Adds an admin-controlled status notice banner to the enter.pollinations.ai dashboard. Administrators can publish a dashboard-wide notice (e.g., for outages, maintenance, breaking changes), and users see it at the top of every dashboard page. The notice is dismissible per-session, but reappears after refresh while still active.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Dashboard Shell                 │
│  ┌───────────────────────────────────────────┐  │
│  │         StatusNoticeBanner                 │  │
│  │  • Fetches GET /api/status-notice         │  │
│  │  • Polls every 60s                        │  │
│  │  • Dismiss via localStorage (updatedAt)   │  │
│  │  • Maps severity → Alert intent           │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │              Page Content                  │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘

                      │
          ┌───────────┴───────────┐
          ▼                       ▼
   GET /api/status-notice   PUT/DELETE /api/admin/status-notice
   (public)                 (admin-only, Bearer PLN_ENTER_TOKEN)
          │                       │
          └───────────┬───────────┘
                      ▼
              Workers KV
         key: "status-notice:active"
```

## Files Changed

### New Files

| File | Description |
|------|-------------|
| `enter.pollinations.ai/src/routes/status-notice.ts` | Backend routes: GET/PUT/DELETE endpoints with Zod validation, KV persistence, idempotency, link safety |
| `enter.pollinations.ai/frontend/src/components/status-notice-banner.tsx` | React banner component with polling, localStorage dismiss, severity mapping |
| `enter.pollinations.ai/test/status-notice.test.ts` | 28 unit tests covering all routes, auth, validation, CRUD, edge cases |

### Modified Files

| File | Change |
|------|--------|
| `enter.pollinations.ai/src/frontend-api.ts` | Register public GET `/status-notice` route |
| `enter.pollinations.ai/src/routes/admin.ts` | Register admin PUT/DELETE `/status-notice` routes (reuses existing Bearer auth middleware) |
| `enter.pollinations.ai/frontend/src/components/layout/dashboard-shell.tsx` | Mount `<StatusNoticeBanner />` at top of main content |
| `enter.pollinations.ai/.dev.vars.test` | Add `PLN_ENTER_TOKEN` for test environment admin auth |

## Backend Design

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/status-notice` | None | Returns `{ notice: StatusNotice \| null }` |
| `PUT` | `/api/admin/status-notice` | Bearer `PLN_ENTER_TOKEN` | Create or update notice |
| `DELETE` | `/api/admin/status-notice` | Bearer `PLN_ENTER_TOKEN` | Clear notice |

### Data Schema (KV key: `status-notice:active`)

```typescript
interface StatusNotice {
  message: string;          // required, 1–500 chars
  severity: "info" | "warning" | "critical";  // default: "warning"
  linkUrl?: string;         // optional, must be http(s)
  linkLabel?: string;       // optional, max 100 chars, requires linkUrl
  updatedAt: string;        // ISO 8601 timestamp
}
```

### Key Design Decisions

1. **KV Persistence** — Single key `status-notice:active` in existing Workers KV binding. Survives worker restarts. No DB migration needed.

2. **Idempotent PUT** — When the incoming payload matches the stored notice exactly, the handler returns 200 without writing KV and preserves `updatedAt`. This prevents dismiss state from being invalidated by no-op admin saves.

3. **Link Safety** — `linkUrl` is validated via `new URL(value)` and must use `http:` or `https:` protocol. `javascript:`, `data:`, `mailto:`, and relative URLs are rejected.

4. **Corrupted KV Resilience** — If the KV value is corrupted or malformed, the public GET returns `{ notice: null }` instead of erroring.

5. **Admin Auth** — PUT and DELETE are mounted on the existing `adminRoutes` which already has Bearer token middleware checking `PLN_ENTER_TOKEN`. No duplicate auth logic.

6. **Zod Validation** — All request bodies are validated with Zod schemas that include `.refine()` for cross-field rules (e.g., `linkLabel` requires `linkUrl`).

## Frontend Design

### StatusNoticeBanner Component

- **Data Fetching**: Calls `GET /api/status-notice` on mount and every 60 seconds via `setInterval`.
- **Visibility**: Hidden when no notice exists, when dismissed, or during initial load.
- **Dismiss Mechanism**: 
  - Dismissed `updatedAt` stored in `localStorage` under key `pollinations-status-notice-dismissed`.
  - Banner re-shows when a new notice is published (different `updatedAt`).
  - Dismiss persists across page refreshes for the same notice.
- **Severity Mapping**:
  - `info` → Alert `intent="info"` (neutral)
  - `warning` → Alert `intent="warning"` (yellow)
  - `critical` → Alert `intent="danger"` (red) + pulse animation
- **Link Support**: Optional external link rendered as a ghost button with `rel="noopener noreferrer"`.
- **Accessibility**: Uses `role="status"` (or `role="alert"` for danger), `aria-label` on dismiss button, focus-visible outlines.
- **Design System**: Uses `Alert`, `Button`, `IconButton`, `XIcon` from `@pollinations/ui`.

## Test Coverage (28 tests)

| Category | Tests | Coverage |
|----------|-------|----------|
| GET | 3 | null notice, active notice, cleared notice |
| Authentication | 4 | missing/wrong token for PUT, missing/wrong token for DELETE |
| Validation | 14 | missing/empty/over-length message, valid message at boundary, invalid severity, each valid severity, javascript:/data:/mailto:/relative URL, valid http(s) URL, linkLabel at boundary, linkLabel without linkUrl, malformed JSON |
| CRUD Flow | 1 | full publish→read→update→read→clear→read cycle |
| Idempotency | 2 | same content preserves updatedAt, changed content bumps updatedAt |
| Edge Cases | 4 | DELETE with no notice, KV persistence across reads, default severity, minimal notice |

## How to Use

### Publish a notice
```bash
curl -X PUT https://enter.pollinations.ai/api/admin/status-notice \
  -H "Authorization: Bearer $PLN_ENTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Image generation is experiencing delays","severity":"warning","linkUrl":"https://status.pollinations.ai","linkLabel":"Status page"}'
```

### Clear the notice
```bash
curl -X DELETE https://enter.pollinations.ai/api/admin/status-notice \
  -H "Authorization: Bearer $PLN_ENTER_TOKEN"
```

### Read current notice
```bash
curl https://enter.pollinations.ai/api/status-notice
```
