# Comprehensive Report: Referrer and Token Handling in Pollinations.AI Services

## Executive Summary

The handling of referrers and tokens across text.pollinations.ai and image.pollinations.ai is indeed messy and inconsistent. Both services implement different approaches to authentication, rate limiting, and access control, with overlapping but distinct purposes for referrers and tokens.

## 1. text.pollinations.ai

### 1.1 Referrer Handling

**Purpose:** Referrers are used for multiple purposes:
- **Queue bypass/priority access** for whitelisted domains
- **Analytics tracking** 
- **Ad system targeting**
- **Special model routing** (e.g., Roblox users)

**Implementation Details:**

1. **Extraction Logic** (`requestUtils.js`):
   ```javascript
   const referer = req.headers.referer || req.headers.referrer || 
                   req.headers.origin || data.referrer || data.origin || 
                   req.headers['http-referer'] || 'unknown';
   ```
   - Multiple fallback sources for referrer extraction
   - Inconsistent header naming (referer vs referrer)

2. **Whitelisted Domains** (`requestUtils.js`):
   - Environment variable: `WHITELISTED_DOMAINS`
   - Domains that bypass queue delays
   - Used for `isImagePollinationsReferrer` flag

3. **Special Handling**:
   - **Roblox Detection**: Automatically routes to "llamascout" model
   - **Bad Domains**: Forces 100% ad probability in ad system
   - **Analytics**: All referrers sent to Google Analytics

4. **Ad System Integration** (`shouldShowAds.js`):
   - Skips ads for `roblox` and `image.pollinations.ai` referrers
   - Bad domains trigger forced ad display

### 1.2 Token Handling

**Purpose:** Primarily for external API authentication

**Types of Tokens:**

1. **API Tokens** (referenced in code but not deeply implemented):
   - Bearer tokens in Authorization headers
   - Used by Portkey integration for various AI providers

2. **Service-Specific Tokens**:
   - Used for accessing external AI model providers
   - Managed through environment variables

**No User Authentication Tokens**: Unlike image.pollinations.ai, there's no user-level token system for access control.

## 2. image.pollinations.ai

### 2.1 Referrer Handling

**Purpose:** Security and access control

**Implementation Details:**

1. **Extraction Logic** (`utils/BadDomainHandler.js`):
   ```javascript
   const referrer = headers?.referer || headers?.referrer || 
                    headers?.['referer'] || headers?.['referrer'] || 
                    headers?.origin;
   ```
   - Similar inconsistent extraction pattern

2. **Bad Domain Detection**:
   - Environment variable: `BAD_DOMAINS`
   - Transforms prompts to "semantic opposites" with 60% probability
   - Prevents abuse from specific domains

3. **Approved Referrers** (`createAndReturnImages.js`):
   - Hardcoded list of approved domains
   - Grants access to GPT Image model without token
   - Includes: pollinations.ai, github.com, reddit.com, discord.com, etc.

### 2.2 Token Handling

**Purpose:** Queue bypass and premium model access

**Implementation Details:**

1. **Token Sources** (`config/tokens.js`):
   ```javascript
   // Priority order:
   1. Query parameter: ?token=xxx
   2. Authorization header: Bearer xxx
   3. Custom header: x-pollinations-token
   4. Fallback to referrer headers (weird!)
   ```

2. **Valid Tokens**:
   - Environment variable: `VALID_TOKENS` (comma-separated)
   - Stored as a Set for O(1) lookup
   - Grants:
     - Queue bypass for non-GPT models
     - Access to GPT Image model

3. **Token Benefits**:
   - Skip rate limiting queue
   - Priority processing
   - Access to restricted models

## 3. Major Issues Identified

### 3.1 Inconsistent Referrer Extraction
- Both services check multiple header variations
- No standardized extraction function
- Fallback to referrer headers in token extraction (image service)

### 3.2 Mixed Purposes
- Referrers serve too many purposes:
  - Analytics
  - Access control
  - Model routing
  - Ad targeting
  - Rate limiting

### 3.3 Security Concerns
- Referrer headers can be easily spoofed
- Using referrers for authentication is insecure
- Token extraction falls back to referrer headers

### 3.4 Hardcoded Values
- Approved domains hardcoded in image service
- No centralized configuration

