## Authentication

All generation requests require an API key from [enter.pollinations.ai](https://enter.pollinations.ai/keys). Model listing endpoints work without authentication.

| Type | Prefix | Use case | Rate limits | Description |
|------|--------|----------|-------------|-------------|
| Secret | `sk_` | Server-side apps | None | Personal developer key. Never expose in client-side code. |
| App Key (BYOP) | `pk_` with redirect URIs | Client apps via OAuth / device flow | None on the App Key itself | Publishable App Key used as the BYOP `client_id`. Users authorize; your app receives a scoped `sk_`. |
| Raw publishable | `pk_` with no app binding | Legacy direct spend | 1 pollen / IP / hour | Retained for existing integrations. Do not mint new ones. |

> **Note:** Raw publishable keys (`pk_` used as a generation key in browsers) are **legacy**, not beta. New frontend and mobile apps should use the **BYOP (Bring Your Own Pollen)** flow: register an App Key at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys), then run the OAuth authorization-code flow with PKCE (or the device flow) to obtain a temporary user-authorized secret key (`sk_`). The legacy fragment redirect and device flow remain supported.

Two ways to authenticate generation requests:

- Header: `Authorization: Bearer YOUR_API_KEY`
- Query param: `?key=YOUR_API_KEY`

For detailed integration guidance on user-pays authorization, including OAuth discovery and token exchange, see [Connect User Wallets](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md).
