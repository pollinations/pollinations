# Shared Authentication Utilities

This folder contains shared authentication utilities that can be used across all Pollinations services.

## Authentication Strategy

- **Frontend Apps (no backend)**: Use referrer-based identification + IP-based queuing
- **Backend Apps**: Use token-based authentication with no queuing

## Usage

### From text.pollinations.ai or image.pollinations.ai:

```javascript
// Copy the auth-utils.js file to your service or import it
const { 
  extractReferrer, 
  extractToken, 
  isValidToken,
  shouldBypassQueue 
} = require('./path/to/auth-utils.js');

// Example usage
app.use((req, res, next) => {
  const { shouldBypass, reason } = shouldBypassQueue(req, {
    validTokens: process.env.VALID_TOKENS,
    whitelistedDomains: process.env.WHITELISTED_DOMAINS
  });
  
  if (shouldBypass) {
    // Skip queue, track by token if available
    req.bypassQueue = true;
    req.bypassReason = reason;
  }
  
  next();
});
```

## Functions

### `extractReferrer(req)`
Extracts referrer from request headers. Checks multiple sources:
- `referer` header
- `origin` header  
- `x-forwarded-host` header

### `extractToken(req)`
Extracts authentication token from request. Checks in order:
- `Authorization: Bearer <token>` header
- `x-pollinations-token` header
- `token` query parameter

**Note**: Does NOT fall back to referrer headers.

### `isValidToken(token, validTokens)`
Validates token against a list of valid tokens. Supports both arrays and comma-separated strings.

### `isDomainWhitelisted(referrer, whitelist)`
Checks if the referrer domain is in the whitelist. Supports subdomain matching.

### `getClientIp(req)`
Extracts client IP address from request headers.

### `shouldBypassQueue(req, config)`
Determines if a request should bypass the queue based on token or domain whitelist.

## Migration Path

1. **Phase 1**: Copy these utilities to each service
2. **Phase 2**: Replace existing referrer/token extraction logic
3. **Phase 3**: Standardize environment variables
4. **Phase 4**: Consider npm package or git submodule for sharing
