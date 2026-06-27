## Authentication

All generation requests require an API key from [enter.pollinations.ai](https://enter.pollinations.ai). Model listing endpoints work without authentication.

| Type | Prefix | Use case | Rate limits | Description |
|------|--------|----------|-------------|-------------|
| Secret | `sk_` | Server-side apps | None | Personal developer key. Never expose in client-side code. |
| App Key (BYOP) | `pk_` | Client-side & Frontend apps | None | Publishable key used in the **BYOP (Bring Your Own Pollen)** flow to authorize users' balances. |

> **Note:** Publishable Keys (`pk_`) for direct client-side requests have been replaced by the **BYOP (Bring Your Own Pollen)** auth flow. Frontend applications must obtain a temporary user-authorized secret key (`sk_`) via the authorize redirect or device flow.

Two ways to authenticate generation requests:

- Header: `Authorization: Bearer YOUR_API_KEY`
- Query param: `?key=YOUR_API_KEY`

For detailed integration guides on user-pays authorization, refer to the [Bring Your Own Pollen (BYOP) guide](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md).
