# GitHub Authentication System - TODO & Implementation Guide

## Overview

This document provides context and next steps for the GitHub authentication system implemented for Pollinations. The current implementation provides a minimal OAuth flow using Cloudflare Workers and D1, following the "thin proxy" design principle.

## Current Implementation

The current implementation provides a basic GitHub OAuth flow with the following endpoints:

- `GET /auth/start` - Initiates the OAuth flow and returns a session ID and GitHub authorization URL
- `GET /auth/callback` - Handles the OAuth callback, exchanges the code for a token, and stores user data
- `GET /auth/status/:sessionId` - Allows the chatbot to poll for authentication status

### Key Files

- `src/index.ts` - Main Worker entry point with routing and request handling
- `schema.sql` - D1 database schema for users and auth sessions
- `.dev.vars` - Local environment variables (not committed to git)
- `wrangler.toml` - Cloudflare Worker configuration
- `tsconfig.json` - TypeScript configuration

### Design Principles

The implementation follows Pollinations' "thin proxy" design principle:
- Minimal data transformation
- Direct pass-through of responses
- Simple error handling
- No unnecessary operations or metadata

## Next Steps

### 1. GitHub App Integration

The current implementation uses only GitHub OAuth. The next step is to integrate GitHub App functionality for higher rate limits:

- [ ] Register a GitHub App in the GitHub Developer settings
- [ ] Store GitHub App credentials (App ID, Private Key) as Worker secrets
- [ ] Implement JWT signing for GitHub App authentication
- [ ] Add installation token fetching and refresh logic
- [ ] Update the database schema to store installation tokens and expiry times

```typescript
// Example JWT signing for GitHub App (to be implemented)
import * as jose from 'jose';

async function createJWT(appId: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,  // Issued 60 seconds ago
    exp: now + 600, // Expires in 10 minutes
    iss: appId      // GitHub App ID
  };
  
  const alg = 'RS256';
  const key = await jose.importPKCS8(privateKey, alg);
  
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg })
    .sign(key);
}
```

### 2. Domain Whitelisting

Add support for domain whitelisting to control which domains can use a user's GitHub tokens:

- [ ] Add endpoints for managing domain whitelists (`GET/POST/DELETE /domains`)
- [ ] Update the database schema to store domain whitelist information
- [ ] Implement domain verification in the token usage flow

```typescript
// Example domain whitelist endpoint (to be implemented)
if (path === '/domains') {
  // Get user ID from authentication
  const userId = getUserIdFromAuth(request);
  
  if (request.method === 'GET') {
    // Return the user's domain whitelist
    const domains = await getDomainWhitelist(env.DB, userId);
    return new Response(JSON.stringify({ domains }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } else if (request.method === 'POST') {
    // Add a domain to the whitelist
    const { domain } = await request.json();
    await addDomainToWhitelist(env.DB, userId, domain);
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

### 3. Server-Sent Events (SSE)

Implement SSE for real-time status updates instead of polling:

- [ ] Add an SSE endpoint (`GET /auth/events/:sessionId`)
- [ ] Implement event emission when authentication status changes
- [ ] Update client-side code to use SSE instead of polling

```typescript
// Example SSE endpoint (to be implemented)
if (path.startsWith('/auth/events/')) {
  const sessionId = path.split('/').pop();
  
  // Set up SSE headers
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  };
  
  // Create a readable stream for events
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(`data: ${JSON.stringify({ connected: true })}\n\n`);
      
      // Set up a function to check for status changes
      const checkStatus = async () => {
        const status = await getSessionStatus(env.DB, sessionId);
        controller.enqueue(`data: ${JSON.stringify(status)}\n\n`);
        
        if (status.status === 'completed') {
          controller.close();
        } else {
          setTimeout(checkStatus, 1000);
        }
      };
      
      checkStatus();
    }
  });
  
  return new Response(stream, { headers });
}
```

### 4. Security Enhancements

Improve security of the authentication system:

- [ ] Implement token encryption at rest
- [ ] Add rate limiting for authentication endpoints
- [ ] Implement token refresh logic for expired tokens
- [ ] Add logging and monitoring for security events

### 5. Testing and Documentation

Improve testing and documentation:

- [ ] Add unit tests for authentication logic
- [ ] Add integration tests for the complete authentication flow
- [ ] Create comprehensive API documentation
- [ ] Add usage examples for client applications

## Resources

### GitHub Documentation

- [GitHub Apps](https://docs.github.com/en/developers/apps/getting-started-with-apps/about-apps)
- [GitHub OAuth](https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps)
- [GitHub API Rate Limits](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting)
- [GitHub App JWT Authentication](https://docs.github.com/en/developers/apps/building-github-apps/authenticating-with-github-apps)

### Cloudflare Documentation

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

### Libraries

- [Arctic](https://github.com/pilcrowonpaper/arctic) - OAuth library for Cloudflare Workers
- [jose](https://github.com/panva/jose) - JavaScript Object Signing and Encryption library

## Deployment

To deploy this worker to production:

1. Set up the required secrets in the Cloudflare dashboard:
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
   - `GITHUB_APP_ID` (for GitHub App integration)
   - `GITHUB_APP_PRIVATE_KEY` (for GitHub App integration)

2. Deploy the worker:
   ```bash
   npx wrangler deploy
   ```

3. Create the D1 database in production:
   ```bash
   npx wrangler d1 create github_auth --production
   npx wrangler d1 execute github_auth --file=schema.sql --production
   ```

## Local Development

To run the worker locally:

1. Create a `.dev.vars` file with the required environment variables:
   ```
   GITHUB_CLIENT_ID=your_client_id
   GITHUB_CLIENT_SECRET=your_client_secret
   REDIRECT_URI=http://localhost:8787/auth/callback
   ```

2. Start the worker:
   ```bash
   npx wrangler dev --local
   ```

3. Test the authentication flow:
   - Visit `http://localhost:8787/auth/start` to initiate the flow
   - Complete the GitHub authorization
   - Check the status at `http://localhost:8787/auth/status/:sessionId`
