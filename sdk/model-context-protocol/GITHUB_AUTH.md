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
- **MCP tools** - All authentication management is done through MCP tools
- **Dual auth methods** - Support for both referrer validation and token-based auth

## Setup

### Prerequisites

1. GitHub OAuth Application
   - Create a new OAuth App at https://github.com/settings/developers
   - Set the callback URL to `https://flow.pollinations.ai/github/callback`
   - Note your Client ID and Client Secret

2. Environment Variables
   - Set these environment variables in a `.env` file or directly in your environment:
     ```
     GITHUB_CLIENT_ID=your_client_id
     GITHUB_CLIENT_SECRET=your_client_secret
     REDIRECT_URI=https://flow.pollinations.ai/github/callback
     ```
   - The application uses dotenv to load environment variables from the `.env` file

### Deployment

1. Set up DNS for flow.pollinations.ai
   - Create a new DNS entry pointing to your server
   - Configure HTTPS (recommended using Cloudflare or Let's Encrypt)

2. Start the Authentication Server
   ```
   # For production
   npm run start-auth

   # For local testing
   npm run start-auth-test
   ```

3. The MCP server will automatically integrate with the authentication service

## Authentication Flow

### Option 1: Referrer-Based Authentication

1. User initiates authentication via an MCP tool
   - The system provides a GitHub authentication URL
   - User completes GitHub authentication
   - After authentication, the user receives a session ID

2. User manages whitelisted domains (referrers) through MCP tools
   - By default, text.pollinations.ai and image.pollinations.ai are whitelisted
   - User can add or remove domains using the MCP tools

3. When accessing from an authorized referrer:
   - The Origin/Referer header is checked against the whitelist
   - If valid, the user is automatically authenticated
   - No need for manual token management

### Option 2: Token-Based Authentication

1. User initiates authentication via an MCP tool
   - After authentication, the system generates a Pollinations access token
   - Token is returned via MCP tool

2. User uses the token for API access
   - Include the token in Authorization header: `Authorization: Bearer poll_token`
   - Token can be regenerated or revoked as needed via MCP tools

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

## Authentication Server API Endpoints

The authentication server exposes minimal endpoints required for the OAuth flow:

### OAuth Endpoints

- **GET /github/login**
  - Initiates the GitHub OAuth flow
  - Query parameters:
    - `returnUrl`: URL to redirect to after successful authentication (optional)

- **GET /github/callback**
  - OAuth callback endpoint for GitHub
  - Handles the code exchange and token generation
  - Returns the sessionId and token for MCP use

### Verification Endpoints

- **POST /api/auth/verify-token**
  - Verifies if a token is valid
  - Body: `{ "token": "poll_token" }`

- **POST /api/auth/verify-referrer**
  - Verifies if a referrer is authorized for a user
  - Body: `{ "userId": "github:12345678", "referrer": "example.com" }`

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
