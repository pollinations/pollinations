# GitHub Authentication System - TODO & Implementation Guide

## Overview

This document provides context and next steps for the GitHub authentication system implemented for Pollinations. The current implementation provides a minimal OAuth flow using Cloudflare Workers and D1, following the "thin proxy" design principle.

## Current Implementation

The current implementation provides a basic GitHub OAuth flow with the following endpoints:

- `GET /start` - Initiates the OAuth flow and returns a session ID and GitHub authorization URL
- `GET /callback` - Handles the OAuth callback, exchanges the code for a token, and stores user data
- `GET /status/:sessionId` - Allows the client to poll for authentication status

### Key Files

- `src/index.ts` - Main Worker entry point with routing and request handling
- `src/db.ts` - Database operations for users and auth sessions
- `src/handlers.ts` - API handlers for authentication endpoints
- `src/types.ts` - TypeScript interfaces for the application
- `schema.sql` - D1 database schema for users and auth sessions
- `.dev.vars` - Local environment variables (not committed to git)
- `wrangler.toml` - Cloudflare Worker configuration
- `tests/oauth-flow-test.ts` - End-to-end test for the OAuth flow
- `tests/github-app.test.ts` - Integration tests for GitHub App functionality

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

### 2. Domain Allowlisting

Add support for domain allowlisting to control which domains can use a user's GitHub tokens:

- [ ] Add endpoints for managing domain allowlists (`GET/POST/DELETE /domains`)
- [ ] Update the database schema to store domain allowlist information
- [ ] Implement domain verification in the token usage flow

```typescript
// Example domain allowlist endpoint (to be implemented)
if (path === '/domains') {
  // Get user ID from authentication
  const userId = getUserIdFromAuth(request);
  
  if (request.method === 'GET') {
    // Return the user's domain allowlist
    const domains = await getDomainAllowlist(env.DB, userId);
    return new Response(JSON.stringify({ domains }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } else if (request.method === 'POST') {
    // Add a domain to the allowlist
    const { domain } = await request.json();
    await addDomainToAllowlist(env.DB, userId, domain);
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

### 3. Real-time Status Updates

Consider options for real-time status updates:

#### Option A: Polling (Current Implementation)
- ✅ Simple to implement and maintain
- ✅ Aligns with "thin proxy" design principle
- ✅ Works with all clients without special handling
- ❌ Less efficient for real-time updates

#### Option B: Server-Sent Events (SSE)
- ✅ More efficient for real-time updates
- ✅ One-way communication from server to client
- ❌ Adds complexity to the server implementation
- ❌ May require special handling for some clients

If implementing SSE, the endpoint would look like:

```typescript
// Example SSE endpoint (potential implementation)
if (path.startsWith('/events/')) {
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

- [x] Add integration tests for the complete authentication flow
- [x] Add end-to-end tests for the OAuth flow
- [ ] Create comprehensive API documentation
- [ ] Add usage examples for client applications

## Resources

### GitHub Documentation

- [GitHub Apps](https://docs.github.com/en/developers/apps/getting-started-with-apps/about-apps)
- [GitHub OAuth](https://docs.github.com/en/developers/apps/building-oauth-appsorizing-oauth-apps)
- [GitHub API Rate Limits](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting)
- [GitHub App JWT Authentication](https://docs.github.com/en/developers/apps/building-github-appsenticating-with-github-apps)

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
   REDIRECT_URI=http://localhost:8787/callback
   ```

2. Initialize the database:
   ```bash
   npm run db:init
   ```

3. Start the worker:
   ```bash
   npm run dev
   ```

4. Test the authentication flow:
   - Run the OAuth flow test: `npm run test:oauth`
   - Or manually:
     - Visit `http://localhost:8787/start` to initiate the flow
     - Complete the GitHub authorization
     - Check the status at `http://localhost:8787/status/:sessionId`
