# O3 Implementation Plan – Referrer / Token Consolidation & IP-Queue Abstraction

## 0. Why “O3”?
* **O1** = original code, **O2** = REFERRER_TOKEN_REPORT.md (analysis), **O3** = this actionable plan.

---

## 1. Goals
1. **Standardise referrer & token logic** across *text* and *image* back-ends.
2. **Phase-out referrer-based auth** while staying compatible with *legacy* behaviour where a token can also appear as a substring of the referrer.
3. **Centralise IP-queue management** so that identical throttling rules are applied by both services.
4. Ensure the resulting code follows the **“thin proxy”** principle (minimum logic, zero transformation of model responses).

---

## 2. Deliverables & File Map
| Deliverable | Location | Notes |
|-------------|----------|-------|
| **referrer-token utils** | `shared/referrerTokenUtils.js` | new – single source of truth for referrer, token extraction & validation |
| **ip-queue utils** | `shared/ipQueue.js` | new – wraps `p-queue` and exposes helper middleware |
| **env template** | `.env.example` (root) | add `LEGACY_TOKENS`, `BACKEND_TOKENS`, `QUEUE_INTERVAL_MS`, `QUEUE_CAP` |
| **unit tests** | `shared/__tests__/referrerTokenUtils.test.js`, `shared/__tests__/ipQueue.test.js` | uses Jest |
| **service patches** | `text.pollinations.ai/server.js`, `image.pollinations.ai/src/index.js` | replace bespoke logic with helpers |
| **docs** | update `README.md` in each service + this plan |

---

## 3. Technical Design
### 3.1 `shared/referrerTokenUtils.js`
```ts
export function getReferrer(req) { /* referer → analytics only */ }

export function extractToken(req) {
  // 1️⃣ Check `Authorization: Bearer <t>`
  // 2️⃣ Check `x-pollinations-token` header
  // 3️⃣ Check `token` query param
  // 4️⃣ LEGACY: if none found search `getReferrer(req)` for any token in ALLOWED_TOKENS
}

export function isValidToken(token) { /* string compare against BACKEND_TOKENS env */ }

export function shouldBypassQueue(req) {
  const t = extractToken(req);
  return t && isValidToken(t);
}
```
*Tokens list is pulled from `process.env.BACKEND_TOKENS` (comma-separated).*  
*Legacy tokens come from `LEGACY_TOKENS`; this array is merged into `BACKEND_TOKENS` for validation.*

### 3.2 `shared/ipQueue.js`
```js
import PQueue from 'p-queue';
import { shouldBypassQueue } from './referrerTokenUtils.js';

const queues = new Map();
export function getQueue(ip) {
  if (!queues.has(ip)) {
    queues.set(ip, new PQueue({
      concurrency: 1,
      interval: Number(process.env.QUEUE_INTERVAL_MS ?? 6000),
      intervalCap: Number(process.env.QUEUE_CAP ?? 1)
    }));
  }
  return queues.get(ip);
}

export async function enqueue(req, taskFn) {
  if (shouldBypassQueue(req)) return taskFn();
  const ip = req.headers['cf-connecting-ip'] || req.ip;
  return getQueue(ip).add(taskFn);
}
```
*Both back-ends now call `enqueue(req, () => …)` instead of manipulating their own `PQueue` structures.*

### 3.3 Service Refactors
1. **text.pollinations.ai/server.js**
   * Remove local `queues` map + `getQueue` + per-IP PQueue creation.
   * Replace `const queue = getQueue(ip)` logic with:
     ```js
     import { enqueue } from '../shared/ipQueue.js';
     …
     await enqueue(req, () => handlerFunction());
     ```
2. **image.pollinations.ai/src/index.js**
   * Remove `ipQueue` object and associated clean-up.
   * Use the same `enqueue` helper.

### 3.4 Backwards-compat Token in Referrer
*Implementation detail:* in `extractToken` step (4) we run
```js
for (const tok of ALL_ALLOWED_TOKENS) {
  if (referrer?.includes(tok)) return tok;
}
```
so a legacy client that appends `?token=foo` to the referrer will still pass.

---

## 4. Roll-out Strategy
1. **Phase 1 – library creation & unit tests**  
   a. Add utils & tests.  
   b. CI green.
2. **Phase 2 – feature-flagged adoption**  
   a. Inject new helpers behind `process.env.USE_NEW_AUTH=true`.  
   b. Log side-by-side results to ensure parity.
3. **Phase 3 – hard switch & code removal**  
   a. Delete old duplicated logic.  
   b. Remove feature flag.

---

## 5. Edge-Cases & Security
* IP spoofing mitigated by trusting `cf-connecting-ip` > `x-forwarded-for` etc.
* Queue bypass allowed **only** when `isValidToken` passes.
* Referrers are **never** used for auth except the *temporary* legacy case above.

