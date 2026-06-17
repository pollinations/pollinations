## Account

Self-service endpoints for the authenticated user. All endpoints require authentication (API key or session). API keys need the relevant `account:<scope>` permission. Base path: `/account`.

| Endpoint | Description |
|----------|-------------|
| `GET /account/profile` | GitHub username, image, tier, reset time |
| `GET /account/balance` | Current pollen balance |
| `GET /account/usage` | Per-request usage history with costs |
| `GET /account/usage/daily` | Daily aggregated usage for dashboards |
| `GET /account/key` | API key validity, type, and permissions |

### GET /account/profile

Returns user profile. `githubUsername`, `image`, `tier`, and `nextResetAt` are always included. `name` and `email` are included only when the API key has the `account:profile` permission.

### GET /account/balance

Returns remaining pollen. If the API key has a budget, returns key budget instead.

### GET /account/usage

Per-request usage history: model, token counts, cost, response time.

### GET /account/usage/daily

Daily aggregated usage suitable for dashboards.

### GET /account/key

Returns the current API key's validity, type, and permissions.
