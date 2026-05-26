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
