# Implementation Plan: Consolidated Authentication & IP Queuing

## Overview
Extract IP queuing logic into shared utilities and standardize token/referrer handling across text.pollinations.ai and image.pollinations.ai, considering that legacy tokens can be passed as either tokens OR embedded in referrer strings.

## Key Findings from Code Analysis

### Current IP Queuing Implementations:
1. **text.pollinations.ai**: Uses `PQueue` with per-IP queues (6s interval, 1 concurrent)
2. **image.pollinations.ai**: Uses rate limiting (1 req per 10s per IP) but different approach

### Current Token/Referrer Issues:
1. **Inconsistent extraction**: Different header checking patterns
2. **Security flaw**: image.pollinations.ai has referrer fallback in token extraction
3. **Legacy token handling**: Tokens can be in referrer strings OR as proper tokens
4. **Mixed purposes**: Referrers used for analytics, queue bypass, model routing

## IP Queueing Analysis & Consolidation

### Current IP Queueing Implementations

#### text.pollinations.ai Implementation
- **Location**: `server.js` - `getQueue()` function (lines ~800-810)
- **Storage**: Uses `Map` object (`queues = new Map()`)
- **Configuration**: `new PQueue({ concurrency: 1, interval: 6000, intervalCap: 1 })`
- **Management**: Queues persist until manually cleaned up
- **Usage**: Called via `getQueue(ip).add(...)` pattern

#### image.pollinations.ai Implementation  
- **Location**: `src/index.js` - `checkCacheAndGenerate()` function (lines ~280-320)
- **Storage**: Uses plain object (`const ipQueue = {}`)
- **Configuration**: `new PQueue({ concurrency: 1, interval: 10000, intervalCap: 1 })`
- **Management**: Automatic cleanup when queue is empty (`delete ipQueue[ip]`)
- **Usage**: Direct access via `ipQueue[ip].add(...)` pattern
- **Features**: Queue position tracking, queue full detection (>=8), progress updates

### Key Differences to Reconcile
1. **Interval timing**: text.pollinations.ai uses 6000ms, image.pollinations.ai uses 10000ms
2. **Storage mechanism**: Map vs plain object
3. **Queue cleanup**: Manual vs automatic
4. **Queue limits**: No explicit limit vs 8-item limit  
5. **Progress tracking**: None vs detailed progress updates

### Proposed Shared IP Queue Module (`shared/ip-queue.js`)

#### Configuration Options
```javascript
const DEFAULT_CONFIG = {
  concurrency: 1,
  interval: 6000,        // Default to text service timing
  intervalCap: 1,
  maxQueueSize: 8,       // Adopt image service limit
  autoCleanup: true,     // Adopt image service behavior
  progressCallback: null // Optional progress tracking
};
```

#### Core Functions
1. **`getOrCreateQueue(ip, config = {})`** - Unified queue creation/retrieval
2. **`addToQueue(ip, task, config = {})`** - Add task with optional progress tracking
3. **`getQueueStatus(ip)`** - Get queue size, pending count, position
4. **`cleanupEmptyQueues()`** - Manual cleanup trigger
5. **`getAllQueueStats()`** - Global queue statistics

#### Service-Specific Configurations
- **text.pollinations.ai**: `{ interval: 6000, autoCleanup: false }`
- **image.pollinations.ai**: `{ interval: 10000, maxQueueSize: 8, progressCallback: updateProgress }`

## Implementation Strategy for IP Queueing

#### Phase 1: Create Shared Module
1. **Create** `shared/ip-queue.js` with backward-compatible API
2. **Implement** configuration-driven queue management
3. **Add** comprehensive error handling and logging
4. **Include** queue statistics and monitoring capabilities

#### Phase 2: Migrate text.pollinations.ai  
1. **Replace** `getQueue()` function with shared module calls
2. **Update** imports to use `shared/ip-queue.js`
3. **Configure** service-specific settings (6000ms interval, no auto-cleanup)
4. **Test** to ensure identical behavior

#### Phase 3: Migrate image.pollinations.ai
1. **Replace** `ipQueue` object and manual management
2. **Integrate** progress tracking with shared module
3. **Configure** service-specific settings (10000ms interval, queue limits)
4. **Maintain** existing queue position and progress features

