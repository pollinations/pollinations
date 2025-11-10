# Auth.pollinations.ai Database Performance Optimization Plan

## Issue
**GitHub Issue**: [#2604](https://github.com/pollinations/pollinations/issues/2604)
**Priority**: HIGH - Users experiencing 30+ second response times vs 7 seconds without tokens

## Current Performance Baseline
- **Test token**: `BpigHXfbVA0xQFQ1`
- **Current response time**: ~12 seconds (confirmed)
- **Current flow**: 3 separate database queries per token validation

## Root Cause Analysis

### Current Token Validation Flow
```typescript
// handleValidateToken in index.ts makes 3 sequential DB calls:
const userId = await validateApiToken(env.DB, token);        // 1️⃣ Query 1
const tier = await getUserTier(env.DB, userId);              // 2️⃣ Query 2  
const user = await getUser(env.DB, userId);                  // 3️⃣ Query 3
```

### Performance Issues
1. **Multiple round trips**: 3 separate queries instead of 1 JOIN
2. **Missing indexes**: No explicit indexes on lookup columns
3. **Sequential execution**: Queries are not parallelized
4. **No caching**: Every request hits the database

## Implementation Plan - SIMPLEST FIRST

### Phase 1: ONE DB QUERY (Immediate - 30 minutes)
**Impact**: 60-80% performance improvement

Replace 3 queries with 1 JOIN query:

```typescript
// NEW: Single consolidated query
export async function validateApiTokenComplete(db: D1Database, token: string): Promise<{
  userId: string | null;
  username: string | null;
  tier: UserTier | null;
}> {
  const result = await db.prepare(`
    SELECT 
      at.user_id,
      u.username,
      COALESCE(ut.tier, 'seed') as tier
    FROM api_tokens at
    INNER JOIN users u ON at.user_id = u.github_user_id
    LEFT JOIN user_tiers ut ON u.github_user_id = ut.user_id
    WHERE at.token = ?
  `).bind(token).first();
  
  if (!result) {
    return { userId: null, username: null, tier: null };
  }
  
  return {
    userId: result.user_id as string,
    username: result.username as string,
    tier: result.tier as UserTier
  };
}
```

### Phase 2: ADD INDEXES (Quick - 15 minutes)
**Impact**: 20-40% additional improvement

```sql
-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_api_tokens_token ON api_tokens(token);
CREATE INDEX IF NOT EXISTS idx_user_tiers_user_id ON user_tiers(user_id);
CREATE INDEX IF NOT EXISTS idx_users_github_user_id ON users(github_user_id);

-- Optimize query planner
PRAGMA optimize;
```

### Phase 3: PARALLEL QUERIES (if needed - 30 minutes)
**Impact**: Fallback for complex scenarios

If we need to keep separate queries for some reason:
```typescript
// Run queries in parallel instead of sequential
const [userId, tierPromise, userPromise] = await Promise.all([
  validateApiToken(env.DB, token),
  userId ? getUserTier(env.DB, userId) : Promise.resolve('seed'),
  userId ? getUser(env.DB, userId) : Promise.resolve(null)
]);
```

### Phase 4: SIMPLE CACHING (Later - 1 hour)
**Impact**: Near-zero latency for repeat requests

```typescript
// Simple in-memory cache with TTL
const tokenCache = new Map<string, {
  result: any;
  timestamp: number;
}>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedTokenValidation(token: string) {
  const cached = tokenCache.get(token);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }
  
  // Cache miss - get from DB and cache result
  const result = await validateApiTokenComplete(env.DB, token);
  tokenCache.set(token, { result, timestamp: Date.now() });
  
  return result;
}
```

## Implementation Steps - PHASE 1 (Most Impact)

### Step 1: Add new function to db.ts (10 minutes)
```typescript
// DEPRECATED: auth.pollinations.ai has been removed
// This was originally in /auth.pollinations.ai/src/db.ts
export async function validateApiTokenComplete(db: D1Database, token: string): Promise<{
  userId: string | null;
  username: string | null;  
  tier: UserTier | null;
}> {
  const result = await db.prepare(`
    SELECT 
      at.user_id,
      u.username,
      COALESCE(ut.tier, 'seed') as tier
    FROM api_tokens at
    INNER JOIN users u ON at.user_id = u.github_user_id
    LEFT JOIN user_tiers ut ON u.github_user_id = ut.user_id
    WHERE at.token = ?
  `).bind(token).first();
  
  if (!result) {
    return { userId: null, username: null, tier: null };
  }
  
  return {
    userId: result.user_id as string,
    username: result.username as string,
    tier: result.tier as UserTier
  };
}
```

### Step 2: Update handleValidateToken in index.ts (10 minutes)
```typescript
// Replace the 3-query approach with single query
async function handleValidateToken(token: string, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    if (!token) {
      return createErrorResponse(400, 'Missing required parameter: token', corsHeaders);
    }
    
    // Single database query instead of 3
    const { userId, username, tier } = await validateApiTokenComplete(env.DB, token);
    
    return new Response(JSON.stringify({
      valid: userId !== null,
      userId: userId,
      username: username,
      tier: tier
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error validating token:', error);
    return createErrorResponse(400, 'Invalid request format', corsHeaders);
  }
}
```

### Step 3: Test performance improvement (5 minutes)
```bash
# Test with same token
time curl -s -H "Authorization: Bearer BpigHXfbVA0xQFQ1" https://enter.pollinations.ai/api/validate-token/BpigHXfbVA0xQFQ1

# Expected: ~3-4 seconds instead of 12+ seconds
```

### Step 4: Deploy (5 minutes)
```bash
cd /Users/thomash/Documents/GitHub/pollinations/enter.pollinations.ai
wrangler deploy
```

## Expected Results

### Phase 1 Only (Single Query):
- **Before**: 3 database queries, ~12 seconds
- **After**: 1 database query, ~3-4 seconds
- **Improvement**: ~60-70% faster

### Phase 1 + 2 (Single Query + Indexes):
- **Expected**: ~2-3 seconds
- **Improvement**: ~75-80% faster

### All Phases:
- **Expected**: ~1-2 seconds (cached requests near-instant)
- **Improvement**: ~85-90% faster

## Risk Assessment
- **Risk**: LOW - Single JOIN query is standard SQL
- **Rollback**: Easy - revert to previous version
- **Testing**: Can test with provided token immediately

## Success Metrics
- Token validation time < 5 seconds (target: 2-3 seconds)
- API response time improvement measurable with provided token
- No functionality changes - same response format

## Next Actions
1. ✅ Move optimization doc to operations/issues/2604/
2. 🚀 **START HERE**: Implement Phase 1 (single query) - highest impact, lowest risk
3. Test with provided token: `BpigHXfbVA0xQFQ1`
4. Measure performance improvement
5. Add indexes if needed (Phase 2)
