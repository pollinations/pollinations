# Pollinations Shared Utilities

This directory contains shared utilities used across Pollinations services, particularly for authentication and queue management.

## Overview

The shared utilities provide a standardized approach to:

1. Token extraction and validation from headers, query parameters, and request body
2. Referrer handling for extended access and analytics
3. IP-based queue management with configurable delays
4. Authentication-based queue bypass

## Files

- **auth-utils.js**: Authentication utilities for token extraction, referrer handling, and queue bypass logic
- **ipQueue.js**: IP-based queue management with authentication integration
- **.env**: Shared environment variables for authentication and queue configuration
- **SIMPLE-plan.md**: Implementation plan and status
- **REFERRER_TOKEN_REPORT.md**: Comprehensive analysis of referrer and token handling

## Usage

### Authentication Utilities

```javascript
import { extractToken, extractReferrer, shouldBypassQueue } from '../shared/auth-utils.js';

// Extract token from request (Authorization header, x-pollinations-token header, query param, or request body)
const token = extractToken(req);

// Extract referrer from request (referer, origin, x-forwarded-host headers, or request body)
const referrer = extractReferrer(req);

// Check if request should bypass queue
const { bypass, reason, userId } = await shouldBypassQueue(req, { 
  legacyTokens: ['token1', 'token2'], 
  allowlist: ['domain1.com', 'domain2.com'] 
});
```

### Queue Management

```javascript
import { enqueue } from '../shared/ipQueue.js';

// Enqueue a function to be executed based on IP address
// Requests with valid tokens or from allowlisted domains bypass the queue
await enqueue(req, async () => {
  // Process request
  await handleRequest(req, res, requestData);
}, {
  interval: 6000,  // Time between requests in ms
  cap: 1           // Number of requests allowed per interval
});
```

## Authentication Flow

The authentication flow follows this priority order:

1. **DB token validation** via auth.pollinations.ai API (prepared for future use)
2. **Legacy token check** in Authorization header, x-pollinations-token header, query param, or request body
3. **Allowlisted domain check** for referrers - grants extended access but fewer rights than tokens
4. **Default**: go through queue based on IP address with configurable delay between requests

## Environment Configuration

The shared utilities automatically load their configuration from the `.env` file in this directory. Key environment variables include:

- `LEGACY_TOKENS`: Comma-separated list of legacy tokens that bypass the queue
- `ALLOWLISTED_DOMAINS`: Comma-separated list of domains that bypass the queue
- `QUEUE_INTERVAL_MS_TEXT`: Queue interval for text.pollinations.ai (default: 6000ms)
- `QUEUE_INTERVAL_MS_IMAGE`: Queue interval for image.pollinations.ai (default: 10000ms)

## Design Principles

1. **Access tiers**: Tokens grant full access, referrers grant extended access, IP-based for basic access
2. **Security first**: No referrer fallback in token extraction (tokens are only extracted from headers, query params, and request body)
3. **Simplicity**: Simple string comparison for token validation (no JWT complexity)
4. **Consistency**: Same authentication and queue behavior across services
5. **Self-contained**: Utilities automatically load their own configuration
6. **Rate limiting**: Configurable delay between requests based on IP address

## Implementation Status

See [SIMPLE-plan.md](./SIMPLE-plan.md) for the current implementation status.