#### Phase 4: Enhanced Features
1. **Add** queue monitoring and alerting
2. **Implement** queue priority levels for different token types
3. **Add** queue analytics and performance metrics
4. **Consider** Redis-based queuing for multi-instance deployments

## Implementation Plan

### Phase 1: Create Shared IP Queue Module

Create `/shared/ip-queue.js`:
```javascript
import PQueue from 'p-queue';
import { getClientIp, shouldBypassQueue } from './auth-utils.js';

const queues = new Map();

export function getQueueForIp(ip, options = {}) {
  const { concurrency = 1, interval = 10000, intervalCap = 1 } = options;
  if (!queues.has(ip)) {
    queues.set(ip, new PQueue({ concurrency, interval, intervalCap }));
  }
  return queues.get(ip);
}

export async function processWithQueueing(req, processFn, config, queueOptions = {}) {
  const ip = getClientIp(req);
  const { shouldBypass, reason } = await shouldBypassQueue(req, config);
  
  if (shouldBypass) {
    console.log(`Queue bypass for IP ${ip}: ${reason}`);
    return await processFn();
  }
  
  const queue = getQueueForIp(ip, queueOptions);
  return await queue.add(processFn);
}
```

### Phase 2: Enhanced Auth Utils

Update `/shared/auth-utils.js` to handle **legacy tokens in referrers**:

```javascript
// Add this function for legacy token support
export function isTokenInReferrer(referrer, validTokens) {
  if (!referrer || !validTokens) return false;
  
  if (typeof validTokens === 'string') {
    validTokens = validTokens.split(',').map(t => t.trim()).filter(Boolean);
  }
  
  // Check if any token is contained within the referrer string
  return validTokens.some(token => 
    referrer.toLowerCase().includes(token.toLowerCase()));
}

// Update shouldBypassQueue to check tokens in referrers
export async function shouldBypassQueue(req, config) {
  const token = extractToken(req);
  const referrer = extractReferrer(req);
  let userId = null;

  // 1. DB-backed token validation (highest priority)
  if (token && config.db && config.validateApiTokenDb) {
    userId = await validateTokenWithDb(token, config.db, config.validateApiTokenDb);
    if (userId) {
      return { shouldBypass: true, reason: 'valid_db_token', userId };
    }
  }

  // 2. Legacy token validation (proper tokens)
  if (token && config.validTokens && isValidToken(token, config.validTokens)) {
    return { shouldBypass: true, reason: 'valid_legacy_token', userId: null };
  }
  
  // 3. NEW: Legacy tokens embedded in referrer strings
  if (referrer && config.validTokens && isTokenInReferrer(referrer, config.validTokens)) {
    return { shouldBypass: true, reason: 'legacy_token_in_referrer', userId: null };
  }
  
  // 4. Allowlisted domains (lowest priority)
  if (referrer && config.allowlistedDomains && isDomainAllowlisted(referrer, config.allowlistedDomains)) {
    return { shouldBypass: true, reason: 'allowlisted_domain', userId: null };
  }
  
  return { shouldBypass: false, reason: 'no_bypass_criteria_met', userId: null };
}
```

### Phase 3: Update text.pollinations.ai

1. **Replace queue logic in server.js**:
```javascript
// Remove existing queue code:
// const queues = new Map();
// export function getQueue(ip) { ... }

// Replace with:
import { processWithQueueing } from '../shared/ip-queue.js';
import { shouldBypassQueue } from '../shared/auth-utils.js';

// In processRequest function:
async function processRequest(req, res, requestData) {
  const config = {
    validTokens: process.env.VALID_TOKENS,
    allowlistedDomains: process.env.ALLOWLISTED_DOMAINS || process.env.WHITELISTED_DOMAINS
  };
  
  const queueOptions = { concurrency: 1, interval: 6000, intervalCap: 1 };
  
  return await processWithQueueing(req, async () => {
    // Existing processing logic here
    return await generateTextBasedOnModel(requestData.messages, requestData);
  }, config, queueOptions);
}
```

2. **Update requestUtils.js**:
```javascript
// Replace getReferrer with shared function
import { extractReferrer, shouldBypassQueue } from '../shared/auth-utils.js';

// Replace shouldBypassDelay with:
export function shouldBypassDelay(req) {
  const config = {
    allowlistedDomains: WHITELISTED_DOMAINS
  };
  return shouldBypassQueue(req, config).then(result => result.shouldBypass);
}
```

