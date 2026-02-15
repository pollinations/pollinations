---
name: r2-glacier-migration
description: Monitor and manage R2 to AWS Glacier Deep Archive migration. Use when checking transfer status, resuming transfers, or managing the archive migration.
---

# R2 → AWS Glacier Deep Archive Migration

Migrate ~42.6 TB from Cloudflare R2 to AWS S3 Glacier Deep Archive.

## Cost Savings

- **R2**: ~$638/month → **Glacier**: ~$42/month
- **Savings**: ~$596/month

## Buckets

| Bucket | Size | Objects | Status |
|--------|------|---------|--------|
| pollinations-text | 16.96 TB | 1.86B | 🔄 In progress |
| pollinations-images | 25.64 TB | 221M | ⏳ Pending |

---

# Quick Commands

## Check Status

```bash
# Is transfer running?
ssh ninon "screen -ls"

# View recent logs
ssh ninon "tail -50 ~/r2-glacier/transfer-text.log"

# Check checkpoint
ssh ninon "cat /tmp/r2-glacier-pollinations-text-checkpoint.json | jq ."
```

## Attach to Screen (Interactive)

```bash
ssh -t ninon "screen -r r2-text"
# Detach: Ctrl+A, D
```

## Resume if Crashed

```bash
ssh ninon "screen -dmS r2-text bash -c '~/r2-glacier/run-text-transfer.sh; exec bash'"
```

---

# File Locations

| Location | Path | Purpose |
|----------|------|---------|
| Skill | [scripts/r2-to-glacier-streaming.js](scripts/r2-to-glacier-streaming.js) | Main transfer script |
| Skill | [scripts/package.json](scripts/package.json) | Dependencies |
| ninon | `~/r2-glacier/` | Deployed script + deps |
| ninon | `~/r2-glacier/run-text-transfer.sh` | Wrapper with credentials |
| ninon | `~/r2-glacier/transfer-text.log` | Transfer log |
| ninon | `/tmp/r2-glacier-*-checkpoint.json` | Resume checkpoint |

---

# Script Usage

```bash
# Test (small batch)
node r2-to-glacier-streaming.js -b pollinations-text --batch-size 100 --max-batches 1

# Full transfer
node r2-to-glacier-streaming.js -b pollinations-text --batch-size 50000 --concurrency 30

# Resume after interruption
node r2-to-glacier-streaming.js -b pollinations-text --resume

# Dry run (count only)
node r2-to-glacier-streaming.js -b pollinations-text --dry-run
```

---

# AWS Setup

- **Bucket**: `s3://pollinations-archive`
- **Region**: us-east-1
- **Storage Class**: DEEP_ARCHIVE

## Verify Archives

```bash
aws s3 ls s3://pollinations-archive/ --recursive --human-readable | head -20
```

---

# Important Notes

- ⚠️ **180-day minimum** on Glacier Deep Archive - don't delete R2 until verified!
- Some objects fail with "Header overflow" (very large responses) - acceptable loss
- Text bucket (1.86B objects) takes several days
- R2 egress is free, AWS ingress is free

---

# Start Images Bucket (After Text Complete)

1. Update `~/r2-glacier/run-text-transfer.sh` on ninon:
   ```bash
   # Change bucket name
   node r2-to-glacier-streaming.js -b pollinations-images --batch-size 50000 --concurrency 30
   ```

2. Start new screen:
   ```bash
   ssh ninon "screen -dmS r2-images bash -c '~/r2-glacier/run-images-transfer.sh; exec bash'"
   ```

---

# Tracking

- **Issue**: #5860
- **PR**: #5861
