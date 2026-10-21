Pollinations runs E2B's sandbox API with the rules noted on each endpoint. Request and response fields are in [E2B's API reference](https://docs.e2b.dev/api-reference/sandboxes/create-sandbox-v2).

**Base URL:** `https://gen.pollinations.ai/alpha/e2b`. Send a [secret key](https://enter.pollinations.ai/keys) with the `account:machines` permission as `Authorization: Bearer <key>`. You see only your own sandboxes. Endpoints not listed here return 403.

E2B's SDKs and CLI work unchanged:

```bash
export E2B_API_URL=https://gen.pollinations.ai/alpha/e2b
export E2B_API_KEY=sk_...
```

Setup with polli, credits and runtime: [Sandboxes](https://gen.pollinations.ai/docs#tag/sandboxes).
