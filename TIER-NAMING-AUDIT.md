# Tier Naming & Surfacing Audit

**Branch:** `feat/hide-tiers-microbe`
**Date:** 2026-02-20
**Status:** Critical fixes applied (Steps 1–5, 7–8). Step 6 deferred. Medium/Low pending.

---

## Context

The tier system was restructured:

- **Microbe** and **Spore** are internal-only tiers — never shown to users by name
- The public creator tier ladder is **Seed → Flower → Nectar** only
- Spore changed from a creator tier (1 pollen/day) to a user tier (1.5 pollen/week)
- Microbe is 0 pollen, for new/flagged accounts — users see a neutral "fully active" message

### Already fixed on this branch

- `tier-panel.tsx` — Three-state panel (microbe/spore/creator) with no tier name for internal tiers
- `faq.tsx` — Dynamically filters out microbe/spore from creator tier table
- `tier-config.ts` — Spore correctly set to 1.5 pollen
- `tiers.ts` — Weekly cadence for spore/microbe
- `admin.ts` — Grant logic uses weekly refill for spore

---

## Findings

### Category 1: "Microbe" Surfaced to Users

| ID | File | Line(s) | Issue | Severity |
|----|------|---------|-------|----------|
| C1-1 | `pollinations.ai/src/ui/components/UserMenu.tsx` | 82-86 | `{profile.tier}` renders raw "microbe" text in user dropdown | **Critical** |
| C1-2 | `enter.pollinations.ai/src/routes/account.ts` | 222 | `/api/account/profile` returns `tier: "microbe"` in JSON response | **Critical** |
| C1-3 | `enter.pollinations.ai/src/routes/tiers.ts` | 77 | `/api/tiers/view` returns `displayName: "Microbe"` to dashboard | **Critical** |

### Category 2: "Spore" Surfaced as Tier Name to Users

| ID | File | Line(s) | Issue | Severity |
|----|------|---------|-------|----------|
| C2-1 | `pollinations.ai/src/ui/components/UserMenu.tsx` | 82-86 | Same as C1-1 — spore users see "🦠 spore" in dropdown | **Critical** |
| C2-2 | `enter.pollinations.ai/POLLEN_FAQ.md` | 46,56,58,90,94 | "Spore" named 6 times as a visible tier in user-facing FAQ | **Critical** |
| C2-3 | `.github/ISSUE_TEMPLATE/tier-appeal.yml` | 21 | "🌱 Spore" in current-tier dropdown shown to users | **Critical** |
| C2-4 | `.github/scripts/app-validate-submission.js` | 75 | Error message says "User has SPORE tier" — shown in GitHub issue comments | **Critical** |
| C2-5 | `enter.pollinations.ai/src/routes/tiers.ts` | 77 | Same as C1-3 — returns `displayName: "Spore"` for spore users | **Critical** |
| C2-6 | `enter.pollinations.ai/src/tier-config.ts` | 8,15 | `displayName: "Microbe"` / `displayName: "Spore"` — consumed by code that builds user-facing strings | Medium |

### Category 3: Old Tier Structure Remnants

| ID | File | Line(s) | Issue | Severity |
|----|------|---------|-------|----------|
| C3-1 | `enter.pollinations.ai/POLLEN_FAQ.md` | 56 | Spore shown as a named row in tier table (overlaps C2-2) | **Critical** |
| C3-2 | `apps/operation/economics/provisioning/dashboards/tier-costs.json` | 558,696,2055+ | 8+ refs to "Spore ($1/day)" — old value, now 1.5/week | Medium |
| C3-3 | `apps/operation/economics/provisioning/dashboards/tier-simulation.json` | 670-672 | "daily allowance for Spore tier (current: $1)" — old value | Medium |
| C3-4 | `.claude/skills/voting-status/SKILL.md` | 160 | `🦠 spore 1/day` — wrong emoji (🍄), wrong amount (1.5), wrong cadence (weekly) | Low |
| C3-5 | `apps/operation/onepager/public/one-pager.md` | 59 | Lists "Spore" as a developer tier in public marketing doc | **Critical** |
| C3-6 | `apps/operation/docs/public/docs-content/roadmap.md` | 12 | "Developer tiers (Spore, Seed, Flower, Nectar)" — Spore isn't a dev tier | Medium |
| C3-7 | `.claude/skills/tier-management/SKILL.md` | 193 | "New users get spore tier + 1 pollen" — should be 1.5 | Low |