---

## 6. Estimated Effort
| Task | Owner | Δ LOC | ETA |
|------|-------|-------|-----|
| Create shared utils & tests | @dev | +350 | 0.5 d |
| Refactor text service | @dev | −150/+40 | 0.5 d |
| Refactor image service | @dev | −120/+30 | 0.5 d |
| Docs & env templates | @dev | +60 | 0.25 d |
| QA / staging | @qa | — | 0.25 d |

---

## 7. Open Questions
1. Do we want **different** queue intervals for image vs text? If so, expose per-service override.
2. Should we persist blocked IPs centrally (e.g., Redis) instead of per process?
3. Any clients still relying on *referrer substring token* beyond the provided legacy list?

---

## 8. Appendix – Current IP-Queue Hot-spots
* **text.pollinations.ai/server.js**: `queues` (Map) + `getQueue` + direct `queue.add()` in `processRequest`.
* **image.pollinations.ai/src/index.js**: `ipQueue` object + PQueue logic around `checkCacheAndGenerate`.

These will be the replacement points for the shared queue module.

---

## 9. Legacy Source Audit (Deep Code Map)
* **text.pollinations.ai**
  * `requestUtils.js` – referrer + whitelisted domain logic, token extraction gaps
  * `server.js` – inline `getQueue`, blocked-IP persistence, Roblox model routing
  * `ads/*` – bad-domain → ads probability toggle
* **image.pollinations.ai**
  * `src/config/tokens.js` – bespoke extraction incl. referrer fallback ⚠️
  * `src/utils/BadDomainHandler.js` – prompt transform based on referrer
  * `src/index.js` – `ipQueue` + queue bypass via tokens
* **shared**
  * `auth-utils.js` – WIP consolidated extraction (no referrer fallback)
  * `REFERRER_TOKEN_REPORT.md` – analysis baseline

During Phase-1 we’ll GREP for `referer|referrer|token\(` across repo and add any missed hotspots to this list.

---

## 10. Configuration & Env Var Unification
| New Var | Replaces | Scope |
|---------|----------|-------|
| `POLL_TOKENS_LEGACY` | `VALID_TOKENS`, scattered hard-codes | both services |
| `POLL_TOKENS_BACKEND` | — | list of strong tokens (32+ chars) |
| `POLL_DOMAIN_ALLOWLIST` | `WHITELISTED_DOMAINS`, `APPROVED_REFERRERS` | analytics + feature gating |
| `POLL_QUEUE_INTERVAL_MS_TEXT` / `POLL_QUEUE_INTERVAL_MS_IMAGE` | inline numbers | per service |

A migration script will scan `.env` files and update names, printing reminders for removed vars.

---

## 11. Observability & Metrics
1. **Auth Metrics**: log structured events `{ type: 'token-validation', source, success, reason, ip, tokenHash }` → Datadog.
2. **Queue Metrics**: expose `/metrics` endpoint with Prom-ready gauges: `queue_length{service="text"}` etc.
3. **Bypass Ratio Dashboards**: % requests bypassing queue (token vs allowlist) per day.
4. **Security Alerts**: >5 failed token attempts from same IP within 10 min triggers Slack.

---

## 12. Deprecation Timeline for Referrer-Token Fallback
| Stage | Duration | Behaviour |
|-------|----------|-----------|
| **L-0** | now | token in referrer accepted (status quo) |
| **L-1** | 2 weeks | emit `X-Deprecation` header + warning log when fallback used |
| **L-2** | 2 weeks | fallback works but adds 1 s artificial delay to encourage migration |
| **L-3** | cutover | remove referrer token parsing, feature flag kill-switch remains for rollback |

Cron job will check logs to ensure fallback usage <0.5% before moving stage.

---

## 13. Risk & Rollback
* **Risk**: unforeseen clients depending on referrer-token.
  * *Mitigation*: long deprecation window, real-time analytics, emergency env flag `ENABLE_REFERRER_TOKEN_FALLBACK`.
* **Risk**: queue starves if new helper mis-computes IP.
  * *Mitigation*: synthetic load tests, compare queue metrics before/after under flag.
* **Rollback**: single env var disables new utils and re-enables legacy paths (`USE_NEW_AUTH=false`).

---

## 14. CI / Automation Tasks
1. **lint-referrer-token rule**: ESLint custom rule forbids direct access to `req.headers.referer` outside utils.
2. **unit tests** for each token extraction scenario incl. referrer fallback path.
3. **integration tests** using Supertest (text) and node-http (image) verifying queue bypass latency <1 s with token.
4. GitHub Actions matrix runs both *flag on/off*.

---

*End of extended O3 plan.*
