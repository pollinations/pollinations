## Authentication

All generation requests require an API key from [enter.pollinations.ai](https://enter.pollinations.ai/keys). Model listing endpoints work without authentication.

| Type | Prefix | Use case | Limits | Description |
|------|--------|----------|--------|-------------|
| Personal Secret Key | `sk_` | Trusted servers spending the owner's Pollen | Configurable budget, expiry, models, and account permissions | Never expose a personal key in client-side code. Platform and model-specific protections still apply. |
| App Key (BYOP) | `pk_` registered for an app | OAuth or device-flow client identifier | Does not spend Pollen itself | Publishable `client_id`. After consent, the app receives a scoped user key. |
| User-authorized key | `sk_` returned by BYOP | Browser, mobile, CLI, or another authorized client | User-approved budget, expiry, models, and permissions | Temporary generation credential funded and revocable by the user. |
| Raw publishable | `pk_` with no app binding | Legacy direct spend | 1 Pollen / IP / hour | Retained for existing integrations. Do not create new ones. |

> **Note:** The prefix alone does not tell you whether an `sk_` is a personal key or a scoped key issued after user consent. Keep personal keys server-side. A browser may use a temporary BYOP-issued key within the limits the user approved; keep it in memory or session storage, never in URLs, analytics, logs, or long-lived local storage.

Choose the flow by who pays:

- Your backend pays: use a personal Secret Key.
- Each app user pays: register an App Key and use BYOP authorization.
- Do not start a new integration with a raw publishable generation key.

Two ways to authenticate generation requests (the header is preferred):

- Header: `Authorization: Bearer YOUR_API_KEY`
- Query param: `?key=YOUR_API_KEY`

For detailed integration guides on user-pays authorization, including OAuth discovery and token exchange, refer to the [Bring Your Own Pollen (BYOP) guide](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md).