### Category 4: Dashboard/UI Components

| ID | File | Line(s) | Issue | Severity |
|----|------|---------|-------|----------|
| C4-1 | `pollinations.ai/src/ui/components/ui/tier-card.tsx` | 12-16 | Comments describe microbe/spore as visible tiers (misleading for devs) | Low |
| C4-2 | `pollinations.ai/src/ui/components/ui/tier-card.tsx` | 24-25,42-43,60-61 | CSS variants for microbe/spore — dead code (component unused) | Low |

### Category 5: API Layer

| ID | File | Line(s) | Issue | Severity |
|----|------|---------|-------|----------|
| C5-1 | `enter.pollinations.ai/src/routes/account.ts` | 88-90 | `z.enum(["anonymous", ...tierNames])` exposes internal tiers in OpenAPI schema | **Critical** |
| C5-2 | `.github/scripts/app-validate-submission.js` | 71-77 | Microbe users NOT blocked from app submission (logic gap — only spore is checked) | **Critical** |
| C5-3 | `.github/scripts/app-validate-submission.js` | 55 | `tier: tier` in validation output JSON — raw tier name in workflow artifacts | Low |

### Category 6: Email / Notification Templates

No issues found. Clean.

### Category 7: User-Facing Documentation

Covered by C2-2, C3-1, C3-5, C3-6.

### Category 8: Test Files and Seed Data

No issues found. Tests use correct values.

---

## Summary

| Severity | Total | Fixed | Remaining |
|----------|-------|-------|-----------|
| **Critical** | 10 | 8 | 2 (deferred: C2-4, C5-2 — app-validate-submission.js) |
| Medium | 4 | 2 (C2-6, C3-6) | 2 (C3-2, C3-3 — Grafana dashboards) |
| Low | 5 | 0 | 5 (Steps 9–11) |

---

## Implementation Plan

### Design decisions

- **API approach**: Keep raw tier values in `/api/account/profile` response (backend/frontend code relies on them). Fix **frontend display** code so internal names are never rendered to users. The tiers API (`/api/tiers/view`) gets display-name masking since it feeds the dashboard directly.
- **Error codes**: Keep `SPORE_TIER` as an internal error code in `app-review-agent.py` — it's used for label routing, not shown to users. Fix the **user-facing error message** text only.
- **tier-config displayName**: Change to `null` for microbe/spore to make it impossible for future code to accidentally surface them.

---

### Step 1: Fix UserMenu tier name display

**File:** `pollinations.ai/src/ui/components/UserMenu.tsx`

**C1-1, C2-1** — Lines 82-86: `{tierEmoji} {profile.tier}` renders raw tier string.

**Fix:** Only show tier label for creator tiers (seed/flower/nectar). For microbe/spore/anonymous, show only the emoji.

```tsx
// Define which tiers are public creator tiers
const CREATOR_TIERS = new Set(["seed", "flower", "nectar"]);

// Lines 82-86: replace current block
{profile.tier && CREATOR_TIERS.has(profile.tier) && (
    <span className="ml-2 text-xs text-text-body-secondary">
        {tierEmoji} {profile.tier.charAt(0).toUpperCase() + profile.tier.slice(1)}
    </span>
)}
```

Also update emoji map (line 8-9) — give microbe/spore the neutral bee emoji:

```tsx
const TIER_EMOJI: Record<string, string> = {
    microbe: "🐝",
    spore: "🐝",
    seed: "🌱",
    flower: "🌸",
    nectar: "🍯",
};
```

---

### Step 2: Fix Tiers API displayName for internal tiers

**File:** `enter.pollinations.ai/src/routes/tiers.ts`

**C1-3, C2-5** — Line 77: Returns `displayName: "Microbe"` / `"Spore"`.

**Fix:** Mask internal tier names:

```typescript
const isInternalTier = userTier === "microbe" || userTier === "spore";
// ...
displayName: isInternalTier ? null : (TIERS[userTier].displayName as string),
```

Also update the schema at line 23 to allow null: `displayName: z.string().nullable()`.

---

### Step 3: Fix tier-config displayName

**File:** `enter.pollinations.ai/src/tier-config.ts`

