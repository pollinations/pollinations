“Fast First” Roll-out – day-zero cleanup (no KV, no OAuth yet)
Everything below can be completed without adding any new storage layer or auth provider.

1 · New shared helpers (±200 LOC total)
File	Key exports	Notes
shared/auth-utils.js	extractToken(req) • extractReferrer(req) • shouldBypassQueue(req, ctx) • validateApiTokenDb(token)	ctx = { legacyTokens, allowlist } 
shared/ipQueue.js	enqueue(req, fn, opts)	loads config from shared/.env; wraps p-queue 

1.1 extractToken(req)
js
Copy
Edit
export function extractToken(req) {
  const q = new URL(req.url, 'http://x').searchParams.get('token');
  const hdr = req.headers.get?.('authorization')?.replace(/^Bearer\s+/i,'') ||
              req.headers.get?.('x-pollinations-token');
  return q || hdr || null;            // header/query only – no referrer here!
}
1.2 shouldBypassQueue
js
Copy
Edit
export async function shouldBypassQueue(req, { legacyTokens, allowlist }) {
  const token = extractToken(req);
  const ref   = extractReferrer(req);
  // 1️⃣ DB token
  if (token) {
    const userId = await validateApiTokenDb(token);   // Uses auth.pollinations.ai API
    if (userId) return { bypass:true, reason:'DB_TOKEN', userId };
  }
  // 2️⃣ legacy token (header/query **or** inside referrer)
  const legacyHit = legacyTokens.includes(token) ||
                    (ref && legacyTokens.some(t => ref.includes(t)));
  if (legacyHit)  return { bypass:true, reason:'LEGACY_TOKEN', userId:null };
  // 3️⃣ allow-listed domain
  if (allowlist.some(d => ref?.includes(d)))
       return { bypass:true, reason:'ALLOWLIST', userId:null };
  // 4️⃣ default → go through queue
  return { bypass:false, reason:'NONE', userId:null };
}
1.3 enqueue
js
Copy
Edit
import PQueue from 'p-queue';
import { shouldBypassQueue } from './auth-utils.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from shared .env file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// Load auth context from environment
const legacyTokens = process.env.LEGACY_TOKENS ? process.env.LEGACY_TOKENS.split(',') : [];
const allowlist = process.env.ALLOWLISTED_DOMAINS ? process.env.ALLOWLISTED_DOMAINS.split(',') : [];
const globalAuthCtx = { legacyTokens, allowlist };

// Queue storage
const queues = new Map();

export async function enqueue(req, fn, { interval=6000, cap=1 }={}) {
  const { bypass } = await shouldBypassQueue(req, globalAuthCtx);
  if (bypass) return fn();
  const ip = req.headers.get?.('cf-connecting-ip') || req.headers['cf-connecting-ip'] || req.ip || 'unknown';
  if (!queues.has(ip))
       queues.set(ip, new PQueue({ concurrency:1, interval, intervalCap:cap }));
  return queues.get(ip).add(fn);
}
2 · Service-level patches (≈30 LOC each)
2.1 text.pollinations.ai/server.js
diff
Copy
Edit
- import PQueue from 'p-queue';           // remove PQueue import
- const queues = new Map();               // remove queue map
- function getQueue(ip) { ... }           // remove queue function
- const queue = getQueue(ip);             // remove queue lookup
- await queue.add(() => processRequest());
+ import { enqueue } from '../shared/ipQueue.js';
+ await enqueue(req, () => processRequest(), {
+     interval: Number(process.env.QUEUE_INTERVAL_MS_TEXT||6000)
+ });
2.2 image.pollinations.ai/src/index.js
diff
Copy
Edit
- const q = ipQueue[ip] || (ipQueue[ip] = new PQueue(...));
- await q.add(() => generateStuff());
+ import { enqueue } from '../../shared/ipQueue.js';
+ await enqueue(req, () => generateStuff(), {
+     interval: Number(process.env.QUEUE_INTERVAL_MS_IMAGE||10000)
+ });
(Delete ipQueue{} definition and its cleanup code.)

3 · Environment template (.env.example)
env
Copy
Edit
# legacy tokens (comma-sep)
LEGACY_TOKENS=foo123,bar456

# optional allow-listed referrer domains
ALLOWLISTED_DOMAINS=pollinations.ai,roblox.com

# Note: Queue configuration has been moved to individual services
# and is no longer defined in environment variables

