# Pollinations Image Cache with Cloudflare R2 + CDN

This directory contains a simple implementation of a caching layer for the Pollinations image generation service using Cloudflare R2 for storage and Cloudflare's global CDN for delivery.

## Overview

The implementation follows the "thin proxy" design principle:
- Minimal processing of requests and responses
- Direct forwarding of requests to the origin service when needed
- Simple caching logic using URL paths and query parameters as keys
- Analytics tracking to ensure all image requests are properly monitored

## Quick Setup

Run the setup script to create the R2 bucket and deploy the worker:

```bash
./setup.sh
```

This script will:
1. Install Wrangler if needed
2. Log in to Cloudflare (browser authentication)
3. Create the R2 bucket if it doesn't exist
4. Deploy the worker

That's it! Your Cloudflare Worker will now cache images in R2 and serve them through Cloudflare's CDN.

## Manual Setup (Alternative)

If you prefer to set things up manually:

1. Install Wrangler CLI:
   ```
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```
   wrangler login
   ```

3. Create the R2 bucket:
   ```
   wrangler r2 bucket create pollinations-images
   ```

4. Install dependencies:
   ```
   npm install
   ```

5. Deploy the worker:
   ```
   npm run deploy
   ```

## How It Works

1. **Request Flow**:
   - Incoming request → Worker → Check R2 cache → Serve cached image OR proxy to origin
   - For cache misses, the response is stored in R2 for future requests
   - Analytics events are sent at key points in the process

2. **Caching Strategy**:
   - Uses URL path and query parameters as cache keys
   - Skips caching for non-image responses or when `no-cache` parameter is present
   - Sets appropriate cache headers for CDN optimization

3. **Analytics**:
   - Tracks image requests directly from the Cloudflare cache
   - Sends analytics events for request, generation success/failure
   - Includes cache hit/miss status in the analytics data

## Cost Efficiency

This implementation is designed to be cost-efficient:
- Zero egress fees from Cloudflare R2
- Automatic CDN distribution
- Simple caching logic with minimal overhead

## Configuration

If you need to modify the configuration:

1. Update the bucket name in `wrangler.toml`
2. Modify the origin host in `wrangler.toml` if needed
3. Adjust caching logic in `src/cache-utils.js` if necessary

## Required Environment Variables

To ensure analytics work properly, you need to set these environment variables:

1. `GA_MEASUREMENT_ID` - Google Analytics 4 measurement ID
2. `GA_API_SECRET` - Google Analytics 4 API secret

These variables are automatically configured during deployment through GitHub Actions using repository secrets. However, if you need to set them manually, you can use one of these methods:

### Option 1: Edit wrangler.toml directly
Uncomment and set the values in the `[vars]` section of wrangler.toml:
```toml
[vars]
GA_MEASUREMENT_ID = "G-XXXXXXXXXX"  # Replace with your GA4 measurement ID
GA_API_SECRET = "XXXXXXXXXX"        # Replace with your GA4 API secret
```

### Option 2: Use Wrangler CLI
```bash
wrangler secret put GA_MEASUREMENT_ID
wrangler secret put GA_API_SECRET
```

### Option 3: Set in Cloudflare Dashboard
Go to Workers & Pages > pollinations-image-cache > Settings > Variables > Add variable

These should be the same values used in the main image.pollinations.ai service to ensure consistent analytics tracking.
