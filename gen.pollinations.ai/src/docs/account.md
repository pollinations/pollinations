## Account

Self-service endpoints for the authenticated user. All endpoints require authentication (API key or session). API keys need the relevant `account:<scope>` permission. Base path: `/account`.

`account:usage` is the read-only account-state scope for balances, usage, quests, and earnings. Secret keys with `account:keys` are account-admin keys: they can manage keys and my-models, and they also satisfy read-only account-state checks. Publishable `pk_` keys do not receive this admin implication.

| Endpoint | Description |
|----------|-------------|
| `GET /account/profile` | GitHub username, image, tier, reset time |
| `GET /account/balance` | Current pollen balance |
| `GET /account/quests` | Read-only quest status |
| `GET /account/usage` | Per-request usage history with costs |
| `GET /account/usage/daily` | Daily aggregated usage for dashboards |
| `/account/my-models` | Manage your registered community models |
| `GET /account/key` | API key validity, type, and permissions |

### GET /account/profile

Returns user profile. `githubUsername`, `image`, `tier`, and `nextResetAt` are always included. `name` and `email` are included only when the API key has `account:profile`, or is a secret key with `account:keys`.

### GET /account/balance

Returns remaining pollen. If the API key has a budget, returns key budget instead. Full account balance requires `account:usage` or a secret key with `account:keys`.

### GET /account/quests

Returns the quest catalog with account status. `completed` includes both globally completed quests and quests earned by the account. Requires `account:usage` or a secret key with `account:keys`. Claiming rewards is dashboard-only.

### GET /account/usage

Per-request usage history: model, token counts, cost, response time. Requires `account:usage` or a secret key with `account:keys`.

### GET /account/usage/daily

Daily aggregated usage suitable for dashboards. Requires `account:usage` or a secret key with `account:keys`.

### GET /account/key

Returns the current API key's validity, type, and permissions.

### /account/my-models

Manage your registered community text models: list, create, update, delete, inspect upstream models, and test an upstream model. API keys must be secret keys with `account:keys`; dashboard sessions can manage models directly.
