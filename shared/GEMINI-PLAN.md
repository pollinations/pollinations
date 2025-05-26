# GEMINI-PLAN.md: Phased Migration to New Authentication and Shared IP Queuing

This document outlines the plan to migrate `image.pollinations.ai` and `text.pollinations.ai` services to a new authentication system leveraging GitHub OAuth (via `auth.pollinations.ai` and its D1 database) and to refactor IP-based queuing into a shared utility.

## Core Principles:
1.  **Centralized Auth Logic:** Consolidate common authentication tasks in `shared/auth-utils.js`.
2.  **Phased Rollout:** Prioritize new DB-backed tokens, with legacy tokens and referrer checks as fallbacks during transition.
3.  **Clear Auth Decisions:** The `shouldBypassQueue` function will be the single source of truth for initial auth decisions.
4.  **Shared IP Queuing:** Extract IP-based rate limiting/queuing to a shared module for consistent application.

## Phase 1: Solidify `shared/auth-utils.js`

**Goal:** Ensure `shared/auth-utils.js` contains all necessary primitives for the new authentication flow.

**Key Functions & Logic for `shouldBypassQueue`:**

1.  **`extractToken(req)`:**
    *   Extracts token from query params, `Authorization: Bearer` header, or custom `x-pollinations-token` header.
    *   *Status: Exists, review for completeness.*

2.  **`extractReferrer(req)`:**
    *   Extracts referrer from `referer`, `referrer`, or `origin` headers.
    *   *Status: Exists, review for completeness.*

3.  **`validateTokenWithDb(token, db, validateApiTokenDb)`:** (Helper for `shouldBypassQueue`)
    *   Purpose: Validates an API token against the D1 database using `validateApiTokenDb` from `auth.pollinations.ai/src/db.ts`.
    *   Input: `token`, D1 `db` instance, `validateApiTokenDb` function.
    *   Output: `userId` if valid, `null` otherwise.
    *   *Action: This helper function should be (re-)implemented in `shared/auth-utils.js`.*

4.  **`isUserDomainAllowedFromDb(userId, referrer, db, isDomainAllowedDb)`:** (Helper for `shouldBypassQueue`)
    *   Purpose: Checks if a specific `userId` is allowed to access services from the `referrer`'s domain, using `isDomainAllowedDb` from `auth.pollinations.ai/src/db.ts`.
    *   Input: `userId`, `referrer`, D1 `db` instance, `isDomainAllowedDb` function.
    *   Output: `boolean`.
    *   *Status: Exists.*

5.  **`isValidLegacyToken(token, legacyTokensList)`:** (Helper for `shouldBypassQueue`)
    *   Purpose: Validates a token against a provided list of legacy tokens (e.g., from `env.VALID_TOKENS_LEGACY`).
    *   Input: `token`, `legacyTokensList` (array or comma-separated string).
    *   Output: `boolean`.
    *   *Status: Exists. `isValidLegacyToken` handles string/array for its second argument. `shouldBypassQueue` will prepare `legacyTokensArray` for its own loop for referrer checking and can pass the original `legacyValidTokens` or the array version to `isValidLegacyToken` if needed, though direct array inclusion check within `shouldBypassQueue` for direct token match is also clear.*

6.  **`isDomainWhitelisted(referrer, generalWhitelist)`:** (Helper for `shouldBypassQueue`)
    *   Purpose: Checks if a `referrer`'s domain is in a general whitelist (e.g., from `env.APPROVED_DOMAINS_LEGACY`). Used for legacy token holders and unauthenticated access.
    *   Input: `referrer`, `generalWhitelist` (array or comma-separated string).
    *   Output: `boolean`.
    *   *Status: Exists.*

