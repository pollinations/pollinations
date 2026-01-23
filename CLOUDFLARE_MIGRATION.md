# Cloudflare Account Migration Plan

> **Scope**: Migrate all Cloudflare resources from the old Pollinations.ai account to the new Myceli.AI account.
> 
> **Note**: The Myceli.AI account already has `kpi.myceli.ai` deployed - this is our target destination.
> 
> **Out of Scope**: Namecheap domain transfer (Phase 2, separate document), thot-labs.com (staying on old account), pollinations.diy (staying on old account)

**Created**: 2026-01-10  
**Status**: 🟢 Phase B Complete - Ready for Phase C (domain cutover)  
**Last Updated**: 2026-01-22 (v4 - Phase B complete, production workers deployed to NEW account)

---

## 📋 MASTER TODO LIST

### Phase A: Staging Migration ✅
- [x] **A1.** Create branch for wrangler config changes
- [x] **A2.** Export staging D1 database from OLD account
- [x] **A3.** Create staging D1 database in NEW account (`63da5347-3fa8-4410-a68f-c9e83956f76a`)
- [x] **A4.** Create staging KV namespace in NEW account (`ba22195551794751b9792e4e67eb074a`)
- [x] **A5.** Create R2 buckets in NEW account (`pollinations-images`, `pollinations-text-enter`)
- [x] **A6.** Update `wrangler.toml` with NEW staging resource IDs
- [x] **A7.** Import staging D1 data to NEW account
- [x] **A8.** Collect and add all staging secrets to NEW account
- [x] **A9.** Deploy staging workers to NEW account
- [x] **A10.** Test staging workers via `.workers.dev` URLs
- [x] **A11.** Deploy staging frontend to NEW account (included in worker)
- [x] **A12.** Full staging verification

**Staging URL**: https://pollinations-enter-staging.elliot-b6e.workers.dev

### Phase B: Production Preparation (No Downtime) ✅ COMPLETE

**Minimal scope - 3 workers only:**
| Worker | Domain | Resources |
|--------|--------|-----------|
| `pollinations-enter` | enter.pollinations.ai | D1, KV, R2, Durable Objects |
| `pollinations-gen` | gen.pollinations.ai | Service binding to enter |
| `pollinations-ai` | pollinations.ai, hello.pollinations.ai | Assets, 1 secret |

**Already on Myceli.AI:** `myceli-kpi` (kpi.myceli.ai)
**Not CF workers:** image/text services (EC2), economics-dashboard (Docker/Grafana)

- [x] **B1.** Export production D1 database from OLD account (snapshot 1)
- [x] **B2.** Create production D1 database in NEW account
- [x] **B3.** Create production KV namespace in NEW account (empty)
- [x] **B4.** Update `wrangler.toml` with NEW production resource IDs
- [x] **B5.** Import production D1 snapshot 1 to NEW account (table-by-table for FK order)
- [x] **B6.** Collect and add all production secrets to NEW account (12 secrets)
- [x] **B7.** Deploy `pollinations-enter` production to NEW account
- [x] **B8.** Deploy `pollinations-gen` production to NEW account
- [x] **B9.** Deploy `pollinations-ai` production to NEW account (frontend + PLN_APPS_KEY secret)
- [x] **B10.** Test workers via `.workers.dev` URLs
- [x] **B11.** ~~Lower DNS TTLs~~ → Just wait 24-48h for global DNS cache expiry (no action needed)
- [x] **B12.** Deploy `rubeus` (Portkey gateway) to NEW account
- [x] **B13.** Update EC2 text.pollinations.ai `.env` with new rubeus URL

**Production workers.dev URLs (NEW account):**
- Enter: https://pollinations-enter-production.elliot-b6e.workers.dev
- Gen: https://pollinations-gen-production.elliot-b6e.workers.dev
- Frontend: https://pollinations-ai.elliot-b6e.workers.dev
- Rubeus (Portkey): https://rubeus.elliot-b6e.workers.dev

**EC2 Update Required (B13):**
Update `text.pollinations.ai/.env` on EC2:
```
PORTKEY_GATEWAY_URL=https://rubeus.elliot-b6e.workers.dev
```

