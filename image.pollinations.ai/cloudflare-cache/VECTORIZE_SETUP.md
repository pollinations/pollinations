# Vectorize Metadata Index Setup

This document explains the Vectorize metadata indexes required for the semantic caching system and how to set them up.

## Required Metadata Indexes

The semantic cache relies on three metadata properties for efficient filtering:

| Property | Type | Purpose | Example Values |
|----------|------|---------|---------------|
| `bucket` | string | Resolution + seed isolation | `512x512`, `1024x1024_seed42` |
| `model` | string | AI model filtering | `flux`, `sdxl`, `turbo` |
| `seed` | string | Seed isolation | `42`, `999`, `null` |

## Why Metadata Indexes Are Critical

Without proper metadata indexes, Vectorize queries will:
- ❌ Perform full table scans instead of efficient lookups
- ❌ Experience timeouts on large datasets (>10K vectors)
- ❌ Cause 522 errors due to query timeouts
- ❌ Degrade cache performance significantly

## Automatic Setup

### During Deployment
Run the deploy script which automatically sets up all required indexes:

```bash
./deploy.sh
```

The deploy script will:
1. Check if each required metadata index exists
2. Create missing indexes automatically
3. Deploy the worker after ensuring indexes are ready

### Manual Setup
If you need to set up indexes manually:

```bash
# Run the dedicated setup script
./scripts/setup-vectorize-indexes.sh

# Or create indexes individually
wrangler vectorize create-metadata-index pollinations-image-cache --property-name bucket --type string
wrangler vectorize create-metadata-index pollinations-image-cache --property-name model --type string
wrangler vectorize create-metadata-index pollinations-image-cache --property-name seed --type string
```

## Verification

Check that all required indexes exist:

```bash
wrangler vectorize list-metadata-index pollinations-image-cache
```

Expected output:
```
┌──────────────┬────────┐
│ propertyName │ type   │
├──────────────┼────────┤
│ bucket       │ String │
├──────────────┼────────┤
│ model        │ String │
├──────────────┼────────┤
│ seed         │ String │
└──────────────┴────────┘
```

## Important Notes

### Index Creation Timing
- ⚠️ **Vectors upserted before index creation won't be indexed**
- ✅ Vectors upserted after index creation will be indexed automatically
- 🔄 Re-upserting existing vectors will add them to new indexes

### Index Limits
- Maximum 10 metadata indexes per Vectorize index
- Maximum 10KiB metadata per vector
- String indexes limited to first 64B of data

### Filter Performance
With proper indexes, metadata filtering will:
- ✅ Complete queries in <100ms even with millions of vectors
- ✅ Enable precise seed isolation preventing cache pollution
- ✅ Support efficient model-specific caching
- ✅ Scale to production traffic levels

## Troubleshooting

### Index Creation Failures
If index creation fails:
```bash
# Check current status
wrangler vectorize list-metadata-index pollinations-image-cache

# Verify you're authenticated
wrangler whoami

# Check if index exists
wrangler vectorize get pollinations-image-cache
```

### Query Timeouts
If you see query timeouts in production:
1. Verify all required indexes exist
2. Check that filters match indexed properties exactly
3. Ensure metadata property names are consistent
4. Monitor query performance in Cloudflare dashboard

### Missing Seed Index
If seed isolation isn't working:
```bash
# This was the root cause of production issues
# Ensure seed index exists:
wrangler vectorize create-metadata-index pollinations-image-cache --property-name seed --type string
```

## Best Practices

1. **Always run index setup before deployment**
2. **Verify indexes exist after each deployment**
3. **Monitor query performance in production**
4. **Re-upsert vectors after adding new indexes if needed**
5. **Keep this documentation updated with any new required indexes**

## Integration with CI/CD

For automated deployments, ensure your CI/CD pipeline:
1. Runs `./scripts/setup-vectorize-indexes.sh` before deployment
2. Verifies indexes exist with `wrangler vectorize list-metadata-index`
3. Fails the deployment if required indexes are missing

Example GitHub Actions step:
```yaml
- name: Setup Vectorize Indexes
  run: |
    cd image.pollinations.ai/cloudflare-cache
    ./scripts/setup-vectorize-indexes.sh
    
- name: Verify Indexes
  run: |
    cd image.pollinations.ai/cloudflare-cache
    wrangler vectorize list-metadata-index pollinations-image-cache | grep -E "(bucket|model|seed)"
```
