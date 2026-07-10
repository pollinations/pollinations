## Account

Self-service endpoints for the authenticated user. All endpoints require authentication (API key or session). API keys need the relevant `account:<scope>` permission. Base path: `/account`.

`account:usage` is the read-only account-state scope for balances, usage, quests, and earnings. `account:keys` manages keys and, where enabled, my-models. These permissions are independent; request both when a client needs both. Newly created child keys cannot receive `account:keys` through this API.

| Endpoint | Description |
|----------|-------------|
| `GET /account/profile` | GitHub username, image, and community model access |
| `GET /account/balance` | Current pollen balance |
| `GET /account/quests` | Read-only quest status |
| `GET /account/usage` | Per-request usage history with costs |
| `GET /account/usage/daily` | Daily aggregated usage for dashboards |
| `/account/my-models` | Invite-only community model management |
| `GET /account/key` | API key validity, type, and permissions |

### GET /account/profile

Returns user profile. `githubUsername`, `image`, and `communityEndpointsAllowed` are always included. `name` and `email` are included only when the API key has `account:profile`.

### GET /account/balance

Returns remaining pollen. If the API key has a budget, returns key budget instead. Full account balance requires `account:usage`.

### GET /account/quests

Returns the quest catalog with account status. `completed` includes both globally completed quests and quests earned by the account. Requires `account:usage`. Claiming rewards is dashboard-only.

### GET /account/usage

Per-request usage history: model, token counts, cost, response time. Requires `account:usage`.

### GET /account/usage/daily

Daily aggregated usage suitable for dashboards. Requires `account:usage`.

### GET /account/key

Returns the current API key's validity, type, and permissions.

### /account/my-models

Invite-only community text model management: list, create, update, delete, inspect upstream models, and test an upstream model. API keys require `account:keys` and an account with `communityEndpointsAllowed: true`; dashboard sessions can manage models directly when enabled.
