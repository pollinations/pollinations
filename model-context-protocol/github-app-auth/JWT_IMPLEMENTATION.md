# JWT-Based Authorization Implementation

This document describes the JWT-based authorization implementation for the GitHub App authentication service, compliant with OAuth 2.1 and Model Context Protocol (MCP) specifications.

## Overview

The implementation provides a complete OAuth 2.1 authorization server that:
- Uses GitHub as the identity provider
- Issues JWT tokens for authorized users
- Implements PKCE for enhanced security
- Supports token refresh
- Provides metadata discovery endpoints

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  MCP Client │      │ Auth Server │      │   GitHub    │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                     │                     │
       │ 1. /authorize       │                     │
       │ (with PKCE)         │                     │
       ├────────────────────>│                     │
       │                     │ 2. Redirect to      │
       │<────────────────────┤    GitHub OAuth     │
       │                     │                     │
       │ 3. Authenticate     │                     │
       ├─────────────────────┼────────────────────>│
       │                     │                     │
       │ 4. Callback w/ code │                     │
       │<────────────────────┼────────────────────┤
       │                     │                     │
       │ 5. /token           │                     │
       │ (code + verifier)   │                     │
       ├────────────────────>│                     │
       │                     │ 6. Exchange code    │
       │                     ├────────────────────>│
       │                     │<────────────────────┤
       │                     │                     │
       │ 7. JWT tokens       │                     │
       │<────────────────────┤                     │
       └─────────────────────┴─────────────────────┘
```

## Implementation Details

### 1. OAuth 2.1 Endpoints

#### Authorization Endpoint (`/authorize`)
- Validates OAuth parameters including PKCE
- Stores session with code challenge
- Redirects to GitHub for authentication

#### Token Endpoint (`/token`)
- Exchanges authorization code for JWT tokens
- Verifies PKCE code verifier
- Returns access and refresh tokens

#### Metadata Endpoint (`/.well-known/oauth-authorization-server`)
- Provides OAuth 2.0 Authorization Server Metadata
- Lists supported features and endpoints

#### JWKS Endpoint (`/jwks`)
- Provides JSON Web Key Set for token validation
- Currently uses symmetric keys (HS256)

### 2. JWT Token Structure

Access tokens contain:
```json
{
  "sub": "github_user_id",
  "username": "github_username",
  "iss": "mcp-github-auth",
  "aud": "mcp-client",
  "exp": 1234567890,
  "iat": 1234567890,
  "jti": "unique_token_id"
}
```

### 3. Security Features

- **PKCE Required**: All authorization requests must include PKCE parameters
- **JWT Signatures**: Tokens are signed with HMAC-SHA256
- **Token Expiry**: Access tokens expire in 1 hour, refresh tokens in 30 days
- **Token Tracking**: JWTs are tracked in database for revocation

## Usage Guide

### 1. Generate JWT Secret

```bash
# Option 1: Use OpenSSL
openssl rand -base64 32

# Option 2: Use the test script
node --loader tsx test-jwt.ts
```

Add to `.dev.vars`:
```
JWT_SECRET=your_generated_secret_here
```

### 2. Start Authorization Flow

```javascript
// Generate PKCE challenge
const codeVerifier = generateRandomString(128);
const codeChallenge = await sha256(codeVerifier);

// Build authorization URL
const params = new URLSearchParams({
  response_type: 'code',
  client_id: 'your-client-id',
  redirect_uri: 'http://localhost:3000/callback',
  code_challenge: codeChallenge,
  code_challenge_method: 'S256',
  state: generateRandomString()
});

window.location.href = `http://localhost:8787/authorize?${params}`;
```

### 3. Exchange Code for Tokens

```javascript
const response = await fetch('http://localhost:8787/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    code_verifier: codeVerifier,
    redirect_uri: 'http://localhost:3000/callback'
  })
});

const { access_token, refresh_token } = await response.json();
```

### 4. Use JWT Token

```javascript
const response = await fetch('http://localhost:8787/api/protected', {
  headers: {
    'Authorization': `Bearer ${access_token}`
  }
});
```

### 5. Refresh Token

```javascript
const response = await fetch('http://localhost:8787/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refresh_token
  })
});

const { access_token } = await response.json();
```

## Database Schema

The implementation adds the following tables:

### jwt_tokens
Tracks issued JWT tokens for revocation and auditing:
- `jti`: JWT ID (primary key)
- `github_user_id`: User who owns the token
- `token_type`: 'access' or 'refresh'
- `expires_at`: Token expiration time
- `revoked`: Whether token has been revoked
- `created_at`: When token was issued

### oauth_clients
Stores registered OAuth clients (for dynamic registration):
- `client_id`: Unique client identifier
- `client_name`: Human-readable client name
- `redirect_uris`: Allowed redirect URIs (JSON array)
- `grant_types`: Supported grant types (JSON array)
- `response_types`: Supported response types (JSON array)
- `scope`: Allowed scopes
- `contacts`: Contact emails (JSON array)

### Updated auth_sessions
Added PKCE fields:
- `code_verifier`: PKCE verifier (stored temporarily)
- `code_challenge`: PKCE challenge
- `code_challenge_method`: Challenge method (S256)
- `redirect_uri`: Redirect URI for validation
- `client_id`: Client making the request

## Configuration

Required environment variables:
- `JWT_SECRET`: Secret for signing JWT tokens
- `GITHUB_CLIENT_ID`: GitHub OAuth app client ID
- `GITHUB_CLIENT_SECRET`: GitHub OAuth app client secret
- `REDIRECT_URI`: OAuth callback URL

## Future Enhancements

1. **Asymmetric Keys**: Move from HS256 to RS256 for better security
2. **Token Introspection**: Add RFC 7662 token introspection endpoint
3. **Token Revocation**: Add RFC 7009 token revocation endpoint
4. **OpenID Connect**: Add ID tokens and UserInfo endpoint
5. **Client Authentication**: Support client credentials for confidential clients

## Testing

Test the implementation:

```bash
# Test metadata discovery
curl http://localhost:8787/.well-known/oauth-authorization-server

# Test JWKS endpoint
curl http://localhost:8787/jwks

# Start auth flow (in browser)
open "http://localhost:8787/authorize?response_type=code&client_id=test&redirect_uri=http://localhost:3000/callback&code_challenge=CHALLENGE&code_challenge_method=S256"
```

## Compliance

This implementation complies with:
- OAuth 2.1 draft specification
- Model Context Protocol (MCP) authorization requirements
- RFC 7636 (PKCE)
- RFC 7517 (JWK)
- RFC 8414 (OAuth 2.0 Authorization Server Metadata)