**C2-6** — Lines 8, 15: `displayName: "Microbe"` / `displayName: "Spore"`.

**Fix:** Set to `null` so accidental use is caught at compile time:

```typescript
microbe: { pollen: 0, emoji: "🐝", displayName: null, threshold: 0, color: "gray" },
spore:   { pollen: 1.5, emoji: "🐝", displayName: null, threshold: 3, color: "blue" },
```

This will require updating the type to allow `null` for `displayName` and ensuring all consumers handle it (faq.tsx already filters, tier-panel.tsx only uses it for creator tiers).

---

### Step 4: Fix POLLEN_FAQ.md

**File:** `enter.pollinations.ai/POLLEN_FAQ.md`

**C2-2, C3-1** — 6 instances of "Spore" as a visible tier name.

**Fix — replace all Spore references with generic language:**

- Line 46: "All accounts start at the Spore tier with 1.5 free Pollen per week." → "All registered accounts get **1.5 free Pollen per week** — no purchase required."
- Lines 52-58: Remove the "User tier" table that names Spore. Replace with prose: "**Free weekly grant:** Every registered user gets 1.5 free Pollen per week, refreshed every Monday. Use it across any app — no creator tier required."
- Line 90: "Every user on the platform gets 1.5 free Pollen per week (Spore tier)." → "Every user on the platform gets 1.5 free Pollen per week."
- Line 94: "**Spore (user tier):** 1.5 Pollen per week, refreshed weekly." → "**Registered users:** 1.5 Pollen per week, refreshed weekly."

---

### Step 5: Fix tier-appeal.yml

**File:** `.github/ISSUE_TEMPLATE/tier-appeal.yml`

**C2-3** — Line 21: "🌱 Spore" in current-tier dropdown.

**Fix:** Replace with a generic option:

```yaml
options:
    - "🐝 Free weekly"
    - "🌿 Seed"
    - "🌸 Flower"
    - "🍯 Nectar"
```

---

### Step 6: Fix app-validate-submission.js — DEFERRED

**Files:** `.github/scripts/app-validate-submission.js`, `.github/scripts/app-review-agent.py`

**C2-4, C5-2** — Error message says "User has SPORE tier"; microbe users not blocked.

**Status:** Do not touch yet. Will be addressed in a separate pass.

---

### Step 7: Fix public docs

**C3-5** — `apps/operation/onepager/public/one-pager.md` line 59:

Replace the tier list:

```markdown
All registered users get **free weekly Pollen** to explore.

Creator tiers — earned by building and contributing:

* **Seed** — verified developer, daily Pollen grants
* **Flower** — working app, higher grants
* **Nectar** — app with traction, highest grants
```

**C3-6** — `apps/operation/docs/public/docs-content/roadmap.md` line 12:

Change: "Developer tiers (Spore, Seed, Flower, Nectar) wired into daily grant logic"
→ "Developer tiers (Seed, Flower, Nectar) wired into grant logic; free weekly grants for all users"

---

### Step 8: Fix OpenAPI schema + response value

**File:** `enter.pollinations.ai/src/routes/account.ts`

**C5-1** — Line 88-90: `z.enum(["anonymous", ...tierNames])` includes all internal tier names in docs. Line 222 returns raw `tier: "microbe"` / `"spore"` in the JSON response.

**Safe to change:** Verified all consumers — no code depends on the raw `microbe`/`spore` values from this endpoint:
- `pollinations.ai` UserMenu — being fixed in Step 1 to use emoji map, never compares against raw value
- `apps/slidepainter` — stores tier but never displays it
- Enter dashboard — uses `/api/tiers/view`, NOT this endpoint

**Fix — schema (line 88-90):** Replace internal tier names with public names:

```typescript
tier: z
    .enum(["anonymous", "free_weekly", "seed", "flower", "nectar", "router"])
    .describe("User's tier. 'free_weekly' = 🐝 registered user with weekly pollen grant"),
```

**Fix — response (line 222):** Map internal names before returning:

```typescript
const publicTier = (t: string) =>
    t === "microbe" || t === "spore" ? "free_weekly" : t;
// ...
tier: publicTier(profile.tier),
```

This way the API docs and response show `"free_weekly"` instead of `"microbe"` or `"spore"`. Microbe is hidden entirely (maps to same value as spore — both are just "free weekly" users from a public perspective).