### Phase 4: Update image.pollinations.ai

1. **Fix token extraction in config/tokens.js**:
```javascript
// REMOVE the security issue - no more referrer fallback!
export function extractToken(req) {
  const { query } = parse(req.url, true);
  if (query.token) return query.token;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return req.headers['x-pollinations-token'] || null;
  // REMOVED: || req.headers['referer'] || req.headers['referrer'] 
}
```

2. **Add IP queuing to createAndReturnImages.js**:
```javascript
import { processWithQueueing } from '../../shared/ip-queue.js';

export async function createAndReturnImageCached(prompt, safeParams, concurrentRequests, originalPrompt, progress, requestId, wasTransformedForBadDomain = false, token = null, referrer = null, req = null) {
  
  const config = {
    validTokens: process.env.VALID_TOKENS,
    allowlistedDomains: process.env.ALLOWLISTED_DOMAINS
  };
  
  const queueOptions = { concurrency: 1, interval: 10000, intervalCap: 1 };
  
  return await processWithQueueing(req, async () => {
    // Existing image generation logic
    const hasValidToken = token ? isValidToken(token) : false;
    return await generateImage(prompt, safeParams, concurrentRequests, progress, requestId, hasValidToken, referrer);
  }, config, queueOptions);
}
```

### Phase 5: Environment Variable Migration

1. **Standardize to allowlist terminology**:
   - `WHITELISTED_DOMAINS` → `ALLOWLISTED_DOMAINS` 
   - Support both during transition
   - Update all deployment configs

2. **Consolidate legacy tokens**:
   - Use the consolidated token list from REFERRER_TOKEN_REPORT.md
   - Set as `VALID_TOKENS` environment variable

## Testing Strategy

1. **Test token-in-referrer logic**:
   - Verify legacy tokens in referrer strings work
   - Verify proper tokens still work
   - Verify no referrer fallback in token extraction

2. **Test IP queuing**:
   - Verify queue bypass for valid tokens/domains
   - Verify rate limiting for regular requests
   - Test across both services

3. **Backward compatibility**:
   - Ensure existing API behavior unchanged
   - Test with real legacy clients

## Rollout Plan

1. **Week 1**: Implement shared utilities
2. **Week 2**: Update text.pollinations.ai 
3. **Week 3**: Update image.pollinations.ai
4. **Week 4**: Testing and monitoring

## Key Benefits

1. **Security**: Removes referrer fallback from token extraction
2. **Consistency**: Same authentication logic across services  
3. **Legacy Support**: Maintains compatibility with tokens in referrers
4. **Performance**: Unified IP queuing reduces duplicate logic
5. **Maintainability**: Single source of truth for auth logic

## Enhanced Security & Token Validation

### Current Token Extraction Analysis

#### text.pollinations.ai Token Handling
- **Primary**: Uses `shouldBypassDelay()` with referrer domain checking
- **Secondary**: No direct token extraction, relies on domain whitelisting
- **Security Issue**: Uses referrer for authentication decisions

#### image.pollinations.ai Token Handling  
- **Primary**: `extractToken()` with fallback to referrer (SECURITY RISK)
- **Validation**: `isValidToken()` checks against environment variables
- **Bypass Logic**: Valid tokens skip IP queueing entirely

### Security Improvements

#### Remove Referrer Fallback
- **CRITICAL**: Remove `req.headers.referer` fallback in `extractToken()`
- **Rationale**: Referrer headers are easily spoofed and unreliable
- **Impact**: Forces proper token authentication for queue bypass

#### Enhanced Token Sources
1. **Authorization header**: `Bearer <token>` (highest priority)
2. **Custom header**: `X-Pollinations-Token: <token>`
3. **Query parameter**: `?token=<token>` (lowest priority)
4. **Body parameter**: `token` field in POST requests

#### Legacy Token Detection
- **Function**: `hasLegacyTokenInReferrer(req)` - detect old embedded tokens
- **Purpose**: Maintain backward compatibility during migration
- **Security**: Read-only detection, no authentication bypass
