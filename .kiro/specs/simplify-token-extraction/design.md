# Design Document

## Overview

This design document outlines the approach for simplifying the token extraction logic in the Cloudflare cache worker. The current implementation has unnecessary complexity where it creates a separate request-like object for token extraction, even though the shared `extractToken` utility function is already designed to handle the original request object directly.

## Architecture

The Cloudflare cache worker follows a proxy architecture pattern where it:
1. Receives requests
2. Extracts authentication information (tokens)
3. Checks for cached responses
4. Proxies to origin if needed
5. Caches responses for future use

The token extraction is a critical part of this flow as it determines:
- User identity for per-user caching
- Eligibility for semantic caching
- Authentication for origin requests

## Components and Interfaces

### Current Implementation

Currently, the token extraction in `index.js` follows this flow:

```javascript
// Create a request-like object for token extraction with parsed body
const requestForTokenExtraction = {
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: parsedBody,
};
const token = extractToken(requestForTokenExtraction);
const isEligible = isSemanticCacheEligibleForToken(token, env);
```

This creates an unnecessary intermediate object when the `extractToken` function is already designed to work with the original request object.

### Simplified Implementation

The simplified implementation will:

1. Use the `extractToken` function directly with the original request object
2. Pass the extracted token to `isSemanticCacheEligibleForToken`
3. Maintain all existing functionality without the extra complexity

```javascript
// Extract token directly from the request
const token = extractToken(request);
const isEligible = isSemanticCacheEligibleForToken(token, env);
```

## Data Models

No changes to data models are required for this simplification.

## Error Handling

The error handling will remain the same as in the current implementation. The `extractToken` function already has robust error handling, and the `isSemanticCacheEligibleForToken` function handles null or undefined tokens gracefully.

## Testing Strategy

1. **Unit Tests**: Verify that the `extractToken` function correctly extracts tokens from various request formats
2. **Integration Tests**: Ensure that the simplified code correctly identifies eligible tokens for semantic caching
3. **End-to-End Tests**: Verify that the entire request flow works correctly with the simplified token extraction

## Implementation Considerations

1. **Backward Compatibility**: The simplified implementation must maintain the same behavior as the current implementation
2. **Performance**: The simplified implementation should have the same or better performance
3. **Maintainability**: The code should be easier to understand and maintain
4. **Logging**: Ensure that logging remains clear and helpful for debugging