7.  **`shouldBypassQueue(req, { db, validateApiTokenDb, isDomainAllowedDb, legacyValidTokens, generalWhitelist })`:**
    *   **The Core Orchestrator.**
    *   **Inputs:**
        *   `req`: The incoming request object.
        *   `db`: D1 database instance.
        *   `validateApiTokenDb`: Function from `auth.pollinations.ai/src/db.ts` to validate a token and get a `userId`.
        *   `isDomainAllowedDb`: Function from `auth.pollinations.ai/src/db.ts` to check if a `userId` has rights for a given domain.
        *   `legacyValidTokens`: List/string of legacy tokens.
        *   `generalWhitelist`: List/string of generally whitelisted domains for legacy/unauthenticated access.
    *   **Logic Flow:**
        1.  Extract `token = extractToken(req)` and `referrer = extractReferrer(req)`.
        2.  Prepare `legacyTokensArray` from `legacyValidTokens`:
            *   Initialize `legacyTokensArray = []`.
            *   If `typeof legacyValidTokens === 'string'`, `legacyTokensArray = legacyValidTokens.split(',').map(t => t.trim()).filter(Boolean);`
            *   Else if `Array.isArray(legacyValidTokens)`, `legacyTokensArray = legacyValidTokens.filter(Boolean);`
        3.  **Attempt DB Token Auth:**
            *   If `token` exists: `userId = await validateTokenWithDb(token, db, validateApiTokenDb)`.
            *   If `userId` is returned (valid DB token):
                *   `userDomainAllowed = await isUserDomainAllowedFromDb(userId, referrer, db, isDomainAllowedDb)`.
                *   If `userDomainAllowed`: Return `{ shouldBypass: true, reason: "DB_TOKEN_USER_DOMAIN_ALLOWED", userId }`.
                *   Else: Return `{ shouldBypass: false, reason: "DB_TOKEN_USER_DOMAIN_DENIED", userId }` (User is valid, but not for this domain).
        4.  **Attempt Legacy Token Auth (if DB token auth failed or no DB token):**
            *   Let `isLegacyAuthSuccessful = false;`
            *   Let `legacyAuthReasonPrefix = "";`
            *   // Check 1: Direct legacy token match
            *   If `token` && `legacyTokensArray.length > 0` && `legacyTokensArray.includes(token)`:
                *   `isLegacyAuthSuccessful = true;`
                *   `legacyAuthReasonPrefix = "LEGACY_TOKEN";`
            *   // Check 2: Legacy token found in referrer (only if direct match failed)
            *   Else if `referrer` && `legacyTokensArray.length > 0` && `legacyTokensArray.some(lt => referrer.includes(lt))`: // Ensure 'lt' is not an empty string if legacyTokensArray can contain them
                *   `isLegacyAuthSuccessful = true;`
                *   `legacyAuthReasonPrefix = "LEGACY_TOKEN_IN_REFERRER";`
            
            *   If `isLegacyAuthSuccessful`:
                *   `legacyDomainAllowed = isDomainWhitelisted(referrer, generalWhitelist)`.
                *   If `legacyDomainAllowed`: 
                    *   Return `{ shouldBypass: true, reason: legacyAuthReasonPrefix + "_DOMAIN_ALLOWED", userId: null }`.
                *   Else: 
                    *   Return `{ shouldBypass: false, reason: legacyAuthReasonPrefix + "_DOMAIN_DENIED", userId: null }`.
        5.  **Attempt Unauthenticated Referrer Auth (if all token auths failed or no token):**
            *   `unauthenticatedDomainAllowed = isDomainWhitelisted(referrer, generalWhitelist)`.
            *   If `unauthenticatedDomainAllowed`: Return `{ shouldBypass: true, reason: "UNAUTHENTICATED_DOMAIN_ALLOWED", userId: null }`.
        6.  **Default Deny:**
            *   Return `{ shouldBypass: false, reason: "NO_VALID_AUTH_METHOD", userId: null }`.
    *   *Status: Partially exists, needs to be updated to incorporate the full logic flow above, especially the prioritized DB checks and the legacy token in referrer check.*

## Phase 2: Integrate `shouldBypassQueue` into `image.pollinations.ai`

