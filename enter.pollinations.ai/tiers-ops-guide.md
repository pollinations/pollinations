# Tiers Ops Guide (Cloudflare D1 only)

- Scope: staging and production databases on Cloudflare. No local.
- Tier values: `seed` | `flower` | `nectar`

## Environments (simplified)

- All commands are remote (Cloudflare D1).
- Run inside the service folder so `DB` binding resolves from wrangler.toml.

| Service | Env | DB name | DB id |
| --- | --- | --- | --- |
| Enter | staging | staging-pollinations-enter-db | 073195b4-d99e-4b67-9575-eb5efe6d3234 |
| Auth | production | github_auth | 4145d600-1df6-44a2-9769-5d5f731deb77 |

Tip: target a specific DB id if needed:
`npx wrangler d1 execute <DB_ID> --remote --command "…"`

## Quick Checks (Enter staging / Auth production)

| What | Command (run inside the service folder) |
| --- | --- |
| List tables | `npx wrangler d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type='table';"` |
| Show columns in user | `npx wrangler d1 execute DB --remote --command "PRAGMA table_info('user');"` |
| Count users by tier | `npx wrangler d1 execute DB --remote --command "SELECT tier, COUNT(*) as n FROM user GROUP BY tier ORDER BY tier;"` |
| List users + tier | `npx wrangler d1 execute DB --remote --command "SELECT github_username, tier FROM user ORDER BY github_username;"` |

## Get / Set User Tier

| Action | Command (replace USERNAME and TIER) |
| --- | --- |
| (Enter, staging) Get a user | `npx wrangler d1 execute DB --remote --env staging --command "SELECT id, name, github_username, tier FROM user WHERE github_username='USERNAME';"` |
| (Enter, staging) Set tier | `npx wrangler d1 execute DB --remote --env staging --command "UPDATE user SET tier='TIER' WHERE github_username='USERNAME';"` |
| (Enter, staging) Verify | `npx wrangler d1 execute DB --remote --env staging --command "SELECT github_username, tier FROM user WHERE github_username='USERNAME';"` |
| (Auth, production) Get user tier by GitHub id | `npx wrangler d1 execute DB --remote --command "SELECT user_id, tier FROM user_tiers WHERE user_id='GITHUB_ID';"` |
| (Auth, production) Get user tier by GitHub username | `npx wrangler d1 execute DB --remote --command "SELECT u.github_username, ut.tier FROM users u JOIN user_tiers ut ON ut.user_id = u.id WHERE LOWER(u.github_username)='username';"` |
| (Auth, production) Set user tier | `npx wrangler d1 execute DB --remote --command "UPDATE user_tiers SET tier='TIER', updated_at=CURRENT_TIMESTAMP WHERE user_id='GITHUB_ID';"` |

Notes:
- Valid `TIER` values: `'seed'`, `'flower'`, `'nectar'`. Use lowercase.
- Enter stores tier in table `user` (column `tier`) keyed by `github_username`.
- Auth stores tier in table `user_tiers` (columns `user_id`, `tier`), with usernames in `users` (join on `users.id = user_tiers.user_id`).

## Audits and Reports

| Report | SQL |
| --- | --- |
| Users with no tier | `SELECT github_username FROM user WHERE tier IS NULL OR tier='' OR tier='none';` |
| Users per tier (sorted) | `SELECT tier, COUNT(*) as n FROM user GROUP BY tier ORDER BY n DESC;` |
| Recently updated (if column exists) | `SELECT github_username, tier, updated_at FROM user ORDER BY updated_at DESC LIMIT 50;` |

Run via:

```
npx wrangler d1 execute DB --remote --command "<SQL>"
```

## Polar Product IDs Mapping (Enter staging)

- File: `enter.pollinations.ai/wrangler.toml`
- Ensure product ID mapping matches Polar products (sandbox/production per env).

| Var | Example |
| --- | --- |
| `POLAR_PRODUCT_ID_SEED` | `19c3291a-e1fa-4a03-a08a-3de9ab84af5d` |
| `POLAR_PRODUCT_ID_FLOWER` | `c675a78a-d954-4739-bfad-c0c8aa3e5576` |
| `POLAR_PRODUCT_ID_NECTAR` | `dfe978ca-8e07-41fa-992a-ae19ab96e66c` |

Notes:
- If Polar returns a productId that doesn’t match these, Enter will show "no active tier".

## Verify Polar vs Enter (staging)

| Purpose | How |
| --- | --- |
| Get Polar state (requires session) | Open `/api/polar/customer/state` on staging |
| Get Enter tier view (requires session) | Open `/api/tiers/view` on staging |

Look for:
- `productIds` from Polar must match `POLAR_PRODUCT_ID_*` in `wrangler.toml` of that env.
- `/api/tiers/view` shows:
  - `assigned_tier` (from D1 DB)
  - `active_tier` (from Polar)
  - `next_refill_at_utc`
  - `should_show_activate_button` (true only if no active Polar sub and tier assigned)

## Activation Flow (Enter staging)

| Step | Details |
| --- | --- |
| 1. Admin assigns tier in DB | `UPDATE user SET tier='flower' WHERE github_username='USERNAME';` |
| 2. User clicks Activate | UI calls `/api/tiers/activate` and opens Polar checkout |
| 3. After success | Polar subscription appears; Enter shows active tier and countdown |
| 4. Tier change behavior | If DB tier differs from Polar tier, Enter shows “will be upgraded/downgraded on next renewal” notice |

## Safety

- Always run a `SELECT` first to confirm target rows.
- For bulk updates: wrap in transaction if needed: `BEGIN; …; COMMIT;`.

## Fill-ins

- If you want scripts, we can add wrapper npm scripts for common queries.
