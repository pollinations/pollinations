---
name: GitHub Authentication with SSE MCP Server
about: Implement a centralized GitHub authentication system with dual authentication methods
title: Implement GitHub Auth with SSE MCP Server at me.pollinations.ai
labels: enhancement
assignees: voodoohop
---

# Implement GitHub Authentication with Dual Authentication Methods Using SSE MCP Server

## Overview

Create a centralized authentication system at `me.pollinations.ai` that uses GitHub as an identity provider while offering users two authentication methods:

1. **Referrer-based authentication** - Automatically authenticate based on whitelisted domains
2. **Token-based authentication** - Provide users with a personal access token they can use directly

This implementation will unify authentication across all Pollinations services and follow the "thin proxy" design principle.

## Architecture

The core insight of this proposal is to create a **single service** that serves as both:
1. A centralized authentication endpoint
2. An SSE-based MCP server

### Key Components:

- **`me.pollinations.ai` domain** - Dedicated subdomain for user authentication and MCP services
- **SSE MCP server** - Server-Sent Events implementation of the Model Context Protocol
- **GitHub OAuth** - Authentication using GitHub identity
- **JSON storage** - Simple token and referrer storage system
- **Dual auth methods** - Support for both referrer validation and token-based auth

## Authentication Flow

### Option 1: Referrer-Based Authentication
1. User signs in with GitHub on `me.pollinations.ai`
2. User whitelists specific domains (referrers) that can access their GitHub identity
3. When accessing from an authorized referrer, authentication happens automatically
4. Referrer validation ensures only whitelisted domains can access user data

### Option 2: Token-Based Authentication
1. User signs in with GitHub on `me.pollinations.ai`
2. System generates a Pollinations access token tied to their GitHub identity
3. User can use this token directly with any Pollinations service
4. Token can be revoked or regenerated as needed

## Technical Implementation

### 1. GitHub OAuth Integration

Implement standard OAuth flow with GitHub:
```
/github/login       - Start OAuth flow
/github/callback    - Handle GitHub redirect with auth code
/github/status      - Check authentication status
```

### 2. Token and Referrer Storage

Create a JSON storage structure:
```json
{
  "users": {
    "github:12345678": {
      "github_token": "gho_16C7e42F292c6912E7710c838347Ae178B4a",
      "pollinations_token": "poll_3a8f691d7ac34b2e8f3a138f7b0",
      "created_at": "2025-04-20T07:52:33+02:00",
      "last_used": "2025-04-20T07:52:33+02:00",
      "referrers": ["text.pollinations.ai", "image.pollinations.ai"]
    }
  }
}
```

### 3. SSE MCP Server Integration

The SSE MCP server on `me.pollinations.ai` will:
1. Provide authentication tools directly
2. Have direct access to the authentication data
3. Eliminate the need for cross-domain authentication issues

The MCP server would provide authentication tools with simple names:

```javascript
isAuthenticated({ sessionId })    // Check if user has valid auth
getAuthUrl({ returnUrl })         // Get auth URL with return redirect
getToken({ sessionId })           // Get or generate a token
listReferrers({ sessionId })      // List authorized referrers 
addReferrer({ sessionId, referrer })      // Add a referrer to whitelist
removeReferrer({ sessionId, referrer })   // Remove a referrer from whitelist
```

### 4. Authentication Verification

For referrer-based authentication:
- Validate Origin/Referer headers against whitelist
- Check if GitHub token is valid and active

For token-based authentication:
- Verify Pollinations token against stored values
- Map to corresponding GitHub identity

## Security Considerations

1. **Token Security**:
   - GitHub tokens stored securely server-side
   - Pollinations tokens follow best practices (cryptographically secure, revocable)
   - Token encryption at rest (Phase 2)

2. **Referrer Validation**:
   - Strict validation of referrer headers
   - CSRF protection for all management endpoints
   - Rate limiting for token-based authentication

3. **Authentication Methods**:
   - Referrer-based for seamless user experience
   - Token-based for programmatic access and cross-domain usage

## Technical Advantages

1. **Simplified Architecture**: One service handles both authentication and MCP
2. **Reduced Latency**: No need to make HTTP requests between services
3. **Better Security**: Authentication data stays within one service
4. **Easier Maintenance**: Single codebase for both functions
5. **No Cross-Domain Issues**: Authentication and MCP operate in same context

## Implementation Plan

1. Create the `me.pollinations.ai` subdomain and DNS settings
2. Implement GitHub OAuth integration 
3. Create the SSE MCP server with authentication tools
4. Implement JSON-based token and referrer storage
5. Add token generation and management functionality
6. Add referrer validation and management
7. Test with real GitHub operations

## Benefits of This Approach

1. **Flexibility**: Users choose their preferred authentication method
2. **Simplicity**: GitHub handles identity, we manage access
3. **Security**: Follows OAuth best practices with additional security layers
4. **User Control**: Users explicitly control how their identity is used
5. **Cross-Service Access**: Same authentication mechanism works across all Pollinations services
6. **Future-Proof**: Architecture supports extensions like user subdomain management

## Acceptance Criteria

- Users can authenticate with GitHub through a simple OAuth flow
- Users receive a Pollinations token they can use for direct authentication
- Users can control which referrers (domains) can access their identity
- Both authentication methods (referrer and token) function correctly
- MCP server provides tools for authentication and token/referrer management
- Implementation maintains the "thin proxy" design principle
- System is designed to support future extensions