---

### Step 9: Fix internal docs with wrong values

**C3-4** — `.claude/skills/voting-status/SKILL.md` line 160:

Change `🦠 spore 1/day` → `🐝 free weekly 1.5/week`

**C3-7** — `.claude/skills/tier-management/SKILL.md` line 193:

Change "New users get `spore` tier + 1 pollen immediately" → "New users get `spore` tier + 1.5 pollen immediately"

---

### Step 10: Fix Grafana dashboards

**C3-2** — `apps/operation/economics/provisioning/dashboards/tier-costs.json`:

- All "Spore ($1/day)" → "Spore ($1.5/week)" (8+ locations)
- All "Microbe ($0.10/day)" → "Microbe ($0/day)" (4+ locations)
- SQL at line 338: `WHEN 'spore' THEN 1` → `WHEN 'spore' THEN 0.214` (1.5/7)
- SQL: `WHEN 'microbe' THEN 0.1` → `WHEN 'microbe' THEN 0`

**C3-3** — `apps/operation/economics/provisioning/dashboards/tier-simulation.json`:

- Line 670: "daily allowance for Spore tier (current: $1)" → "weekly allowance for Spore tier (current: $1.5)"
- Line 672: default value `1` → `1.5`
- Line 661: "Microbe tier (current: $0.10)" → "Microbe tier (current: $0)"

---

### Step 11: Clean up tier-card.tsx (optional)

**C4-1, C4-2** — `pollinations.ai/src/ui/components/ui/tier-card.tsx`

The `TierCard` component is exported but never imported anywhere in the codebase. Options:

1. **Delete the file** (it's dead code)
2. **Keep but update** comments to note microbe/spore are internal-only

Recommend: delete (YAGNI).

---

## Verification

After all fixes:

1. **Grep check**: `grep -ri "spore\|microbe" --include="*.tsx" --include="*.ts" --include="*.md" --include="*.yml" --include="*.js"` in user-facing directories — confirm no leaked tier names
2. **Biome**: `npx biome check --write` on all modified files
3. **Tests**: `cd enter.pollinations.ai && npm run test`
4. **Visual check**: Review UserMenu dropdown for microbe/spore users
5. **API check**: Call `/api/account/profile` with a spore user — confirm tier display handling

---

## Files to modify

| # | File | Step | Changes |
|---|------|------|---------|
| 1 | `pollinations.ai/src/ui/components/UserMenu.tsx` | 1 | Hide tier label for microbe/spore, bee emoji |
| 2 | `enter.pollinations.ai/src/routes/tiers.ts` | 2 | Mask displayName for internal tiers |
| 3 | `enter.pollinations.ai/src/tier-config.ts` | 3 | Set displayName to null, emoji to bee for microbe/spore |
| 4 | `enter.pollinations.ai/POLLEN_FAQ.md` | 4 | Remove all "Spore" naming, use generic language |
| 5 | `.github/ISSUE_TEMPLATE/tier-appeal.yml` | 5 | Replace "Spore" with "Free tier" in dropdown |
| 6 | `.github/scripts/app-validate-submission.js` | 6 | Block microbe users, reword error message |
| 7 | `.github/scripts/app-review-agent.py` | 6 | Accept new error code |
| 8 | `apps/operation/onepager/public/one-pager.md` | 7 | Remove Spore from tier ladder |
| 9 | `apps/operation/docs/public/docs-content/roadmap.md` | 7 | Remove Spore from tier list |
| 10 | `enter.pollinations.ai/src/routes/account.ts` | 8 | Fix OpenAPI schema (and optionally mask response) |
| 11 | `.claude/skills/voting-status/SKILL.md` | 9 | Fix emoji and grant values |
| 12 | `.claude/skills/tier-management/SKILL.md` | 9 | Fix pollen amount |
| 13 | `apps/operation/economics/provisioning/dashboards/tier-costs.json` | 10 | Fix all Spore/Microbe values |
| 14 | `apps/operation/economics/provisioning/dashboards/tier-simulation.json` | 10 | Fix Spore/Microbe simulation values |
| 15 | `pollinations.ai/src/ui/components/ui/tier-card.tsx` | 11 | Delete (dead code) or update comments |
