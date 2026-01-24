# Tier Management Migration Plan

> **Goal**: Remove Polar dependency for tier management. D1 becomes source of truth, Tinybird for event logs.
>
> **Status**: ✅ Phase 5 Complete (Polar tier removal) | 🔄 Phases 1-4 in progress

## Scope

**In scope:**
- New user registration → assign `spore` tier + immediate `tierBalance = 1`
- Daily 00:00 UTC refill → reset `tierBalance` to tier amount (no rollover)
- Tinybird event logging for tier_refill, tier_change, user_registration

**Out of scope:**
- Tier upgrades/downgrades (manual DB update for now)
- Pack purchases (Polar still handles packs)

---

## Tier Configuration

| Tier   | Pollen/Day |
|--------|------------|
| spore  | 1          |
| seed   | 3          |
| flower | 10         |
| nectar | 20         |
| router | 500        |

---

## Implementation Phases

### Phase 1: Tier Config & Constants ✅ DONE

**File:** `src/tier-config.ts` ✅ Created

```typescript
export const TIER_POLLEN = {
  spore: 1,
  seed: 3,
  flower: 10,
  nectar: 20,
  router: 500,
} as const;

export type TierName = keyof typeof TIER_POLLEN;

export function getTierPollen(tier: TierName): number {
  return TIER_POLLEN[tier] ?? TIER_POLLEN.spore;
}
```

**Note:** Tier types (`TierName`, `TierStatus`, `tierNames`) kept in `src/utils/polar.ts` for backwards compatibility, but marked as D1-only.

---

### Phase 2: Registration - Assign Spore + Balance 🔄 PARTIAL

**File:** `src/auth.ts` ✅ Modified

**Done:**
- ✅ Removed Polar tier subscription creation (`ensureDefaultSubscription` deleted)
- ✅ Kept Polar customer linking (needed for pack purchases)

**Still needed:**
- [ ] Ensure new users get `tier = 'spore'` and `tierBalance = 1` on registration
- [ ] Send `user_registration` event to Tinybird

---

### Phase 3: Daily Refill - Cloudflare Cron Trigger 🔄 PARTIAL

**File:** `src/scheduled.ts` ✅ Exists (needs verification)

**Done:**
- ✅ Cron trigger configured in `wrangler.toml`

**Still needed:**
- [ ] Verify refill logic runs at 00:00 UTC
- [ ] Add Tinybird event logging for refills

---

### Phase 4: Tinybird Event Schema ✅ DONE

**Datasource:** `observability/datasources/tier_event.datasource` ✅ Already exists

| Column | Type | Description |
|--------|------|-------------|
| event_type | String | `user_registration`, `tier_refill`, `tier_change` |
| environment | LowCardinality(String) | Environment name |
| user_id | Nullable(String) | User ID |
| tier | Nullable(String) | Tier name |
| pollen_amount | Nullable(Int32) | Amount granted |
| user_count | Nullable(Int32) | For batch refills |
| timestamp | DateTime | Event time |

**Files:**
- [x] `observability/datasources/tier_event.datasource` - Already existed
- [x] `src/events.ts` - Added `TierEvent` type and `sendTierEventToTinybird` function
- [x] `src/scheduled.ts` - Refactored to use `sendTierEventToTinybird`

**⚠️ NOT DEPLOYED** - Run `tb --cloud deploy` when ready

---

### Phase 5: Remove Polar Tier Dependencies ✅ DONE

All Polar tier logic removed. **Polar now only handles pack purchases.**