### 3.5 Naming Inconsistencies
- "referer" vs "referrer" throughout codebase
- "WHITELISTED_DOMAINS" vs approved domains list
- Different environment variable patterns

## 4. Recommendations

### 4.1 Immediate Actions

1. **Standardize Referrer Extraction**:
   ```javascript
   // Create shared utility
   export function extractReferrer(req) {
     return req.headers.referer || 
            req.headers.referrer || 
            req.headers.origin || 
            req.body?.referrer || 
            'unknown';
   }
   ```

2. **Separate Concerns**:
   - Use referrers ONLY for analytics
   - Use tokens for authentication/access control
   - Create separate flags for model routing

3. **Fix Token Extraction**:
   - Remove referrer fallback in image service
   - Standardize token header usage

### 4.2 Long-term Improvements

1. **Unified Authentication System**:
   - Implement proper JWT-based user authentication
   - Consistent token validation across services
   - Rate limiting based on authenticated users

2. **Configuration Management**:
   - Move all domain lists to environment variables
   - Create shared configuration service
   - Document all environment variables

3. **Security Enhancements**:
   - Don't rely on referrers for security
   - Implement proper CORS policies
   - Add request signing for internal services

4. **Code Organization**:
   - Create shared libraries for common functionality
   - Consistent naming conventions
   - Proper TypeScript interfaces

## 5. Environment Variables Summary

### text.pollinations.ai
- `WHITELISTED_DOMAINS` - Domains that bypass queue
- `GA_MEASUREMENT_ID` - Google Analytics ID
- `GA_API_SECRET` - Google Analytics secret
- Various API keys for AI providers

### image.pollinations.ai
- `VALID_TOKENS` - Comma-separated list of valid tokens
- `BAD_DOMAINS` - Comma-separated list of domains to transform
- `CLOUDFLARE_API_TOKEN` - For Cloudflare AI models
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account

## 6. auth.pollinations.ai - Future Authentication Service

### 6.1 Overview

The auth.pollinations.ai service represents a modern, clean approach to authentication that could serve as the foundation for unified authentication across all Pollinations services. It implements:

- **GitHub OAuth Flow**: Primary authentication method
- **JWT Token System**: Standard JWT tokens with 24-hour expiration
- **Domain Allowlist Management**: Per-user domain restrictions
- **API Token Generation**: Simple 16-character tokens for service access

### 6.2 Key Features

**Authentication Flow:**
1. GitHub OAuth authentication (`/authorize` → `/callback`)
2. JWT token generation for session management
3. API token generation for service-to-service authentication

**Token Implementation:**
```typescript
// JWT Token Creation (24-hour expiration)
const jwt = await new jose.SignJWT({
  sub: userId,
  username,
})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('24h')
  .sign(secret);

// API Token Generation (16-character, URL-safe)
const buffer = new Uint8Array(12);
crypto.getRandomValues(buffer);
const token = btoa(String.fromCharCode(...buffer))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=/g, '')
  .substring(0, 16);
```

**Endpoints:**
- `GET /authorize?redirect_uri=...` - Start OAuth flow
- `GET /callback` - GitHub OAuth callback
- `GET /api/user` - Get current user (JWT required)
- `GET /api/domains?user_id=...` - Get domain allowlist
- `POST /api/domains?user_id=...` - Update domain allowlist
- `GET /api/check-domain?user_id=...&domain=...` - Check domain access
- `GET /api/token?user_id=...` - Get API token
- `POST /api/token?user_id=...` - Generate new API token

### 6.3 Database Schema

```sql
-- Simplified user storage
CREATE TABLE users (
  github_user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API tokens for service access
CREATE TABLE api_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(github_user_id)
);

-- Domain allowlist (replacing referrer checks)
CREATE TABLE domains (
  user_id TEXT,
  domain TEXT,
  PRIMARY KEY (user_id, domain),
  FOREIGN KEY (user_id) REFERENCES users(github_user_id)
);
```

### 6.4 Integration Strategy

**For text.pollinations.ai:**
1. Replace referrer-based whitelisting with domain allowlist checks
2. Use API tokens instead of environment-based token lists
3. Implement JWT validation for user requests
4. Migrate from service-specific auth to centralized system

**For image.pollinations.ai:**
1. Replace hardcoded approved domains with database lookups
2. Migrate from comma-separated VALID_TOKENS to API token validation
3. Use domain allowlist instead of bad domain checks
4. Implement proper user authentication for queue bypass

