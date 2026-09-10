## Account

Self-service endpoints for the authenticated user. Endpoints require authentication (API key or session) unless their schema says otherwise. API keys need the relevant `account:<scope>` permission. Base path: `/account`.

`account:usage` is the read-only account-state scope for balances, usage, quests, and earnings. `account:keys` manages keys and, where enabled, my-models. These permissions are independent; request both when a client needs both. Newly created child keys cannot receive `account:keys` through this API.

| Endpoint | Description |
|----------|-------------|
| `GET /account/profile` | GitHub username, image, and community model access |
| `GET /account/balance` | Current pollen balance |
| `GET /account/quests` | Read-only quest status |
| `GET /account/usage` | Per-request usage history with costs (account-wide) |
| `GET /account/usage/daily` | Daily aggregated usage for dashboards |
| `GET /account/key/usage` | Usage history for the calling API key only |
| `/account/agents` | Managed agent configuration |
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

Create and manage prompt or code agents and their callable `owner/name` model listings. Private agents are available to any account with linked GitHub; public listing requires community publisher access. A code agent points to a public GitHub repository with `agent.ts` at its root, and Pollinations deploys the current default-branch revision. `POST /account/agents/{id}/sync` deploys a newer revision without authentication and cannot change the stored repository. Code agents receive `pollinations(path, init)` for caller-funded API requests, `mcp.listTools(server)` for tool discovery, and `mcp(server, tool, arguments)` for hosted MCP tools. Managed agents are text-only and free at the outer layer; their model and tool calls consume the caller's Pollen.

To deploy after every push, add a GitHub Action step (replace `AGENT_ID`):

```yaml
- run: curl --fail --retry 2 --retry-delay 30 -X POST https://gen.pollinations.ai/account/agents/AGENT_ID/sync
```

See [Publish an Agent](https://github.com/pollinations/pollinations/blob/main/BUILD_YOUR_OWN_AGENT.md) for dashboard, CLI, and API examples.

### /account/my-models

Community text, image, video, speech-to-text, and text-to-speech model management. Any authenticated account can list, create, update, delete, and call its private owner-only models. Text providers and endpoint agents declare one `api` (`chat_completions` or `responses`) and its exact `url`. Responses listings support both public text APIs through Gen; Chat Completions listings support Chat Completions only. Managed prompt agents use the local Responses runtime and require no endpoint URL. The text endpoint test checks JSON and streaming usage for the selected API; `/models` discovery is optional.

Other model families retain `baseUrl`. Image providers expose `/v1/images/generations` and may also expose `/v1/images/edits`; transcription providers expose `/v1/audio/transcriptions`; speech providers expose `/v1/audio/speech` and must return binary audio, which is billed by input character count. Video providers enter an exact endpoint URL that accepts `prompt`, optional `duration`, and optional `image` and `reference_*` URL arrays. Omitted duration uses the provider's default. Return completed MP4 media as `data[].b64_json` or `data[].url`, plus `usage.duration` in generated seconds. Billing uses reported duration, falling back to requested duration when usage is missing; at least one is required. The endpoint test detects image-edit support and selects image pricing: valid OpenAI image token usage enables per-1M-token pricing, otherwise a fixed Pollen price is charged once per successful generated image.

Public publishing requires `communityEndpointsAllowed: true`; [request account-level publisher access](https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml) with the allowlist form. Inspecting and testing an upstream endpoint is open to every account, limited to one probe every 30 seconds. The form does not register individual models. API keys require `account:keys`. The dashboard, Account API, and `polli my-models` support text, image, video, transcription, and speech registration. See [Publish a Model](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_MODEL.md) for setup, publishing, pricing, fallbacks, and health monitoring.
