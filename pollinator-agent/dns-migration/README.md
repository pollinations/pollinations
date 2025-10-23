# DNS Migration Scripts - pollinations.ai

This directory contains scripts and data for migrating DNS from Netlify (NSOne) to Cloudflare.

## ⚠️ Current Status

**NOT YET MIGRATED** - Domain still uses Netlify DNS (NSOne nameservers)

## Files

### Scripts
- **`check-dns.sh`** - Check current DNS configuration and nameservers
- **`compare-dns.sh`** - Compare Netlify vs Cloudflare DNS records
- **`analyze-missing.sh`** - Analyze missing records between providers
- **`add-missing-records.sh`** - Add missing records to Cloudflare
- **`add-all-missing.sh`** - Comprehensive script to add all missing records

### Data Files
- **`netlify-dns-export.csv`** - Export of all DNS records from Netlify
- **`.env`** - Cloudflare credentials (API token, zone ID, account ID)

## Prerequisites

Before migration:
1. ✅ All Cloudflare Workers services deployed (text, image, auth)
2. ⚠️ **CRITICAL:** Deploy pollinations.ai to Cloudflare Pages
3. ⚠️ Add CNAME records for Netlify-hosted subdomains
4. ✅ Verify all 67+ DNS records in Cloudflare

## Migration Checklist

### Phase 1: Preparation
- [ ] Deploy pollinations.ai to Cloudflare Pages
- [ ] Add CNAME records for Netlify subdomains:
  - dashboard.pollinations.ai
  - dreamachine.pollinations.ai
  - haustierhoroskop.pollinations.ai
  - legaltranslate.pollinations.ai
  - react-hooks.pollinations.ai
  - studio1111.pollinations.ai
- [ ] Verify all DNS records in Cloudflare
- [ ] Get Cloudflare nameservers assigned

### Phase 2: Migration
- [ ] Update nameservers at domain registrar
- [ ] Monitor DNS propagation (15-60 minutes)

### Phase 3: Validation
- [ ] Test all services and subdomains
- [ ] Monitor for 48 hours
- [ ] Clean up Netlify DNS zone

## Critical Services

| Service | Current Provider | Status |
|---------|-----------------|--------|
| pollinations.ai | Netlify Edge | ⚠️ Needs migration |
| text.pollinations.ai | Cloudflare Workers | ✅ Ready |
| image.pollinations.ai | Cloudflare Workers | ✅ Ready |
| auth.pollinations.ai | Cloudflare Workers | ✅ Ready |
| rest.pollinations.ai | AWS ELB | ✅ Ready |

## Usage

### Check current DNS status
```bash
./check-dns.sh
```

### Compare Netlify vs Cloudflare records
```bash
./compare-dns.sh
```

### Add missing records to Cloudflare
```bash
./add-all-missing.sh
```

## Cloudflare Zone Details

- **Zone ID:** `0942247b74a58e4fc5ea70341a3754a3`
- **Current Nameservers:** NSOne (Netlify)
- **Target Nameservers:** Cloudflare (TBD)
- **Records:** 67 configured

## Important Notes

1. **DO NOT switch nameservers** until pollinations.ai is deployed to Cloudflare Pages
2. Main site will break if switched prematurely
3. All API services will continue working (already on Cloudflare)
4. Email (Google MX) records are already configured in Cloudflare

## Rollback Plan

If issues occur after migration:
1. Update nameservers back to NSOne at registrar
2. Wait for DNS propagation (15-60 minutes)
3. All services will return to Netlify DNS

## References

- Cloudflare API Docs: https://developers.cloudflare.com/api/
- DNS Propagation Checker: https://dnschecker.org/