**Benefits of Migration:**
- **Centralized Authentication**: Single source of truth for user identity
- **Dynamic Configuration**: No more hardcoded domain lists
- **Better Security**: Proper OAuth flow instead of referrer checks
- **User Management**: Actual user accounts with permissions
- **Scalability**: Database-backed instead of environment variables

### 6.5 Referrer Handling in auth.pollinations.ai

**Current State**: The service does NOT use referrers for authentication or access control at all. This is the correct approach.

**Domain Management**: Instead of referrer checking, it uses:
- Explicit domain allowlists per user
- Database-backed domain validation
- No reliance on spoofable headers

This represents the ideal pattern that should be adopted by both text and image services.

## Conclusion

The current implementation mixes authentication, analytics, and access control concerns across both services with inconsistent patterns. A refactoring effort is needed to:
1. Separate referrer usage (analytics only) from authentication (tokens only)
2. Standardize extraction and validation logic
3. Implement proper security measures
4. Create shared utilities to reduce code duplication

This will make the system more maintainable, secure, and easier to understand.

## 7. Recommendations

1. **Immediate Actions:**
   - Standardize referrer extraction into a shared utility function
   - Move all hardcoded domain lists to environment variables
   - Remove referrer fallback in image.pollinations.ai token extraction
   - Implement proper logging for all authentication attempts

2. **Short-term Improvements:**
   - Create unified token validation middleware
   - Implement rate limiting based on user tokens instead of IP
   - Add proper JWT token support to image.pollinations.ai
   - Create clear separation between analytics and access control

3. **Long-term Strategy:**
   - Migrate both services to use auth.pollinations.ai
   - Implement proper user management system
   - Use OAuth flows for third-party integrations
   - Remove all referrer-based authentication

## 8. Additional Findings from Comprehensive Search

### 8.1 IP-Based Access Control

Both services implement IP-based blocking and rate limiting:

**text.pollinations.ai:**
- Queue system per IP address using `p-queue` library
- IP extraction from multiple headers (x-forwarded-for, x-real-ip, cf-connecting-ip)
- IP-based analytics tracking
- Queue bypass logic combined with referrer checks

**image.pollinations.ai:**
- In-memory IP violation tracking
- IP blocking for safety violations
- IP-based rate limiting (10 violations = 30 min block)
- Cloudflare Worker forwards client IP headers

### 8.2 Authentication Header Patterns

**Bearer Token Usage:**
- image.pollinations.ai: Supports Bearer tokens in Authorization header
- text.pollinations.ai: Uses Bearer tokens for external API calls (Portkey, Azure, etc.)
- Both services use Bearer format but for different purposes

**Custom Headers:**
- `x-pollinations-token`: Custom header for token extraction in image service
- Multiple API key headers for various AI providers

### 8.3 CORS Implementation

Both services implement CORS headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Content-Type`
- No authentication headers in CORS configuration

### 8.4 External API Key Management

Extensive use of environment variables for API keys:
- Azure OpenAI (multiple endpoints)
- Scaleway (Pixtral, Mistral)
- OpenRouter
- Cloudflare
- Bing Search API
- Google Analytics

### 8.5 Security Considerations Not Previously Mentioned

1. **No Session Management**: Neither service implements session cookies or session storage
2. **Token Extraction Fallback**: image.pollinations.ai falls back to referrer headers if no token found
3. **Public CORS**: Both services allow all origins, potentially enabling CSRF attacks
4. **IP Spoofing Risk**: Relying on headers for IP detection can be spoofed
5. **No Rate Limit Headers**: Services don't return rate limit information to clients

### 8.6 Model Context Protocol (MCP) Integration

A new MCP service exists that:
- Implements OAuth flow for Pollinations
- Uses PKCE for enhanced security
- Provides structured access to Pollinations resources
- Could serve as a template for API authentication

## 9. Final Recommendations

Based on all findings, the priority should be:

1. **Immediate**: Remove referrer-based authentication entirely
2. **High Priority**: Implement auth.pollinations.ai integration
3. **Medium Priority**: Standardize token formats and validation
4. **Low Priority**: Clean up legacy code and consolidate utilities

The auth.pollinations.ai service provides a clean, secure foundation that both text and image services should adopt to eliminate current security vulnerabilities and inconsistencies.
