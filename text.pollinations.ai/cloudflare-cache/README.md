# Pollinations Text Cache with Cloudflare R2 + CDN

This directory contains a simple implementation of a caching layer for the Pollinations text generation service using Cloudflare R2 for storage and Cloudflare's global CDN for delivery.

## Overview

The implementation follows the "thin proxy" design principle:
- Minimal processing of requests and responses
- Direct forwarding of requests to the origin service when needed
- Simple caching logic using URL paths, query parameters, and request body as keys

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