1.  **Main Request Handler (e.g., Cloudflare Worker `fetch` handler):**
    *   Import `shouldBypassQueue` from `shared/auth-utils.js`.
    *   Import `validateApiToken` (as `validateApiTokenDb`) and `isDomainAllowed` (as `isDomainAllowedDb`) from `auth.pollinations.ai/src/db.ts`. (Ensure these are accessible in the worker environment, potentially requiring them to be bundled or provided via bindings if `auth.pollinations.ai` is a separate service/worker).
    *   Access D1 binding (`env.YOUR_D1_DB`), legacy tokens (`env.VALID_TOKENS_LEGACY`), and general domain whitelist (`env.APPROVED_DOMAINS_LEGACY`).
    *   Call `authResult = await shouldBypassQueue(req, { db: env.YOUR_D1_DB, validateApiTokenDb, isDomainAllowedDb, legacyValidTokens: env.VALID_TOKENS_LEGACY, generalWhitelist: env.APPROVED_DOMAINS_LEGACY })`.
    *   Pass `authResult` to downstream logic (e.g., `createAndReturnImages.js` functions).

2.  **`image.pollinations.ai/src/createAndReturnImages.js`:**
    *   Modify functions (e.g., `createAndReturnImageCached`, `callComfyUI`, `generateImage`) to accept `authResult` (or its destructured parts: `userId`, `shouldBypass`, `reason`) and the `req` object.
    *   **GPT Model Access:**
        *   The decision to grant access to specific models (like GPT-image) will now primarily depend on `authResult`.
        *   If `authResult.userId` is present AND `authResult.reason === "DB_TOKEN_USER_DOMAIN_ALLOWED"`, grant access.
        *   If `authResult.userId` is present AND `authResult.reason === "DB_TOKEN_USER_DOMAIN_DENIED"`, deny access.
        *   If `!authResult.userId` AND `authResult.shouldBypass` is `true` (due to legacy token or whitelisted referrer, e.g., `authResult.reason === "LEGACY_TOKEN_DOMAIN_ALLOWED"` or `"UNAUTHENTICATED_DOMAIN_ALLOWED"`), grant access (maintains current behavior for these paths).
        *   Otherwise, deny access.
        *   The existing `isApprovedReferrer` function (specific to `createAndReturnImages.js`) will be superseded by the `generalWhitelist` check within `shouldBypassQueue`.
    *   **General Queue Bypass:** The `authResult.shouldBypass` boolean will determine if the request bypasses any subsequent IP-based queuing (see Phase 4).
    *   Remove direct calls to `extractToken` or `isValidToken` from `./config/tokens.js` as this is handled by `shouldBypassQueue`.

3.  **`image.pollinations.ai/src/config/tokens.js`:**
    *   `extractToken` can be removed (functionality moved to `shared/auth-utils.js`).
    *   `getValidTokens` and `isValidToken` (for legacy `VALID_TOKENS_LEGACY`) will be used internally by `shouldBypassQueue` when it calls `isValidLegacyToken`.

4.  **`image.pollinations.ai/src/utils/BadDomainHandler.js`:**
    *   If `extractReferrer` is used here *only* for its bad domain transformation logic, it can remain or use `sharedExtractReferrer`. The primary referrer extraction for auth is done by `shouldBypassQueue`.

## Phase 3: Integrate `shouldBypassQueue` into `text.pollinations.ai`

*   Follow the same integration steps as for `image.pollinations.ai` (Phase 2).
*   Identify its main request handler and adapt its specific service logic based on the `authResult`.

## Phase 4: Refactor IP-Based Queuing to Shared Module

**Goal:** Create a shared IP queuing/rate-limiting module that both services can use, respecting the `authResult.shouldBypass` decision.

1.  **Identify Current IP Queuing Logic:**
    *   **`image.pollinations.ai`**: Implements IP-specific queuing in `src/index.js` using `PQueue` (1 req / IP / ~10s) stored in an in-memory object (`ipQueue`). Also has in-memory IP-based content violation tracking. These are not suitable for distributed workers.
    *   **`text.pollinations.ai`**: Implements similar IP-specific queuing in `server.js` (likely a Node.js backend) using `PQueue` (1 req / IP / ~6s) stored in an in-memory `Map` (`queues`). It has its own bypass logic (`isImagePollinationsReferrer`, `isRobloxReferrer`, `shouldBypassDelay`). This in-memory state is per-instance if `server.js` is scaled.
    *   Common patterns: checking `req.headers['cf-connecting-ip']`, storing IP counts/queues in memory.

