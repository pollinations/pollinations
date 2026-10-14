## Authentication

All generation requests require an API key from [enter.pollinations.ai](https://enter.pollinations.ai/keys). Model listing endpoints work without authentication.

| Type | Prefix | Use case | Limits |
|------|--------|----------|--------|
| Personal Secret Key | `sk_` | Server-side apps. Never embed it in client-side code. | Its configured budget, model and account permissions apply. |
| App Key (Connect User Wallets) | `pk_` | Public OAuth `client_id` for web, mobile and CLI apps. Register redirect URIs for web authorization. | New App Keys have a zero generation budget; use them to request user authorization. |
| User-authorized key (BYOP) | `sk_` | API calls by the app the user authorized, including browser apps. | The user's approved budget, expiry, model and account permissions apply. Request only the access your app needs. |
| Legacy publishable key | `pk_` | Existing direct-spend integrations only. | Some existing keys still have a generation budget; the 1 Pollen / IP / hour limit applies. Migrate to BYOP. |

New frontend and mobile apps should use **Connect User Wallets**, also called BYOP (Bring Your Own Pollen): register an App Key at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys), then use the OAuth authorization-code flow with PKCE (or the device flow) to obtain a scoped user key (`sk_`). For generation alone, request no account scopes and choose a budget, expiry and allowed models. The legacy fragment redirect remains supported.

Two ways to authenticate generation requests:

- Header: `Authorization: Bearer YOUR_API_KEY`
- Query param: `?key=YOUR_API_KEY`

Prefer the header, including browser `fetch` requests. Browser WebSockets cannot set custom headers, so they can pass the scoped BYOP user key in `?key=`. This URL contains a credential: do not share or log it. Never substitute your personal Secret Key or the App Key for new browser generation. An authenticated backend relay is an option when you need to keep the credential out of the WebSocket URL.

For detailed integration guidance on user-pays authorization, including OAuth discovery and token exchange, see [Connect User Wallets](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md).