**GitHub OAuth App (for workers.dev testing):**
Add callback URL to GitHub OAuth App settings:
- https://pollinations-enter-production.elliot-b6e.workers.dev/api/auth/callback/github

GitHub OAuth App: https://github.com/organizations/pollinations/settings/applications

**NEW account resource IDs:**
- D1: `fc771b05-4e24-48bf-980c-d09f21279bd1`
- KV: `a621f17ad3e34000971cffa616675c5b`

### Phase C: Production Cutover (~5 min downtime)
- [ ] **C1.** Announce maintenance window
- [ ] **C2.** Disable OLD service (brief full outage)
- [ ] **C3.** Re-export production D1 from OLD account (snapshot 2 - final)
- [ ] **C4.** Re-import production D1 to NEW account
- [ ] **C5.** Add `pollinations.ai` domain to NEW Cloudflare account
  - Go to Myceli.AI Cloudflare dashboard → Add a site → `pollinations.ai`
  - Note the NEW nameservers (e.g., `xxx.ns.cloudflare.com`, `yyy.ns.cloudflare.com`)
- [ ] **C6.** Switch nameservers at Namecheap to NEW Cloudflare nameservers
  - Namecheap → Domain List → pollinations.ai → Nameservers → Custom DNS
  - Enter the nameservers from C5
- [ ] **C7.** Wait for DNS propagation (check with `dig pollinations.ai NS`)
- [ ] **C8.** Uncomment routes in wrangler.toml files and redeploy:
  - `enter.pollinations.ai/wrangler.toml` (production + staging routes)
  - `gen.pollinations.ai/wrangler.toml` (production route)
  - `pollinations.ai/wrangler.toml` (both routes)
