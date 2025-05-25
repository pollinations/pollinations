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
   - Implement proper token-based authentication
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

## 7. Recommendations

1. **Immediate Actions:**
   - Standardize referrer extraction into a shared utility function
   - Move all hardcoded domain lists to environment variables
   - Remove referrer fallback in image.pollinations.ai token extraction
   - Implement proper logging for all authentication attempts

2. **Authentication Strategy:**
   - **Frontend Apps (no backend)**: Use referrer-based identification + IP-based queuing
   - **Backend Apps**: Use token-based authentication with no queuing
   - Maintain simple token validation (string comparison)
   - No JWT implementation needed for text/image APIs

3. **Short-term Improvements:**
   - Create unified token validation middleware
   - Standardize token extraction (Authorization header, x-pollinations-token, query param)
   - Implement token-based usage tracking (no queue for token requests)
   - Clear separation: referrers for analytics/identification, tokens for authentication

4. **Implementation Details:**
   - Keep referrer checking for frontend apps (browser-based usage)
   - Bypass IP queue for valid token requests
   - Track usage by token instead of IP for backend apps
   - Maintain whitelist for trusted domains (queue bypass)

## 9. Final Recommendations

Based on all findings and the simplified authentication strategy:

1. **Immediate**: Standardize token/referrer extraction utilities
2. **High Priority**: 
   - Implement token-based queue bypass in both services
   - Remove referrer fallback from token extraction
   - Consolidate domain whitelists to environment variables
3. **Medium Priority**: 
   - Create shared authentication utilities
   - Implement token-based usage tracking
   - Standardize error responses
4. **Low Priority**: Clean up legacy code and improve documentation

The simplified approach maintains security while being practical:
- Frontend apps use referrer + IP queuing (current behavior)
- Backend apps use tokens for authentication and bypass queuing
- No complex JWT infrastructure needed for the APIs
- auth.pollinations.ai remains separate for user management
