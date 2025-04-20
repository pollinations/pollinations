# GitHub Authentication for Pollinations

This document describes the GitHub authentication system for Pollinations services, implemented using the Model Context Protocol (MCP) server.

## Overview

This implementation provides a centralized authentication system that uses GitHub as an identity provider while offering users two authentication methods:

1. **Referrer-based authentication** - Automatically authenticate based on whitelisted domains
2. **Token-based authentication** - Use a personal access token for programmatic access

## Architecture

The system follows the "thin proxy" design principle and integrates seamlessly with the existing MCP server. Key components:

- **GitHub OAuth** - Authentication using GitHub identity
- **JSON storage** - Simple token and referrer storage system
- **Dual auth methods** - Support for both referrer validation and token-based auth

## Setup

### Prerequisites

1. GitHub OAuth Application
   - Create a new OAuth App at https://github.com/settings/developers
   - Set the callback URL to `https://me.pollinations.ai/github/callback`
   - Note your Client ID and Client Secret

2. Environment Variables
   - Set these environment variables:
     ```
     GITHUB_CLIENT_ID=your_client_id
     GITHUB_CLIENT_SECRET=your_client_secret
     ```

### Deployment

1. Set up DNS for me.pollinations.ai
   - Create a new DNS entry pointing to your server
   - Configure HTTPS (recommended using Cloudflare or Let's Encrypt)

2. Start the MCP server
   - The server will handle both MCP requests and authentication

## Authentication Flow

### Option 1: Referrer-Based Authentication

1. User signs in with GitHub on me.pollinations.ai
   - The system redirects to GitHub for authentication
   - After authentication, the user returns to me.pollinations.ai
   
2. User manages whitelisted domains (referrers)
   - By default, text.pollinations.ai and image.pollinations.ai are whitelisted
   - User can add or remove domains using the MCP tools

3. When accessing from an authorized referrer:
   - The Origin/Referer header is checked against the whitelist
   - If valid, the user is automatically authenticated
   - No need for manual token management

### Option 2: Token-Based Authentication

1. User signs in with GitHub on me.pollinations.ai
   - After authentication, the system generates a Pollinations access token
   
2. User uses the token for API access
   - Include the token in Authorization header: `Authorization: Bearer poll_token`
   - Token can be regenerated or revoked if needed

## API Reference

### MCP Tools

The following MCP tools are available for authentication:

#### `isAuthenticated`

Check if a session is authenticated with GitHub.

```javascript
{
  sessionId: "github:12345678"  // The GitHub session ID
}
```

#### `getAuthUrl`

Get the GitHub OAuth URL for authentication.

```javascript
{
  returnUrl: "https://example.com"  // Optional URL to redirect to after authentication
}
```

#### `getToken`

Get the Pollinations access token for an authenticated user.

```javascript
{
  sessionId: "github:12345678"  // The GitHub session ID
}
```

#### `listReferrers`

List authorized referrers for a user.

```javascript
{
  sessionId: "github:12345678"  // The GitHub session ID
}
```

#### `addReferrer`

Add a referrer to a user's whitelist.

```javascript
{
  sessionId: "github:12345678",  // The GitHub session ID
  referrer: "example.com"        // The domain to add to the whitelist
}
```

#### `removeReferrer`

Remove a referrer from a user's whitelist.

```javascript
{
  sessionId: "github:12345678",  // The GitHub session ID
  referrer: "example.com"        // The domain to remove from the whitelist
}
```

## Web Server Implementation

While the MCP server handles the authentication logic, you still need to implement a simple web server to handle the GitHub OAuth callback and manage authentication sessions. This web server should:

1. Handle the `/github/login` endpoint to start the OAuth flow
2. Handle the `/github/callback` endpoint to process the OAuth response
3. Create and manage user sessions
4. Serve a simple UI for token management and referrer configuration

A simple implementation using Express.js would be:

```javascript
import express from 'express';
import { completeAuth } from './src/services/authService.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/github/login', (req, res) => {
  // Redirect to GitHub login page
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = encodeURIComponent('https://me.pollinations.ai/github/callback');
  const state = crypto.randomBytes(16).toString('hex');
  
  // Store state in session
  req.session.oauthState = state;
  
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=read:user&state=${state}`;
  res.redirect(authUrl);
});

app.get('/github/callback', async (req, res) => {
  const { code, state } = req.query;
  
  // Verify state to prevent CSRF
  if (state !== req.session.oauthState) {
    return res.status(400).send('Invalid state parameter');
  }
  
  try {
    // Complete authentication
    const authResult = await completeAuth(code, state);
    
    // Set session
    req.session.authenticated = true;
    req.session.userId = authResult.sessionId;
    
    // Redirect to return URL or dashboard
    res.redirect(authResult.returnUrl || '/dashboard');
  } catch (error) {
    res.status(500).send(`Authentication error: ${error.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`Pollinations Authentication server running on port ${PORT}`);
});
```

## Security Considerations

- **Token Security**:
  - Store GitHub tokens securely server-side
  - Generate Pollinations tokens using cryptographically secure methods
  - Consider adding token encryption at rest for production

- **Referrer Validation**:
  - Implement strict validation of Origin/Referer headers
  - Be aware that referrer headers can be spoofed
  - Use this as a convenience feature, not as the sole security mechanism

- **CSRF Protection**:
  - Use state parameters to prevent cross-site request forgery
  - Validate all state tokens before completing authentication

- **Rate Limiting**:
  - Implement rate limiting for authentication endpoints
  - Add exponential backoff for failed authentication attempts

## Data Storage

This implementation uses a simple JSON file-based storage system. For production use, consider:

- Using a proper database (MongoDB, PostgreSQL, etc.)
- Implementing encryption for sensitive data
- Adding proper backup mechanisms
- Setting up token expiration and rotation
