## Authentication

In the [interactive docs](https://gen.pollinations.ai/docs), select **Pollinations Connect** to authorize a docs key using your account. The consent screen defaults to a 5-Pollen spending cap and a 7-day expiry; both are editable. The approved key authenticates the request tester, and the account menu shows your profile and its remaining budget. Requests spend real Pollen from your wallet; the key's budget is a spending limit, not a separate balance.

The connection stays in the current browser tab. Copied examples contain `YOUR_API_KEY`; the docs add your connected key only when sending a request to a Pollinations API. Select **Disconnect** before entering a different key in the request tester. Disconnect clears this tab's connection; it does not revoke the key or disconnect other tabs. Revoke keys on the [Keys page](https://enter.pollinations.ai/keys). Each new consent creates a separate key that remains valid until expiry or revocation. Sandbox and account-management endpoints require their respective permissions; the default docs connection does not grant them.

Use a secret key from [enter.pollinations.ai](https://enter.pollinations.ai/keys) for generation requests. Model listing endpoints work without authentication.

<p align="left"><img src="https://media.pollinations.ai/dab7992b-9bf7-471d-8660-c30ab844f45e" alt="Create secret key dialog with budget, expiry and permissions" width="560"></p>

| Type | Prefix | Use case | Rate limits | Description |
|------|--------|----------|-------------|-------------|
| Secret key | `sk_` | API requests | None | Personal secret keys stay out of browser code. Browser apps use a user-authorized secret key (`sk_`) from [Connect User Wallets](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md). Secret keys have configurable model permissions, account permissions, and budgets. |
| App key (Connect User Wallets) | `pk_` with redirect URIs | Client apps via OAuth / device flow | None on the App Key itself | Publishable App Key used as the OAuth `client_id`. Users authorize; your app receives a scoped secret key (`sk_`). |
| Raw publishable | `pk_` with no app binding | Legacy direct spend | 1 pollen / IP / hour | Retained for existing integrations. Do not mint new ones. |

> **Note:** Raw publishable keys (`pk_` used as a generation key in browsers) are **legacy**, not beta. New frontend and mobile apps should use **Connect User Wallets**, also called BYOP (Bring Your Own Pollen): register an App Key at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys), then run the OAuth authorization-code flow with PKCE (or the device flow) to obtain a temporary user-authorized secret key (`sk_`). The legacy fragment redirect and device flow remain supported.

Two ways to authenticate generation requests:

- Header: `Authorization: Bearer YOUR_API_KEY`
- Query param: `?key=YOUR_API_KEY`

For detailed integration guidance on user-pays authorization, including OAuth discovery and token exchange, see [Connect User Wallets](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md).

To buy a prepaid API key with USDC without a Pollinations account, see [x402 Prepaid Keys](https://gen.pollinations.ai/docs#tag/x402-prepaid-keys).
