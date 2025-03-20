# Pollinations Image Cache

This Cloudflare Worker handles image caching and analytics for the Pollinations image service.

## Configuration 

The worker uses `wrangler.toml` for configuration. Sensitive information is stored as secrets and not in the configuration file.

### Setup Instructions

#### Option 1: Using the helper scripts (Recommended)

1. Make sure your `.env` file is set up in the root directory with the following variables:
   ```
   CLOUDFLARE_ACCOUNT_ID=your-account-id
   GA_MEASUREMENT_ID=your-ga-measurement-id
   GA_API_SECRET=your-ga-api-secret
   ```

2. Run the setup script:
   ```bash
   ./setup.sh
   ```

   OR

3. Run the individual scripts:
   ```bash
   # Configure secrets from .env
   ./configure-env.sh
   
   # Deploy with secrets
   ./deploy-with-secrets.sh
   ```

#### Option 2: Manual Setup

1. Copy the example configuration file:
   ```bash
   cp wrangler.toml.example wrangler.toml
   ```

2. Set up secrets using Wrangler:
   ```bash
   # Set your Cloudflare account ID
   wrangler secret put ACCOUNT_ID
   
   # Set Google Analytics secrets
   wrangler secret put GA_MEASUREMENT_ID
   wrangler secret put GA_API_SECRET
   ```

3. Deploy the worker:
   ```bash
   wrangler deploy
   ```

### Local Development

For local development, you can use a `.dev.vars` file:

1. Create a local environment file:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. Edit `.dev.vars` and add your development values
3. Run the worker locally:
   ```bash
   wrangler dev
   ```

### Important Security Notes

- Never commit files with real credentials to version control
- The `.gitignore` file is configured to exclude `wrangler.toml` and `.dev.vars`
- Always use Cloudflare's secret management for sensitive values

## Development

To run the worker locally for development:

```bash
npx wrangler dev
```

To view logs from the deployed worker:

```bash
npx wrangler tail
```

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