| File | Status | Changes |
|------|--------|---------|
| `src/tier-sync.ts` | ✅ **DELETED** | Entire file removed |
| `src/auth.ts` | ✅ Done | Removed `ensureDefaultSubscription`, kept Polar customer creation for packs |
| `src/middleware/polar.ts` | ✅ Done | Removed tier lazy-init from Polar, only pack balance from Polar now |
| `src/routes/webhooks.ts` | ✅ Done | Removed tier webhook handlers (`subscription.created/updated/active/canceled` for tiers), kept pack handlers |
| `src/routes/tiers.ts` | ✅ Done | Removed Polar subscription fetching, returns D1 tier with midnight UTC refill |
| `src/routes/admin.ts` | ✅ Done | Renamed `/sync-tier` → `/update-tier`, D1-only updates |
| `src/routes/account.ts` | ✅ Done | Replaced `calculateNextPeriodStart` with simple midnight UTC |
| `src/utils/polar.ts` | ✅ Done | Removed: `getTierProductMapCached`, `getTierProductById`, `calculateNextPeriodStart`, tier slugs. Kept: tier types for D1, pack functions |

**Architecture now:**
```
Polar → Packs only (webhooks, checkout, balance sync)
D1    → Tiers (set on registration, refilled by cron at 00:00 UTC)
```

---

## Migration Checklist

### Pre-deployment
- [x] Create `tier-config.ts` with tier amounts
- [x] Add scheduled handler in `scheduled.ts`
- [x] Update `wrangler.toml` with cron trigger
- [ ] Create Tinybird `tier_events` datasource
- [ ] Add `sendTierEventToTinybird` function
- [ ] Modify user registration to set tier + balance
- [ ] Write tests for refill logic

### Deployment
- [ ] Deploy Tinybird schema first (`tb --cloud deploy`)
- [x] Deploy worker with cron trigger
- [ ] Monitor first 00:00 UTC refill

### Post-deployment cleanup ✅ DONE
- [x] Remove Polar tier webhook handlers
- [x] Remove `tier-sync.ts`
- [x] Simplify `polar.ts` middleware (tier lazy-init removed)
- [x] Update `tiers.ts` route (D1-only)
- [x] Update `admin.ts` route (D1-only `/update-tier`)
- [x] Update `account.ts` route (simple midnight UTC refill)
- [x] Clean `auth.ts` (remove tier subscription creation)

---

## Testing

1. **Unit tests:**
   - `getTierPollen()` returns correct amounts
   - Refill SQL updates all tiers correctly

2. **Integration tests:**
   - New user gets spore tier + balance
   - Cron trigger fires and refills work
   - Events arrive in Tinybird

3. **Manual verification:**
   ```bash
   # Check a user's balance before/after refill
   npx wrangler d1 execute DB --remote --env production \
     --command "SELECT id, tier, tier_balance, last_tier_grant FROM user LIMIT 5"
   ```

---

## Questions Resolved

| Question | Answer |
|----------|--------|
| Tier amounts | spore=1, seed=3, flower=10, nectar=20, router=100 |
| Pack purchases | Polar still handles (NOT migrated to Stripe yet) |
| Tier upgrades | Manual via `/update-tier` admin endpoint or GitHub Actions |
| Registration timing | Immediate balance assignment |
| Refill mechanism | Cloudflare Cron at 00:00 UTC |
| Tinybird events | tier_refill, tier_change, user_registration (not yet implemented)

---

## Completed Work Log

### 2025-01-23: Phase 5 Complete

**Removed all Polar tier logic:**

1. **Deleted files:**
   - `src/tier-sync.ts`

2. **Modified files:**
   - `src/auth.ts` - Removed `ensureDefaultSubscription` function
   - `src/middleware/polar.ts` - Removed tier lazy-init, only pack balance from Polar
   - `src/routes/webhooks.ts` - Removed tier webhook handlers
   - `src/routes/tiers.ts` - D1-only tier status, midnight UTC refill
   - `src/routes/admin.ts` - `/update-tier` endpoint (D1-only)
   - `src/routes/account.ts` - Simple midnight UTC refill calculation
   - `src/utils/polar.ts` - Removed tier Polar functions, kept types

**Frontend impact:** None - `tier-panel.tsx` compatible with new response shape
