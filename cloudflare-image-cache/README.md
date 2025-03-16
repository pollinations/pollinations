# Pollinations Image Cache with Text Embeddings

A Cloudflare Worker implementation that provides intelligent caching for Pollinations.ai image generation requests using text embedding similarity search.

## Overview

This project adds a powerful caching layer in front of the Pollinations.ai image generation API. It works by:

1. Intercepting image generation requests
2. Checking for exact or semantically similar cached images using text embeddings
3. Returning cached images when appropriate
4. Transparently proxying to the original API when needed
5. Caching new generated images for future requests

The system is designed to be a drop-in replacement for the original API, maintaining the same URL structure and parameters while adding powerful caching capabilities.

## Architecture

This solution uses several Cloudflare services:

- **Cloudflare Workers**: Serverless JavaScript runtime that powers the caching logic
- **Cloudflare R2**: Object storage for cached images (similar to S3)
- **Cloudflare Vectorize**: Vector database for storing and querying text embeddings
- **Cloudflare Workers KV**: Key-value store for metadata
- **Cloudflare Workers AI**: For generating text embeddings from prompts

## Features

- **Transparent Proxy**: Works as a drop-in replacement for the original API
- **Semantic Similarity Search**: Finds cached images with similar prompts
- **Customizable Thresholds**: Adjust similarity threshold per request
- **Cache Control**: Easily bypass or control caching behavior
- **Analytics Headers**: Response headers indicate cache status and similarity scores

## Setup Instructions

### Prerequisites

1. A Cloudflare account
2. Wrangler CLI installed (`npm install -g wrangler`)
3. Node.js 16+

### Initial Setup

1. Clone this repository:
   ```
   git clone https://github.com/pollinations/cloudflare-image-cache.git
   cd cloudflare-image-cache
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Login to Cloudflare with Wrangler:
   ```
   wrangler login
   ```

### Creating Cloudflare Resources

1. Create an R2 bucket for image storage:
   ```
   wrangler r2 bucket create pollinations-images
   wrangler r2 bucket create pollinations-images-dev  # for local development
   ```

2. Create a Vectorize index for embeddings:
   ```
   wrangler vectorize create pollinations-embeddings \
     --dimensions=512 \
     --metric=cosine
   ```

3. Create a KV namespace for metadata:
   ```
   wrangler kv:namespace create METADATA_KV
   wrangler kv:namespace create METADATA_KV --preview
   ```

4. Update the `wrangler.toml` file with your resource IDs from the outputs of the commands above.

## Configuration

Edit the `wrangler.toml` file to configure your worker:

```toml
[vars]
# Default similarity threshold (0.0 to 1.0)
SIMILARITY_THRESHOLD = "0.92"
# Original image service URL
POLLINATIONS_API_URL = "https://image.pollinations.ai"
# Enable/disable caching
ENABLE_CACHE = "true"
```

## Deployment

Deploy your worker to Cloudflare:

```
npm run deploy
```

## Usage

### Basic Usage

Use the service exactly like the original Pollinations API:

```
https://[your-worker-url]/prompt/beautiful%20sunset?width=1024&height=768
```

### Cache Control Parameters

Add these query parameters to control caching behavior:

- `no-cache=true` - Bypass cache and generate a new image
- `similarity=0.95` - Set a custom similarity threshold (0.0 to 1.0)

### Response Headers

The service adds these custom headers to responses:

- `X-Cache-Status`: `HIT`, `SIMILAR`, or `MISS`
- `X-Cache-Similarity`: The similarity score when `X-Cache-Status` is `SIMILAR`
- `X-Cache-Key`: The cache key for the image

## Monitoring and Troubleshooting

- Monitor worker performance in Cloudflare Dashboard
- Check worker logs for errors and cache status
- Monitor R2 and Vectorize usage to control costs

## Cost Estimation

Based on 50 million images per month:

- **R2 Storage**: ~$75/month for 5TB
- **R2 Operations**: ~$405/month (writes and reads)
- **Vectorize**: ~$270/month (storage and queries)
- **Workers**: ~$22/month (requests and compute time)

**Total Estimated Cost**: ~$770/month

## License

MIT License