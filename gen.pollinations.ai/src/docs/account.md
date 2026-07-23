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
| `/account/my-models` | Private community model registration and allowlisted public publishing |
| `GET /account/key` | API key validity, type, and permissions |

### GET /account/profile

Returns user profile. `githubUsername`, `image`, and `communityEndpointsAllowed` are always included. `name` and `email` are included only when the API key has `account:profile`.

### GET /account/balance

Returns `total`, Quest Pollen (`allowance`), paid Pollen (`pack`), and `currency`. If the API key has a budget, that budget is returned as `total` and `pack`, with zero `allowance`. Full account balance requires `account:usage`.

### GET /account/quests

Returns the quest catalog with account status. `completed` includes both globally completed quests and quests earned by the account. Requires `account:usage`. Claiming rewards is dashboard-only.

### GET /account/usage

Per-request usage history: model, token counts, cost, response time. Requires `account:usage`.

### GET /account/usage/daily

Daily aggregated usage suitable for dashboards. Requires `account:usage`.

### GET /account/key

Returns the current API key's validity, type, and permissions.

### /account/my-models

Community text and image model management. Any authenticated account can list, create, update, delete, and call its private owner-only models. Text providers must expose OpenAI-compatible `/v1/chat/completions`; image providers must expose `/v1/images/generations`. Image models are text-to-image only, and calls through `/v1/images/generations` must use `response_format: "b64_json"`; reference images and edits are not supported yet. The endpoint test selects image pricing: valid OpenAI image token usage enables per-1M-token pricing, otherwise a fixed Pollen price is charged once per successful generated image.

Public publishing and the upstream inspection/test tools require `communityEndpointsAllowed: true`; [request account-level publisher access](https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml) with the allowlist form. The form does not register individual models. API keys require `account:keys`. The dashboard and Account API support text and image registration; `polli my-models` currently supports text models only.
