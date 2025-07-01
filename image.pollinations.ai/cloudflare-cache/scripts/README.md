# R2 Bucket Image Download Scripts

This directory contains scripts for exploring and downloading images from the Cloudflare R2 bucket used by `image.pollinations.ai`.

## Overview

The scripts implement a "thin proxy" approach for efficient exploration of large R2 buckets, focusing on performance and minimal data transformation.

## Scripts

### 1. `production-r2-explorer.js` 
**Cloudflare Worker for R2 bucket operations**

A temporary Cloudflare Worker deployed to production that provides a REST API for R2 bucket exploration.

**Deployment:**
```bash
wrangler deploy scripts/production-r2-explorer.js --name temp-r2-explorer
```

**API Endpoints:**
- `?action=list&limit=10&prefix=_prompt_&cursor=...` - List objects with pagination
- `?action=skip&skipCount=1000` - Skip ahead efficiently in large buckets  
- `?action=jump` - Try different prefixes to find newer objects
- `?action=metadata&key=<object-key>` - Get metadata for specific object
- `?action=download&key=<object-key>` - Download specific object
- `?action=search&query=<search-term>&maxResults=50` - Search objects by key/metadata

**Features:**
- Returns raw R2 objects without field extraction (thin proxy principle)
- Cursor-based pagination for efficient navigation
- CORS headers for browser/curl access
- Handles large bucket navigation with skip and jump actions

### 2. `simple-r2-downloader.js`
**CLI client for the R2 explorer worker**

Easy-to-use command line interface for interacting with the deployed worker.

**Usage:**
```bash
# List recent objects with _prompt_ prefix
node scripts/simple-r2-downloader.js list --prefix="_prompt_" --limit=5

# Search for objects
node scripts/simple-r2-downloader.js search --query="flux" --maxResults=10

# Get metadata for specific object
node scripts/simple-r2-downloader.js metadata --key="<object-key>"

# Download image with metadata
node scripts/simple-r2-downloader.js download --key="<object-key>" --outputDir="./downloads"

# Jump to find different object patterns
node scripts/simple-r2-downloader.js jump
```

### 3. `download-r2-images.js`
**Direct R2 API client (initial approach)**

Direct integration with Cloudflare R2 using S3-compatible API.

**Usage:**
```bash
# Set environment variables
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_AUTH_TOKEN="your-token"

# Run script
node scripts/download-r2-images.js
```

### 4. `explore-r2-metadata.js`
**Local development R2 explorer**

For local development and testing using wrangler dev server.

**Usage:**
```bash
wrangler dev scripts/explore-r2-metadata.js
# Then use curl/browser to access http://localhost:8787
```

### 5. `test-env.js`
**Environment variable validation**

Simple utility to verify Cloudflare credentials are loaded.

## Key Findings

### Current Cache Key Pattern
Based on analysis of `src/cache-utils.js`, the current cache key generation follows this pattern:
1. URL path `/prompt/...` becomes `_prompt_...`
2. Query parameters are normalized and sorted
3. Special characters are replaced with underscores
4. A hash is appended: `{safePath}-{hash}`

### Bucket Structure
- **Large bucket**: Contains many objects, naive listing is inefficient
- **Newer objects**: Found with `_prompt_` prefix from 2025 (June/July)
- **Older objects**: Many legacy cache entries without metadata
- **Mixed formats**: Different key patterns from various caching iterations

### Most Efficient Access Pattern
1. Use `jump` action to identify active prefixes
2. Use `list` with `_prompt_` prefix for newest cached images
3. Use `skip` action to jump ahead in bucket pagination
4. Current prefix `_prompt_` contains the most recent cache entries

## Environment Setup

Required environment variables:
```bash
export CLOUDFLARE_ACCOUNT_ID="efdcb0933eaac64f27c0b295039b28f2"
export CLOUDFLARE_AUTH_TOKEN="your-auth-token"
```

## Design Principles

- **Thin Proxy**: Return raw R2 objects without unnecessary field extraction
- **Performance**: Cursor-based pagination and efficient skip operations
- **Minimal Logic**: Keep transformations simple and transparent
- **Temporary**: Worker is intended for exploration, not permanent deployment

## Next Steps

1. **Batch Download**: Implement automated batch downloading for specific criteria
2. **Metadata Analysis**: Analyze metadata patterns in newer objects
3. **Cleanup**: Remove temporary worker after exploration is complete
4. **Filter Implementation**: Add filtering by date, size, or metadata fields
5. **Performance Optimization**: Implement parallel downloads for large datasets

## Security Notes

- API tokens should be handled securely
- Temporary worker should be removed after use
- Consider rate limiting for production usage
- Environment variables should not be committed to git