2.  **Design `shared/ip-queue-manager.js`:**
    *   **Storage:** Use Cloudflare KV store for distributed IP tracking (request counts/timestamps).
    *   **Core Function: `checkIpRateLimit(ip, { limit, windowSeconds, kvStore })`**
        *   Checks if `ip` has made more than `limit` requests in the last `windowSeconds`.
        *   Updates count/timestamp in `kvStore`.
        *   Returns `{ allow: boolean, remaining: number }`.
    *   **Main Function: `shouldApplyIpQueuing(req, authResult, { ipQueueConfig, kvStore })`**
        *   If `authResult.shouldBypass` is `true`, return `false` (no IP queuing needed).
        *   Extract `ip = req.headers['cf-connecting-ip']` (or use a shared `getIp(req)` utility if one is made).
        *   Use `ipQueueConfig` (e.g., `{ defaultLimit: 10, defaultWindow: 60 }`) to get parameters for `checkIpRateLimit`. Config could allow different limits for different `authResult.reason` types if needed.
        *   Call `checkIpRateLimit(ip, { limit, windowSeconds, kvStore })`.
        *   Return `true` if `allow` is `false` (meaning IP limit hit, should be queued/denied), else `false`.

3.  **Integration into Service Request Handlers:**
    *   In `image.pollinations.ai` and `text.pollinations.ai` main request handlers (ideally in a Cloudflare Worker context for both):
        1.  After `authResult = await shouldBypassQueue(...)`.
        2.  `applyIpQueue = await sharedIpQueueManager.shouldApplyIpQueuing(req, authResult, { ipQueueConfig: serviceSpecificConfig, kvStore: env.YOUR_KV_NAMESPACE })`.
        3.  If `applyIpQueue` is `true`, then either place the request in a queue (if applicable for very long tasks, though primary mechanism here is rate limiting) or return a 429 Too Many Requests error.
        4.  Else, proceed with request processing.
    *   **Reconcile `text.pollinations.ai` bypass:** The existing bypass logic in `text.pollinations.ai/server.js` (e.g., `isRobloxReferrer`) needs to be integrated. This means `shouldBypassQueue` in `shared/auth-utils.js` should become the single source of truth. Conditions like `isRobloxReferrer` should be handled by ensuring the `generalWhitelist` passed to `shouldBypassQueue` includes Roblox domains, or by adding specific checks within `shouldBypassQueue` if necessary (though `generalWhitelist` is preferred).

4.  **Content Violation IP Blocking (Separate Consideration):**
    *   The IP-based content violation blocking in `image.pollinations.ai` also uses in-memory state. This should be refactored to use KV store if consistency across workers is desired. This can be a sub-task or future enhancement separate from the request rate-limiting queue.

## Phase 5: Testing and Monitoring

*   **Unit Tests:** For all functions in `shared/auth-utils.js` and `shared/ip-queue-manager.js`.
*   **Integration Tests:** Test the end-to-end flow in each service:
    *   DB token (allowed/denied domain)
    *   Legacy token (allowed/denied domain)
    *   Unauthenticated (whitelisted/non-whitelisted referrer)
    *   IP queuing for non-bypassed requests.
*   **Monitoring:** Add detailed logging for `authResult.reason` and IP queuing decisions to track behavior and identify issues.

## Phase 6: Deprecation of Old Systems

*   After a transition period and confirmation of stability:
    *   Remove `VALID_TOKENS_LEGACY` environment variable and related logic.
    *   Phase out direct reliance on old referrer whitelists if they are fully covered by the `generalWhitelist` in `shouldBypassQueue`.
    *   Remove any old, service-specific IP queuing logic now handled by the shared module.
