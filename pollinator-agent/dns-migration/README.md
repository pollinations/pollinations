# DNS Migration - pollinations.ai

## Strategy
Migrate DNS to Cloudflare while keeping all sites on current hosting (Netlify/AWS). Zero downtime.

## Current Status
- ⚠️ **NOT MIGRATED** - Still on Netlify DNS (NSOne nameservers)
- Zone ID: `0942247b74a58e4fc5ea70341a3754a3`

## TODO

### 1. Fix Cloudflare DNS Records
- [ ] Run `./add-netlify-cnames.sh` to add Netlify CNAMEs
- [ ] Delete incorrect A records in Cloudflare dashboard:
  - 103.169.142.0
  - 54.215.62.21
  - 13.52.115.166

### 2. Activate Cloudflare Zone
- [ ] Get Cloudflare nameservers assigned (currently null)

### 3. Switch Nameservers
- [ ] Update domain registrar: NSOne → Cloudflare nameservers
- [ ] Wait for propagation (24-48 hours)

### 4. Verify
- [ ] Test pollinations.ai and all subdomains
- [ ] Test API services (text, image, auth)
- [ ] Test AWS services (rest, worker-*)
- [ ] Test email

## What Changes
- **DNS Provider:** Netlify → Cloudflare
- **Hosting:** NO CHANGE (all sites stay where they are)

## Rollback
If issues: Update nameservers back to NSOne at registrar