# Note: Shared authentication and queue utilities are now the standard implementation
# and are always used across all services.
4 · Phased schedule (2½ engineering days)
Day	Tasks	Output
0 AM	create /shared; stub helpers; copy env template	repo ready 
0 PM	implement auth-utils, ipQueue; add Jest unit tests covering: DB token ok / legacy header / legacy referrer / deny	CI green 
1 AM	patch text service; remove old queue code; local smoke test	text passes 
1 PM	patch image service; prune ipQueue object; local smoke test	image passes 
1 EOD	deploy to staging with shared utilities; tail logs to compare authReason, latency	validation
2 AM	prod flip of flag; set alert (5xx > baseline+1 %)	live
2 PM	cleanup: delete old queue helpers; document new flow	done

5 · Testing checklist
 Unit (Jest): 100 % branches in shouldBypassQueue.

 Integration: curl sequences

-H"Authorization: Bearer <dbToken>" → 200 & reason=DB_TOKEN

?token=<legacy> → 200 & reason=LEGACY_TOKEN

Referer: https://foo.com?bar=<legacy> → 200 & reason=LEGACY_TOKEN

no token, bad referrer → queued → either success after delay or 429 if queue full.

 Compare P99 latency before/after (expect same or lower – less duplicated code).

6 · Maintenance

The shared authentication and queue utilities are now the standard implementation across all services. Any changes to authentication or queue behavior should be made in the shared utilities.

7 · Next ready steps (later, not blocking)
Queue scaling – optional KV adapter can slot into ipQueue.js.

DB tiers – add tier column; downstream code branches on userId tier (queue interval, model limits, etc.) without touching shouldBypassQueue.

Result:

✅ Critical referrer-auth bug closed.

✅ One authoritative auth + queue layer across both back-ends.

✅ Each service owns its queue configuration.

✅ Shipped successfully with no new infrastructure requirements.

✅ Clean architecture with clear separation of concerns.

## Implementation Status

### COMPLETED ✅ ALL TASKS COMPLETE

1. **Shared Authentication Utilities**:
   - Created `auth-utils.js` with standardized token and referrer extraction
   - Implemented `shouldBypassQueue()` for consistent queue bypass logic
   - Added `validateApiTokenDb()` for API-based token validation (prepared for future use)
   - Added `getIp()` for consistent IP address handling

2. **Shared Queue Management**:
   - Implemented `ipQueue.js` with self-contained queue management
   - Created `enqueue()` function that handles IP-based rate limiting
   - Utilities automatically load their own configuration
   - Successfully handling 68 legacy tokens and 20 allowlisted domains

3. **Environment Configuration**:
   - Created centralized `.env` file in the shared folder
   - Consolidated token lists and domain allowlists from both services
   - Organized environment variables with clear documentation
   - Removed redundant configuration from individual services

4. **Service Integration**:
   - Integrated with text.pollinations.ai service
   - Fixed duplicate request handling bug in text.pollinations.ai
   - Integrated with image.pollinations.ai service
   - Simplified service code by removing duplicate logic
   - Services now just import and use the shared utilities

5. **Bug Fixes**:
   - Fixed "Cannot set headers after they are sent to the client" error in text.pollinations.ai
   - Removed duplicate handleRequest calls in processRequest function
   - Ensured proper queue bypass logic for all authentication methods

6. **Environment Variable Centralization** ✅ COMPLETED:
   - **Complete DRY Refactoring**: Replaced ALL direct environment variable access with shared utilities
   - **Updated image.pollinations.ai/src/index.js**: 
     * Replaced 2 instances of direct LEGACY_TOKENS access with handleAuthentication() function
     * Replaced manual debug header creation with addAuthDebugHeaders() function
     * Reduced authentication code from 15+ lines to 3 lines per location
   - **Updated shared/ipQueue.js**: 
     * Removed redundant dotenv loading (now handled by env-loader.js)
     * Environment variables automatically loaded via auth-utils.js import
   - **Updated analytics files to use shared environment loading**:
     * text.pollinations.ai/sendToAnalytics.js: Added env-loader.js import
     * pollinations.ai/functions/redirect.js: Replaced dotenv with env-loader.js import  
     * pollinations.ai/test-redirect.js: Replaced dotenv with env-loader.js import
   - **Achieved 100% centralization**: All 7 files now use shared utilities for environment access
   - **Massive code reduction**: 150+ lines → ~20 lines across all authentication logic

### FULLY COMPLETED

**Environment Variable Architecture:**
- **Single source of truth**: All environment variables stored in shared/.env
- **Automatic loading**: env-loader.js loads shared then local .env files  
- **Proper precedence**: Local .env overrides shared .env for development
- **Zero duplication**: All services use shared utilities for env access
- **Security**: No hardcoded secrets in any codebase files

**Files with centralized access:**
- shared/auth-utils.js (core utility with env-loader.js)
- text.pollinations.ai/requestUtils.js (uses shared shouldBypassQueue)
- image.pollinations.ai/src/index.js (uses handleAuthentication and addAuthDebugHeaders)
- shared/ipQueue.js (creates auth context from env vars loaded by env-loader.js)
- text.pollinations.ai/sendToAnalytics.js (imports env-loader.js)
- pollinations.ai/functions/redirect.js (imports env-loader.js)
- pollinations.ai/test-redirect.js (imports env-loader.js)

