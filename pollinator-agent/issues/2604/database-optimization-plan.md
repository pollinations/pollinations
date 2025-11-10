# DEPRECATED: Optimize auth.pollinations.ai Database Performance for Token Lookups

**Note**: auth.pollinations.ai has been removed. All authentication is now handled by enter.pollinations.ai.
This document is kept for historical reference only.

## Problem Statement

Users are experiencing significant performance degradation when using API tokens. Requests with tokens take ~30 seconds compared to ~7 seconds without tokens. This is due to the growing database size and inefficient query patterns during token validation.

## Root Cause Analysis

### Current Token Validation Flow

When a token is validated (`handleValidateToken`), the system executes multiple sequential queries:

```typescript
// 1. First query: Get user_id from token
const userId = await validateApiToken(env.DB, token);
// SELECT user_id FROM api_tokens WHERE token = ?

// 2. Second query: Get user tier
const tier = await getUserTier(env.DB, userId);
// SELECT tier FROM user_tiers WHERE user_id = ?

// 3. Third query: Get username
const user = await getUser(env.DB, userId);
// SELECT * FROM users WHERE github_user_id = ?
```

### Performance Issues

1. **No explicit index on token column** - While `token` is a PRIMARY KEY, D1 may not be optimizing lookups as efficiently as with an explicit index
2. **Multiple round trips** - 3 separate queries for each token validation
3. **Growing database size** - As the user base grows, lookups become slower
4. **Missing composite indexes** - No indexes that could optimize JOIN operations

## Proposed Solutions

### Phase 1: Add Missing Indexes (Immediate Fix)

Create indexes to optimize the most frequent queries:

```sql
-- Optimize token lookups (even though it's a PRIMARY KEY, explicit index may help D1)
CREATE INDEX IF NOT EXISTS idx_api_tokens_token ON api_tokens(token);

-- Optimize user tier lookups
CREATE INDEX IF NOT EXISTS idx_user_tiers_user_id ON user_tiers(user_id);

-- Run PRAGMA optimize after creating indexes
PRAGMA optimize;
```

### Phase 2: Query Consolidation (Quick Win)

Replace multiple queries with a single JOIN query for token validation:

```typescript
// New consolidated query for validateApiTokenWithDetails
export async function validateApiTokenWithDetails(db: D1Database, token: string): Promise<{
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

### Phase 3: Database Maintenance (Ongoing)

1. **Regular VACUUM operations** to optimize database storage:
   ```sql
   VACUUM;
   ```

2. **Analyze tables** to update query planner statistics:
   ```sql
   ANALYZE api_tokens;
   ANALYZE users;
   ANALYZE user_tiers;
   ```

3. **Monitor slow queries** using D1's analytics

### Phase 4: Caching Strategy (Medium-term)

Implement a short-lived cache for token validation results:

```typescript
// Cache validated tokens for 5 minutes to reduce database hits
const tokenCache = new Map<string, {
  userId: string;
  username: string;
  tier: UserTier;
  timestamp: number;
}>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedToken(token: string) {
  const cached = tokenCache.get(token);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached;
  }
  tokenCache.delete(token);
  return null;
}
```

## Implementation Plan

### Immediate Actions (< 30 minutes)

1. **Create migration file** `migrations/optimize_token_lookups.sql`:
   ```sql
   -- Add indexes for token lookup optimization
   CREATE INDEX IF NOT EXISTS idx_api_tokens_token ON api_tokens(token);
   CREATE INDEX IF NOT EXISTS idx_user_tiers_user_id ON user_tiers(user_id);
   
   -- Run optimization
   PRAGMA optimize;
   ```

2. **Run migration** on production database:
   ```bash
   node deploy-with-migrations.js
   ```

### Short-term Actions (1-2 hours)

1. **Update db.ts** to add consolidated query function
2. **Update handleValidateToken** in index.ts to use the new function
3. **Test performance improvements**
4. **Deploy updated code**

### Monitoring

After implementation, monitor:
- Average token validation time
- Database query performance metrics
- API response times for authenticated requests

## Expected Impact

- **Immediate improvement**: 50-70% reduction in token validation time from indexes
- **With query consolidation**: 80-90% reduction by eliminating multiple round trips
- **With caching**: Near-zero latency for frequently used tokens

## Testing Strategy

1. **Benchmark current performance**:
   ```bash
   time curl -H "Authorization: Bearer YOUR_TOKEN" https://enter.pollinations.ai/api/validate-token/YOUR_TOKEN
   ```

2. **Apply indexes and re-test**

3. **Load test with multiple concurrent requests**

## Rollback Plan

If issues arise:
1. Indexes can be safely dropped without data loss
2. Code changes can be reverted to previous version
3. Cache can be disabled via feature flag

## References

- [Cloudflare D1 Index Best Practices](https://developers.cloudflare.com/d1/best-practices/use-indexes/)
- [SQLite Query Optimization](https://www.sqlite.org/queryplanner.html)
