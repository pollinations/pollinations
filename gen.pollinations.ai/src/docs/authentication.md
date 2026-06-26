## Authentication

All generation requests require an API key from [enter.pollinations.ai](https://enter.pollinations.ai). Model listing endpoints work without authentication.

| Type | Prefix | Use case | Rate limits |
|------|--------|----------|-------------|
| Secret | `sk_` | Server-side apps | None |
| Publishable/App Key | `pk_` | Client-side apps (beta) | BYOP |

Two ways to authenticate:

- Header: `Authorization: Bearer YOUR_API_KEY`
- Query param: `?key=YOUR_API_KEY`

> **Warning:** Never expose secret keys (`sk_`) in client-side code. Use BYOP App Keys for frontend apps.
> **Warning:** The old publishable keys are deprecated, and have been replaced with BYOP app keys. You can create an app key from the [dashboard](https://enter.pollinations.ai/#keys)
