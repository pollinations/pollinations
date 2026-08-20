## Account

Self-service endpoints for the authenticated user. All endpoints require authentication (API key or session). API keys need the relevant `account:<scope>` permission. Base path: `/account`.

`account:usage` is the read-only account-state scope for balances, usage, quests, and earnings. `account:keys` manages keys and, where enabled, my-models. These permissions are independent; request both when a client needs both. Newly created child keys cannot receive `account:keys` through this API.

| Endpoint | Description |
|----------|-------------|
| `GET /account/profile` | GitHub username, image, and community model access |
| `GET /account/balance` | Current pollen balance |
| `GET /account/quests` | Read-only quest status |
| `GET /account/usage` | Per-request usage history with costs (account-wide) |
| `GET /account/usage/daily` | Daily aggregated usage for dashboards |
| `GET /account/key/usage` | Usage history for the calling API key only |
| `/account/agents` | Managed prompt-agent configuration |
| `/account/my-models` | Private community model registration and allowlisted public publishing |
| `GET /account/key` | API key validity, type, and permissions |

### GET /account/profile

Returns user profile. `githubUsername`, `image`, and `communityEndpointsAllowed` are always included. `name` and `email` are included only when the API key has `account:profile`.

### GET /account/balance

`balance` is the amount visible to this caller and is kept stable for existing clients:

- Budgeted API keys always get the key's remaining budget in `balance` (no extra scope).
- Sessions and unbudgeted keys get the account total (Quest Pollen + paid) in `balance`. That path requires `account:usage` for API keys.

When the caller can view account usage (dashboard session or `account:usage`), the response also includes `accountBalance: { total, tier, paid }` so clients can see Quest Pollen vs paid Pollen. Budgeted keys without `account:usage` do **not** receive `accountBalance` — that would leak the owner's wallet.

### GET /account/key/usage

Usage history for the API key used in the request. No extra scope — a key can always read its own usage. For account-wide usage across all keys, use `GET /account/usage` with `account:usage`.

### GET /account/quests

Returns the quest catalog with account status. `completed` includes both globally completed quests and quests earned by the account. Requires `account:usage`. Claiming rewards is dashboard-only.

### GET /account/usage

Per-request usage history: model, token counts, cost, response time. Requires `account:usage`.

### GET /account/usage/daily

Daily aggregated usage suitable for dashboards. Requires `account:usage`.

### GET /account/key

Returns the current API key's validity, type, and permissions.

### /account/agents

Create and manage an agent's system prompt, base model, and optional built-in Pollinations tools. Creating an agent here does not make it callable by itself; register its returned ID through `/account/my-models` to assign an `owner/name` model ID. The dashboard performs both steps together. Managed-agent registrations are text-only and free, with no owner-set prices, fallbacks, or per-user request limit. Calls still consume Pollen for the base model and any tool generations. API keys require `account:keys`.

See [Build Your Own Agent](https://github.com/pollinations/pollinations/blob/main/BUILD_YOUR_OWN_AGENT.md) for dashboard, CLI, and API examples.

### /account/my-models

Community text and image model management. Any authenticated account can list, create, update, delete, and call its private owner-only models. Text providers must expose OpenAI-compatible `/v1/chat/completions`; image providers must expose `/v1/images/generations`. Image models are text-to-image only, and calls through `/v1/images/generations` must use `response_format: "b64_json"`; reference images and edits are not supported yet. The endpoint test selects image pricing: valid OpenAI image token usage enables per-1M-token pricing, otherwise a fixed Pollen price is charged once per successful generated image.

Public publishing requires `communityEndpointsAllowed: true`; [request account-level publisher access](https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml) with the allowlist form. Inspecting and testing an upstream endpoint is open to every account, limited to one probe every 30 seconds. The form does not register individual models. API keys require `account:keys`. The dashboard and Account API support text and image registration; `polli my-models` currently supports text models only.
