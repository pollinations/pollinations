# Pollinations Text Cache with Cloudflare R2 + CDN

This directory contains a simple implementation of a caching layer for the Pollinations text generation service using Cloudflare R2 for storage and Cloudflare's global CDN for delivery.

## Overview

The implementation follows the "thin proxy" design principle:
- Minimal processing of requests and responses
- Direct forwarding of requests to the origin service when needed
- Simple caching logic using URL paths, query parameters, and request body as keys

## Quick Setup

1. Copy the `.env.example` file to `.env` and set your semantic cache tokens:
   ```bash
   cp .env.example .env
   # Edit .env with your tokens
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Deploy with automated secret management:
   ```bash
   npm run deploy
   ```

That's it! Your Cloudflare Worker will now cache text responses in R2 and serve them through Cloudflare's CDN.

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
   wrangler r2 bucket create pollinations-text
   ```

4. Install dependencies:
   ```
   npm install
   ```

5. Deploy the worker:
   ```
   npm run deploy
   ```

## Semantic Cache Token Management

The semantic cache system uses tokens to control access. Tokens are managed as secrets (not in version control):

### Local Development

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your local development tokens:
   ```bash
   SEMANTIC_CACHE_TOKENS=test-token-123,body-token-456,your-dev-token
   ```

3. Run local development:
   ```bash
   npm run dev
   ```

### Production Deployment

**Automated Deployment (Recommended):**

1. Make sure your `.env` file contains all production secrets:
   ```bash
   SEMANTIC_CACHE_TOKENS=token1,token2,token3
   CLOUDFLARE_ACCOUNT_ID=your-account-id
   CLOUDFLARE_AUTH_TOKEN=your-auth-token
   VECTORIZE_CACHE=true
   ```

2. Deploy with one command:
   ```bash
   npm run deploy
   ```
   
   This will automatically:
   - Read secrets from your `.env` file
   - Set all secrets using `wrangler secret put`
   - Deploy the worker

**Manual Deployment (Alternative):**

```bash
# Set secrets manually
wrangler secret put SEMANTIC_CACHE_TOKENS
wrangler secret put CLOUDFLARE_ACCOUNT_ID
wrangler secret put CLOUDFLARE_AUTH_TOKEN
wrangler secret put VECTORIZE_CACHE

# Deploy without setting secrets
npm run deploy:simple
```

### Staging Environment

For testing new features without disrupting production, use the staging environment:

**Deploy to Staging:**
```bash
npm run deploy:staging
```

**Benefits:**
- ✅ Same vectorize index and R2 bucket as production
- ✅ Separate URL: `https://pollinations-text-cache-staging.<YOUR_SUBDOMAIN>.workers.dev`
- ✅ Same secrets and configuration
- ✅ Test semantic cache features safely
- ✅ No impact on production cache

**Other Staging Commands:**
```bash
# Local development with staging config
npm run dev:staging

# View staging logs
npm run logs:staging

# Deploy staging without setting secrets
npm run deploy:staging:simple
```

This approach:
- ✅ Keeps sensitive tokens out of version control
- ✅ Uses `.env` files (consistent with rest of project)
- ✅ Supports different tokens for local vs production
- ✅ Uses Cloudflare's secure secrets management for production
- ✅ Maintains simple one-command deployment

## Tunnel Setup

To set up the Cloudflare tunnels for both the main service and origin:

1. For the main service:
   ```bash
   ./setup-cloudflare-tunnel.sh text pollinations.ai 16385
   ```

2. For the origin service:
   ```bash
   ./setup-cloudflare-tunnel.sh text-origin pollinations.ai 16385
   ```

This will:
- Create tunnels for both domains
- Configure systemd services to run the tunnels
- Provide instructions for DNS setup

The script handles:
- Installing cloudflared if needed
- Tunnel creation and configuration
- Systemd service setup
- Automatic restart on failure

After running the script, follow the provided instructions to set up DNS records in Cloudflare.

## How It Works

1. **Request Flow**:
   - Incoming request → Worker → Check R2 cache → Serve cached response OR proxy to origin
   - For cache misses, the response is stored in R2 for future requests

2. **Caching Strategy**:
   - Uses URL path, query parameters, and relevant parts of the request body as cache keys
   - Generates efficient SHA-256 hash-based cache keys for consistent performance
   - Skips caching for specific paths and when `no-cache` parameter is present
   - Sets appropriate cache headers for CDN optimization
   - Supports caching of streaming responses (SSE) and serves them correctly when requested

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

## Dependencies

This project uses minimal dependencies:

1. **fast-json-stable-stringify**: Ensures consistent JSON serialization for reliable cache key generation
2. **wrangler**: Development dependency for deploying and managing Cloudflare Workers

## Key Differences from Image Cache

The text caching solution differs from the image caching solution in a few key ways:

1. **Request Body Handling**:
   - Includes relevant parts of the request body in the cache key for POST requests
   - Handles both GET and POST requests appropriately

2. **Content Type Detection**:
   - Specifically designed to cache text and JSON responses
   - Includes support for caching streaming responses (SSE)

3. **Cache Key Generation**:
   - Efficient SHA-256 hashing for consistent and collision-resistant cache keys
   - Considers both URL parameters and request body for comprehensive caching
   - Properly handles common parameters across different request types

## Streaming Response Handling

The text caching solution includes support for caching streaming (Server-Sent Events) responses:

1. When a streaming response is received from the origin, it's cached in R2 just like any other text response
2. When a cached streaming response is requested, the worker:
   - Sets the correct `content-type: text/event-stream` header
   - Returns the complete cached stream as a single response
3. This approach works because SSE is just a text format with a specific structure (lines prefixed with "data: " and separated by double newlines)
4. The client can process the complete stream just as if it were receiving it in real-time

### Important Caching Considerations

The caching system follows the thin proxy principle while handling streaming and POST requests appropriately:

1. **Separate Caches for Streaming and Non-Streaming Requests**:
   - The `stream` parameter is included in the cache key generation
   - This ensures streaming and non-streaming responses are cached separately
   - Necessary because they use different response formats (text/event-stream vs. application/json)

2. **Thin Proxy Approach for Request Bodies**:
   - The entire request body is used for cache key generation, following the thin proxy principle
   - No modification of request bodies or addition of default values
   - Preserves the original request exactly as sent by the client

3. **Seed Parameter Handling**:
   - The system logs when a request is missing a seed value for debugging purposes
   - The origin service handles seed generation for requests without a seed
   - No modification of the request is performed by the caching layer

4. **Transparent Caching**:
   - The caching layer acts as a transparent proxy, making minimal assumptions about the content
   - Requests and responses are passed through with minimal processing
   - Cache keys are generated based on the complete request information