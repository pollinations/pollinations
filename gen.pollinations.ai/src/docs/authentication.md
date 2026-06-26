## Authentication

All generation requests require an API key from [enter.pollinations.ai](https://enter.pollinations.ai). Model listing endpoints work without authentication.

| Type | Prefix | Use case | Rate limits |
|------|--------|----------|-------------|
| Secret | `sk_` | Server-side apps | None |
| Publishable | `pk_` | Client-side apps (beta) | 1 pollen/IP/hour |

Two ways to authenticate:

- Header: `Authorization: Bearer YOUR_API_KEY`
- Query param: `?key=YOUR_API_KEY`

> **Warning:** Never expose secret keys (`sk_`) in client-side code. Use publishable keys (`pk_`) for frontend apps.
> **Warning:** Using a publishable key for frontend apps can be dangerous because users will get a continous stream of 1 pollen per ip per hour, which can be abusedd against you. It is recommended to use the BYOP authorization flow or setup your own proxy with authentication instead.