- [ ] **C9.** Update OAuth App callback URLs:
  - **GitHub** (https://github.com/organizations/pollinations/settings/applications/3352144):
    - Add `https://enter.pollinations.ai/api/auth/callback/github`
    - Add `https://staging.enter.pollinations.ai/api/auth/callback/github`
  - **Discord** (Discord Developer Portal):
    - Add `https://enter.pollinations.ai/api/auth/callback/discord`
    - Add `https://staging.enter.pollinations.ai/api/auth/callback/discord`
  - (Keep workers.dev URLs as backup)
- [ ] **C10.** Verify services on custom domains
- [ ] **C11.** Announce migration complete

### Phase D: Post-Migration
- [ ] **D1.** Monitor for 24-48 hours
- [ ] **D2.** Update external integrations (OAuth callbacks, webhooks)
- [ ] **D3.** Transfer zone ownership / nameservers (later)
- [ ] **D4.** Archive OLD account (after 7+ days stable)

---

## Overview

### Migration Strategy: Double-Import (No Write-Freeze)

**Why no write-freeze?** Every API request writes to D1 (balance changes, usage tracking). A prolonged read-only mode would break the service.

**Solution**: Double-import with brief full disable during DNS switch.

```
PHASE A: Staging First (No downtime)
┌─────────────────────────────────────────────────────────┐
│ Complete full migration on STAGING environment          │
│ Verify everything works before touching production      │
└─────────────────────────────────────────────────────────┘
                            ↓
PHASE B: Production Preparation (No downtime)
┌─────────────────────────────────────────────────────────┐
│ OLD Account: Live, serving traffic                      │
│ NEW Account: Set up D1, KV, R2, deploy Workers (idle)   │
│ Import D1 snapshot 1 (will be slightly stale - OK)      │
│ Test NEW workers via .workers.dev URLs                  │
└─────────────────────────────────────────────────────────┘
                            ↓
PHASE C: Cutover (~5 min full downtime)
┌─────────────────────────────────────────────────────────┐
│ 1. Disable OLD service completely                       │
│ 2. Re-export D1 (snapshot 2 - final, fresh data)        │
│ 3. Re-import D1 to NEW account                          │
│ 4. Switch DNS to NEW workers                            │
│ 5. Verify & re-enable                                   │
└─────────────────────────────────────────────────────────┘
                            ↓
PHASE D: Verification & Cleanup
┌─────────────────────────────────────────────────────────┐
│ Monitor for 24-48 hours                                 │
│ Can rollback to OLD if needed (lose ~few cents pollen)  │
│ Transfer zone ownership later                           │
└─────────────────────────────────────────────────────────┘
```

### Key Decisions

- ✅ **D1 Databases**: Double-import strategy (test import, then final import at cutover)
- 🔄 **KV Namespaces**: Treat as **disposable cache** - start fresh (no export needed)
- ⏭️ **R2 Buckets**: Start fresh - service recreates data
- ✅ **Workers**: Deploy to NEW account first (idle), test, then switch DNS
- ✅ **Secrets**: Must be re-added to each worker in NEW account
- ✅ **Frontend**: Must also be deployed to NEW account
- ✅ **Staging First**: Complete staging migration before production

### Realistic Downtime Expectations

| Type | Duration | Who's Affected |
|------|----------|----------------|
| **Full service disable** | ~5 minutes | All users (during DNS switch) |
| **Data staleness risk** | None | Final D1 export right before switch |
| **Rollback possible** | Yes | Can switch DNS back, lose ~cents of pollen |

---

## Pre-Migration Checklist

### Before Starting

- [ ] Access to OLD Cloudflare account (Pollinations.ai)
- [ ] Access to NEW Cloudflare account (Myceli.AI)
- [ ] `wrangler` CLI installed and can switch between accounts
- [ ] All team members notified of migration window
- [ ] Monitoring dashboards ready (Tinybird, logs)

### Credentials Needed

- [ ] OLD Cloudflare API Token (with D1, KV, Workers, DNS permissions)
- [ ] NEW Cloudflare API Token (same permissions)
- [ ] GitHub OAuth App credentials (for callback URL updates)
- [ ] Polar webhook credentials (for callback URL updates)
- [ ] All secrets from OLD account documented (see Worker Secrets section)

---

## Resource Inventory

### D1 Databases

| Database Name | Database ID | Environment | Priority |
|---------------|-------------|-------------|----------|
| `production-pollinations-enter-db` | `f9cf0f09-b7aa-4cd3-8f9d-fa50c97ff1f3` | Production | 🔴 Critical |
| `staging-pollinations-enter-db` | `073195b4-d99e-4b67-9575-eb5efe6d3234` | Staging | 🟡 Important |
| `development-pollinations-enter-db` | `6345cb3c-e57a-4aab-bdd4-bca0de7bd930` | Development | 🟢 Optional |

### KV Namespaces (Cache Only - Create Empty)

**⚠️ NO DATA MIGRATION** - KV is used for caching only. Create empty namespaces in NEW account.

| OLD KV ID | Environment | Action |
|-----------|-------------|--------|
| `eb4ea5149a5a413db53902bf2b8c1d95` | Production | Create empty namespace in NEW |
| `aa0d0aceb6bd45de93032270c7adf4ab` | Development | Create empty namespace in NEW |

### R2 Buckets (Create Empty - No Migration)

**⚠️ NO DATA MIGRATION** - R2 is used for caching. Create empty buckets in NEW account.

| Bucket Name | Action |
|-------------|--------|
| `pollinations-images` | Create empty bucket in NEW |
| `pollinations-text-enter` | Create empty bucket in NEW |

### Workers (deploy via `wrangler deploy`)

| Worker Name | Custom Domains | Config File | Resources |
|-------------|----------------|-------------|-----------|
| `pollinations-enter` | `enter.pollinations.ai`, `staging.enter.pollinations.ai` | `enter.pollinations.ai/wrangler.toml` | D1, KV, R2, Durable Objects |
| `pollinations-gen` | `gen.pollinations.ai`, `staging.gen.pollinations.ai` | `gen.pollinations.ai/wrangler.toml` | Service binding to enter |
| `pollinations-ai` | `pollinations.ai`, `hello.pollinations.ai` | `pollinations.ai/wrangler.toml` | Assets only |
| `html-wrapper` | `websim.pollinations.ai` | `apps/websim/wrangler.toml` | Secret: TEXT_API_TOKEN |

### Pages Projects (deploy via `wrangler pages deploy`)

| Project Name | Custom Domain | Source Directory |
|--------------|---------------|------------------|
| `pollinations-chat` | `chat.pollinations.ai` | `apps/chat/` |
| `pollinations-model-monitor` | `model-monitor.pollinations.ai` | `apps/model-monitor/` |
| `pollinations-map-to-isometric` | `map-to-isometric.pollinations.ai` | `apps/map-to-isometric/` |
| `hacktoberfest-virtual-makeup` | `virtual-makeup.pollinations.ai` | `apps/virtual-makeup/` |
| `hacktoberfest-opposite-prompt-generator` | `opposite-prompt-generator.pollinations.ai` | `apps/opposite-prompt-generator/` |
| `hacktoberfest-sirius-cybernetics-elevator-challenge` | `sirius-cybernetics-elevator-challenge.pollinations.ai` | `apps/sirius-cybernetics-elevator-challenge/` |
| `pollinations-pitch` | `pitch.pollinations.ai` | _(external)_ |
| `pollinations-catgpt` | _(pages.dev only)_ | `apps/catgpt/` |
| _(+ others without custom domains)_ | | |

**Note**: Pages projects with custom domains on `pollinations.ai` will need DNS records migrated. Pages without custom domains (*.pages.dev) will continue working.

### Worker Secrets (To Document)

Run these commands to list secrets in OLD account:

```bash
# Switch to OLD account first
wrangler whoami

# List secrets for each worker
wrangler secret list --name pollinations-enter
wrangler secret list --name pollinations-enter --env production
wrangler secret list --name pollinations-enter --env staging

wrangler secret list --name pollinations-gen
wrangler secret list --name pollinations-gen --env production

wrangler secret list --name pollinations-ai

wrangler secret list --name html-wrapper
```

**Secrets documented (2026-01-10):**

| Worker | Environment | Secrets |
|--------|-------------|---------|
| `pollinations-enter` | default | `TINYBIRD_TOKEN`, `TURNSTILE_SECRET_KEY` |
| `pollinations-enter` | production | `BETTER_AUTH_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `ENTER_TOKEN`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `PLN_ENTER_TOKEN`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `TESTING_REFERRER`, `TINYBIRD_ACCESS_TOKEN`, `TINYBIRD_INGEST_TOKEN`, `TINYBIRD_READ_TOKEN` |
| `pollinations-enter` | staging | `BETTER_AUTH_SECRET`, `ENTER_TOKEN`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `POLAR_ACCESS_TOKEN`, `TESTING_REFERRER`, `TINYBIRD_ACCESS_TOKEN` |
| `pollinations-gen` | production | _(none)_ |
| `pollinations-ai` | default | `POLLINATIONS_API_KEY` |
| `html-wrapper` | default | `TEXT_API_TOKEN` |

---

## Phase A: Staging Migration (Do First!)

**Goal**: Complete full migration on staging to validate the process before touching production.

### A1. Create Branch for Config Changes

```bash
git checkout -b cloudflare-migration
```

### A2. Export Staging D1 from OLD Account

```bash
# Ensure authenticated to OLD account
wrangler whoami

mkdir -p cloudflare-migration-exports
wrangler d1 export staging-pollinations-enter-db \
  --output cloudflare-migration-exports/staging-db-$(date +%Y%m%d-%H%M%S).sql
```

### A3-A5. Create Staging Resources in NEW Account

```bash
# Switch to NEW account
export CLOUDFLARE_API_TOKEN="new_account_token_here"
wrangler whoami

# Create staging D1 database
wrangler d1 create staging-pollinations-enter-db
# Note NEW database_id: _______________

# Create staging KV namespace (empty - cache rebuilds)
wrangler kv namespace create "pollinations-enter-kv-staging"
# Note NEW namespace_id: _______________

# Create R2 buckets (empty - data regenerates)
wrangler r2 bucket create pollinations-images
wrangler r2 bucket create pollinations-text-enter
```

### A6. Update Wrangler Config for Staging

Update `enter.pollinations.ai/wrangler.toml` with NEW staging resource IDs:
- [ ] `database_id` for staging D1
- [ ] `id` for staging KV namespace

### A7. Import Staging D1 Data

```bash
wrangler d1 execute staging-pollinations-enter-db \
  --file=cloudflare-migration-exports/staging-db-TIMESTAMP.sql
```

### A8. Add Staging Secrets to NEW Account

```bash
# pollinations-enter staging (7 secrets)
npx wrangler secret put BETTER_AUTH_SECRET --name pollinations-enter --env staging
npx wrangler secret put ENTER_TOKEN --name pollinations-enter --env staging
npx wrangler secret put GITHUB_CLIENT_ID --name pollinations-enter --env staging
npx wrangler secret put GITHUB_CLIENT_SECRET --name pollinations-enter --env staging
npx wrangler secret put POLAR_ACCESS_TOKEN --name pollinations-enter --env staging
npx wrangler secret put TESTING_REFERRER --name pollinations-enter --env staging
npx wrangler secret put TINYBIRD_ACCESS_TOKEN --name pollinations-enter --env staging
```

### A9-A11. Deploy Staging Workers & Frontend

```bash
# Deploy enter worker (staging)
cd enter.pollinations.ai
npx wrangler deploy --env staging

# Deploy gen worker (staging)
cd ../gen.pollinations.ai
npx wrangler deploy --env staging

# Deploy main website (staging)
cd ../pollinations.ai
npx wrangler deploy
```

### A12. Staging Verification Checklist

- [ ] Staging enter worker responds: `curl https://pollinations-enter-staging.YOUR_SUBDOMAIN.workers.dev/`
- [ ] Staging gen worker responds: `curl https://pollinations-gen-staging.YOUR_SUBDOMAIN.workers.dev/`
- [ ] D1 data accessible (check user counts, etc.)
- [ ] Authentication flow works
- [ ] API calls work end-to-end

**✅ CHECKPOINT: Do not proceed to Phase B until staging is fully verified!**

---

## Phase B: Production Preparation (No Downtime)

**Goal**: Set up production in NEW account while OLD account continues serving live traffic.

### B1. Export Production D1 (Snapshot 1)

```bash
# Switch to OLD account
export CLOUDFLARE_API_TOKEN="old_account_token_here"
wrangler whoami

# Export production database (will be slightly stale - that's OK)
wrangler d1 export production-pollinations-enter-db \
  --output cloudflare-migration-exports/production-db-snapshot1-$(date +%Y%m%d-%H%M%S).sql
```

### B2-B3. Create Production Resources in NEW Account

```bash
# Switch to NEW account
export CLOUDFLARE_API_TOKEN="new_account_token_here"
wrangler whoami

# Create production D1 database
wrangler d1 create production-pollinations-enter-db
# Note NEW database_id: _______________

# Create production KV namespace (empty)
wrangler kv namespace create "pollinations-enter-kv"
# Note NEW namespace_id: _______________
```

### B4. Update Wrangler Config for Production

Update `enter.pollinations.ai/wrangler.toml` with NEW production resource IDs:
- [ ] `database_id` for production D1
- [ ] `id` for production KV namespace
- [ ] R2 bucket names (same names, new account)

Update other wrangler.toml files as needed:
- [ ] `gen.pollinations.ai/wrangler.toml` - service bindings auto-resolve
- [ ] `pollinations.ai/wrangler.toml` - no resource IDs
- [ ] `apps/websim/wrangler.toml` - no resource IDs

### B5. Import Production D1 Snapshot 1

```bash
wrangler d1 execute production-pollinations-enter-db \
  --file=cloudflare-migration-exports/production-db-snapshot1-TIMESTAMP.sql
```

### B6. Add All Production Secrets to NEW Account

```bash
# pollinations-enter production (15 secrets)
npx wrangler secret put BETTER_AUTH_SECRET --name pollinations-enter --env production
npx wrangler secret put DISCORD_CLIENT_ID --name pollinations-enter --env production
npx wrangler secret put DISCORD_CLIENT_SECRET --name pollinations-enter --env production
npx wrangler secret put ENTER_TOKEN --name pollinations-enter --env production
npx wrangler secret put GITHUB_CLIENT_ID --name pollinations-enter --env production
npx wrangler secret put GITHUB_CLIENT_SECRET --name pollinations-enter --env production
npx wrangler secret put NOWPAYMENTS_API_KEY --name pollinations-enter --env production
npx wrangler secret put NOWPAYMENTS_IPN_SECRET --name pollinations-enter --env production
npx wrangler secret put PLN_ENTER_TOKEN --name pollinations-enter --env production
npx wrangler secret put POLAR_ACCESS_TOKEN --name pollinations-enter --env production
npx wrangler secret put POLAR_WEBHOOK_SECRET --name pollinations-enter --env production
npx wrangler secret put TESTING_REFERRER --name pollinations-enter --env production
npx wrangler secret put TINYBIRD_ACCESS_TOKEN --name pollinations-enter --env production
npx wrangler secret put TINYBIRD_INGEST_TOKEN --name pollinations-enter --env production
npx wrangler secret put TINYBIRD_READ_TOKEN --name pollinations-enter --env production

# pollinations-ai (1 secret)
npx wrangler secret put POLLINATIONS_API_KEY --name pollinations-ai

# html-wrapper (1 secret)
npx wrangler secret put TEXT_API_TOKEN --name html-wrapper
```

### B7-B8. Deploy Production Workers & Frontend (Idle)

```bash
# Deploy enter worker (production) - will be idle, no traffic yet
cd enter.pollinations.ai
npx wrangler deploy --env production

# Deploy gen worker (production)
cd ../gen.pollinations.ai
npx wrangler deploy --env production

# Deploy main website
cd ../pollinations.ai
npx wrangler deploy

# Deploy websim
cd ../apps/websim
npx wrangler deploy
```

### B9. Test Production Workers via .workers.dev URLs

```bash
# Test workers (data may be slightly stale - that's expected)
curl https://pollinations-enter.YOUR_SUBDOMAIN.workers.dev/
curl https://pollinations-gen.YOUR_SUBDOMAIN.workers.dev/
curl https://pollinations-ai.YOUR_SUBDOMAIN.workers.dev/
```

### B10. Lower DNS TTLs (24-48 hours before cutover)

In OLD Cloudflare account:
1. Go to DNS → Records
2. For EACH record, change TTL to **1 minute** (60 seconds)
3. Wait 24-48 hours for old TTLs to expire globally

**✅ CHECKPOINT: All workers deployed and tested. Ready for cutover when TTLs expire.**

---

## Phase C: Production Cutover (~5 min downtime)

**Goal**: Switch DNS with minimal downtime, using fresh data export.

### C1. Announce Maintenance Window

- [ ] Post to Discord: "Brief maintenance in 10 minutes (~5 min downtime)"
- [ ] Post to status page if available

### C2. Disable OLD Service

In OLD Cloudflare account, deploy a maintenance page or disable workers:

```bash
# Option: Set maintenance mode secret on OLD account
export CLOUDFLARE_API_TOKEN="old_account_token_here"
npx wrangler secret put MAINTENANCE_MODE --name pollinations-enter --env production
# Enter value: true
```

### C3. Re-Export Production D1 (Snapshot 2 - Final)

```bash
# Still on OLD account
wrangler d1 export production-pollinations-enter-db \
  --output cloudflare-migration-exports/production-db-snapshot2-final-$(date +%Y%m%d-%H%M%S).sql
```

### C4. Re-Import Production D1 to NEW Account

```bash
# Switch to NEW account
export CLOUDFLARE_API_TOKEN="new_account_token_here"

# Clear and reimport (or just import if tables are same)
wrangler d1 execute production-pollinations-enter-db \
  --file=cloudflare-migration-exports/production-db-snapshot2-final-TIMESTAMP.sql
```

### C5. Switch DNS to NEW Workers

In **Namecheap** (domain registrar):
1. Log in to Namecheap
2. Go to Domain List → `pollinations.ai` → Manage
3. Under "Nameservers", select "Custom DNS"
4. Replace OLD nameservers with NEW Cloudflare nameservers
5. Save changes

### C6. Verify Services

```bash
# Monitor DNS propagation
dig pollinations.ai NS

# Test endpoints (may take 1-5 min for DNS)
curl -I https://pollinations.ai
curl -I https://enter.pollinations.ai
curl -I https://gen.pollinations.ai

# Test API functionality
curl https://gen.pollinations.ai/v1/models
```

### C7. Announce Migration Complete

- [ ] Post to Discord: "Maintenance complete! All systems operational."

**✅ CHECKPOINT: Traffic flowing through NEW account. Monitor for issues.**

---

## Phase D: Post-Migration

### D1. Monitor for 24-48 Hours

- [ ] Check Tinybird dashboards for errors
- [ ] Monitor response times
- [ ] Watch for authentication issues
- [ ] Check billing/Polar webhooks

### D2. Update External Integrations

- [ ] GitHub OAuth App callback URLs (if changed)
- [ ] Polar webhook URLs (if changed)
- [ ] Discord bot tokens (if any)
- [ ] Any external services pointing to old IPs

### D3. Final Verification Checklist

- [ ] Main website loads: `https://pollinations.ai`
- [ ] Enter dashboard loads: `https://enter.pollinations.ai`
- [ ] API gateway responds: `https://gen.pollinations.ai`
- [ ] Image generation works
- [ ] Text generation works
- [ ] User authentication works (GitHub OAuth)
- [ ] Billing/Polar integration works
- [ ] Staging environments work
- [ ] WebSim works: `https://websim.pollinations.ai`

### D4. Archive OLD Account (After 7+ Days)

- Do NOT delete OLD Cloudflare account until:
  - [ ] 7+ days of stable operation on NEW account
  - [ ] All monitoring shows no issues
  - [ ] Namecheap domain transfer complete (separate Phase 2 doc)

---

## Rollback Plan

If critical issues occur:

### Quick Rollback (DNS)

1. In Namecheap, revert nameservers to OLD Cloudflare account
2. Wait for propagation (1-24 hours depending on TTLs)

### Data Rollback

If data corruption occurred in NEW account:
1. Re-export from OLD account (if still available)
2. Re-import to NEW account

### Keep OLD Account Active

- Do NOT delete OLD Cloudflare account until:
  - [ ] 7+ days of stable operation on NEW account
  - [ ] All monitoring shows no issues
  - [ ] Namecheap transfer complete (Phase 2)

---

## Notes & Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-10 | Skip R2 transfer | Service recreates data, old data to cold storage |
| 2026-01-10 | Namecheap transfer out of scope | Separate Phase 2 |
| 2026-01-22 | **No write-freeze** | Every API request writes to D1 (balance changes). Prolonged read-only breaks service. |
| 2026-01-22 | **Double-import strategy** | Export D1 once to test, re-export final snapshot during brief full disable |
| 2026-01-22 | **Staging first** | Validate full migration on staging before touching production |
| 2026-01-22 | **~5 min full downtime** | Brief service disable during DNS switch is acceptable vs. hours of read-only |
| 2026-01-22 | **Include frontend deployments** | Must deploy pollinations.ai frontend to new account too |
| 2026-01-22 | **Phase B complete** | Production workers deployed to NEW account, tested via workers.dev URLs |

---

## Appendix: Resource ID Mapping

| Resource | OLD ID | NEW ID |
|----------|--------|--------|
| D1 production | `f9cf0f09-b7aa-4cd3-8f9d-fa50c97ff1f3` | `fc771b05-4e24-48bf-980c-d09f21279bd1` |
| D1 staging | `073195b4-d99e-4b67-9575-eb5efe6d3234` | `63da5347-3fa8-4410-a68f-c9e83956f76a` |
| D1 development | `6345cb3c-e57a-4aab-bdd4-bca0de7bd930` | (not migrated) |
| KV production | `eb4ea5149a5a413db53902bf2b8c1d95` | `a621f17ad3e34000971cffa616675c5b` |
| KV staging | | `ba22195551794751b9792e4e67eb074a` |
| KV development | `aa0d0aceb6bd45de93032270c7adf4ab` | (not migrated) |
| Cloudflare Account ID | (old Pollinations) | `b6ec751c0862027ba269faf7029b2501` (Myceli.AI) |

## Deployed Workers (NEW account)

| Worker | workers.dev URL |
|--------|-----------------|
| `pollinations-enter-staging` | https://pollinations-enter-staging.elliot-b6e.workers.dev |
| `pollinations-enter-production` | https://pollinations-enter-production.elliot-b6e.workers.dev |
| `pollinations-gen-production` | https://pollinations-gen-production.elliot-b6e.workers.dev |
| `pollinations-ai` | https://pollinations-ai.elliot-b6e.workers.dev |
