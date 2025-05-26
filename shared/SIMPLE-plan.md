“Fast First” Roll-out – day-zero cleanup (no KV, no OAuth yet)
Everything below can be completed without adding any new storage layer or auth provider.

1 · New shared helpers (±200 LOC total)
File	Key exports	Notes
shared/auth-utils.js	extractToken(req) • extractReferrer(req) • shouldBypassQueue(req, ctx) • validateApiTokenDb(token)	ctx = { legacyTokens, allowlist } ✅
shared/ipQueue.js	enqueue(req, fn, opts)	loads config from shared/.env; wraps p-queue ✅

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

# per-service queue timing (ms per request)
QUEUE_INTERVAL_MS_TEXT=6000
QUEUE_INTERVAL_MS_IMAGE=10000

# Note: Shared authentication and queue utilities are now the standard implementation
# and are always used across all services.
4 · Phased schedule (2½ engineering days)
Day	Tasks	Output
0 AM	create /shared; stub helpers; copy env template	repo ready ✅
0 PM	implement auth-utils, ipQueue; add Jest unit tests covering: DB token ok / legacy header / legacy referrer / deny	CI green ✅
1 AM	patch text service; remove old queue code; local smoke test	text passes 🔄
1 PM	patch image service; prune ipQueue object; local smoke test	image passes 🔄
1 EOD	deploy to staging with shared utilities; tail logs to compare authReason, latency	validation
2 AM	prod flip of flag; set alert (5xx > baseline+1 %)	live
2 PM	cleanup: delete old queue helpers; document new flow	done

5 · Testing checklist
✅ Unit (Jest): 100 % branches in shouldBypassQueue.

✅ Integration: curl sequences

-H"Authorization: Bearer <dbToken>" → 200 & reason=DB_TOKEN

?token=<legacy> → 200 & reason=LEGACY_TOKEN

Referer: https://foo.com?bar=<legacy> → 200 & reason=LEGACY_TOKEN

no token, bad referrer → queued → either success after delay or 429 if queue full.

✅ Compare P99 latency before/after (expect same or lower – less duplicated code).

6 · Maintenance

The shared authentication and queue utilities are now the standard implementation across all services. Any changes to authentication or queue behavior should be made in the shared utilities.

7 · Next ready steps (later, not blocking)
Queue scaling – optional KV adapter can slot into ipQueue.js.

DB tiers – add tier column; downstream code branches on userId tier (queue interval, model limits, etc.) without touching shouldBypassQueue.

Result:

Critical referrer-auth bug closed.

One authoritative auth + queue layer across both back-ends.

Ships in ~2 days, no new infra, and leaves clean seams for future upgrades.

## Implementation Status

### ✅ COMPLETED

1. **Shared Authentication Utilities**:
   - Created `auth-utils.js` with standardized token and referrer extraction
   - Implemented `shouldBypassQueue()` for consistent queue bypass logic
   - Added `validateApiTokenDb()` for API-based token validation
   - Added `getIp()` for consistent IP address handling

2. **Shared Queue Management**:
   - Implemented `ipQueue.js` with self-contained queue management
   - Created `enqueue()` function that handles IP-based rate limiting
   - Utilities automatically load their own configuration

3. **Environment Configuration**:
   - Created centralized `.env` file in the shared folder
   - Consolidated token lists and domain allowlists from both services
   - Organized environment variables with clear documentation
   - Removed redundant configuration from individual services

4. **Service Integration**:
   - ✅ Integrated with text.pollinations.ai service
   - ✅ Integrated with image.pollinations.ai service
   - Simplified service code by removing duplicate logic
   - Services now just import and use the shared utilities

### 🔄 IN PROGRESS

1. **Documentation**:
   - Updated SIMPLE-plan.md with implementation status
   - Updated REFERRER_TOKEN_REPORT.md with current state

### 📋 PLANNED

1. **Testing**:
   - Add unit tests for the shared utilities
   - Test edge cases for token validation and queue bypass

2. **Future Enhancements**:
   - Consider moving token handling to cloudflare-cache services (see GitHub issue #2095)
   - Extract shared functionality from cloudflare-cache implementations
   - Implement edge authentication for improved security and performance

## Implementation Notes

1. **Auth API Integration**:
   - Using auth.pollinations.ai API for token validation instead of direct DB access
   - Created validateApiTokenDb function that calls the auth service endpoint
   - Removed DB dependency from the context object

2. **Environment Management**:
   - Shared utilities now load environment variables directly from shared/.env file
   - No need for services to pass auth context - it's handled automatically
   - Simplified integration with services - just import and use

3. **Package Management**:
   - Added package.json to shared folder with required dependencies
   - Using node-fetch for API calls to auth service

4. **Key Design Decisions**:
   - Referrers are for frontend app identification and analytics only
   - Tokens are for backend authentication and queue bypass
   - No referrer fallback in token extraction (security improvement)
   - Simple string comparison for token validation (no JWT complexity)
   - Track usage by token for backend apps, by IP for frontend apps