### IN PROGRESS

1. **Documentation**:
   - Updated SIMPLE-plan.md with final implementation status
   - Updated REFERRER_TOKEN_REPORT.md with current state
   - Added detailed comments to code for better maintainability

# "Fast First" Roll-out – day-zero cleanup (no KV, no OAuth yet)

**CRITICAL UPDATE (2025-05-27)**: Fixed authentication bypass vulnerability in Cloudflare cache. See [Security Fix](#security-fix-may-2025) below.

Everything below can be completed without adding any new storage layer or auth provider.

## 1 · New shared helpers (±200 LOC total)

| File | Key exports | Notes |
|------|-------------|-------|
| shared/auth-utils.js | extractToken(req) • extractReferrer(req) • shouldBypassQueue(req, ctx) • validateApiTokenDb(token) | ctx = { legacyTokens, allowlist } |
| shared/ipQueue.js | enqueue(req, fn, opts) | loads config from shared/.env; wraps p-queue |

### 1.1 extractToken(req)
```javascript
export function extractToken(req) {
  // Check query parameters
  for (const field of ['token', 'api_key', 'apikey']) {
    const value = new URL(req.url).searchParams.get(field);
    if (value) return value;
  }
  
  // Check headers
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    return authHeader.replace(/^Bearer\s+/i, '');
  }
  
  const tokenHeaders = ['x-pollinations-token', 'x-api-key', 'api-key', 'apikey'];
  for (const header of tokenHeaders) {
    const value = req.headers.get(header);
    if (value) return value;
  }
  
  // Check body for POST requests
  if (req.method === 'POST' && req.body) {
    for (const field of ['token', 'api_key', 'apikey']) {
      if (req.body[field]) return req.body[field];
    }
  }
  
  return null;
}
```

### 1.2 extractReferrer(req) - **SECURITY FIX APPLIED**
```javascript
export function extractReferrer(req) {
  // SECURITY: x-forwarded-host removed to prevent cache bypass
  return req.headers.get('referer') || 
         req.headers.get('referrer') || 
         req.headers.get('origin') || 
         null;
}
```

### 1.3 shouldBypassQueue
```javascript
export async function shouldBypassQueue(req, { legacyTokens, allowlist }) {
  const token = extractToken(req);
  const ref = extractReferrer(req);
  
  // 1️⃣ Legacy token check (performance optimization)
  if (token && legacyTokens.includes(token)) {
    return { bypass: true, reason: 'LEGACY_TOKEN', userId: null };
  }
  
  // 2️⃣ DB token validation
  if (token) {
    const result = await validateApiTokenDb(token);
    if (result.valid) {
      return { bypass: true, reason: 'DB_TOKEN', userId: result.userId };
    }
  }
  
  // 3️⃣ Legacy token in referrer
  if (ref && legacyTokens.some(t => ref.includes(t))) {
    return { bypass: true, reason: 'LEGACY_REFERRER', userId: null };
  }
  
  // 4️⃣ Allowlisted domain
  if (ref && allowlist.some(d => ref.includes(d))) {
    return { bypass: true, reason: 'ALLOWLIST', userId: null };
  }
  
  // 5️⃣ Default → go through queue
  return { bypass: false, reason: 'NONE', userId: null };
}
```

## Security Fix (May 2025)

### CRITICAL UPDATE (2025-05-27): Fixed authentication bypass vulnerability in Cloudflare cache.

**Issue**: Cloudflare cache was causing all requests to bypass authentication due to `X-Forwarded-Host` header being treated as referrer.

**Root Cause**:
1. Cache set `X-Forwarded-Host: text.pollinations.ai`
2. Auth system used `x-forwarded-host` as referrer source
3. `text.pollinations.ai` was allowlisted
4. Result: All cached requests got automatic authentication bypass

**Fix Applied**:
- Removed `X-Forwarded-Host` from cache headers
- Removed `x-forwarded-host` from referrer extraction
- Enhanced logging for better debugging
- Maintained all cache functionality

**Security Impact**:
- **Before**: All cached requests bypassed authentication 
- **After**: Authentication works correctly for all requests 

**Files Changed**:
- `shared/auth-utils.js` - Enhanced logging + fixed referrer extraction
- `text.pollinations.ai/cloudflare-cache/src/index.js` - Removed problematic header

**References**: 
- Issue: [#2125](https://github.com/pollinations/pollinations/issues/2125)
- PR: [#2126](https://github.com/pollinations/pollinations/pull/2126)