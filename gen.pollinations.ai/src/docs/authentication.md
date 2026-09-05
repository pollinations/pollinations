## Authentication

All generation requests require an API key from [enter.pollinations.ai](https://enter.pollinations.ai/keys). Model listing endpoints work without authentication.

| Type | Prefix | Use case | Rate limits | Description |
|------|--------|----------|-------------|-------------|
| Secret | `sk_` | Server-side apps | None | Personal developer key. Never expose in client-side code. |
| App Key (Connect User Wallets) | `pk_` with redirect URIs | Client apps via OAuth / device flow | None on the App Key itself | Publishable App Key used as the OAuth `client_id`. Users authorize; your app receives a scoped `sk_`. |
| Raw publishable | `pk_` with no app binding | Legacy direct spend | 1 pollen / IP / hour | Retained for existing integrations. Do not mint new ones. |

> **Note:** Raw publishable keys (`pk_` used as a generation key in browsers) are **legacy**, not beta. New frontend and mobile apps should use **Connect User Wallets**, also called BYOP (Bring Your Own Pollen): register an App Key at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys), then run the OAuth authorization-code flow with PKCE (or the device flow) to obtain a temporary user-authorized secret key (`sk_`). The legacy fragment redirect and device flow remain supported.

Two ways to authenticate generation requests:

- Header: `Authorization: Bearer YOUR_API_KEY`
- Query param: `?key=YOUR_API_KEY`

For detailed integration guidance on user-pays authorization, including OAuth discovery and token exchange, see [Connect User Wallets](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md).

### x402 payments (staging preview)

On `https://staging.gen.pollinations.ai`, supported requests can use Weft x402 payments without a Pollinations API key. Production still requires an API key.

| Endpoint | Supported requests |
|----------|--------------------|
| `POST /v1/chat/completions`, `POST /text` | Text-only chat, including `stream: true`, with `max_tokens` between 1 and 4096; models billed only for prompt/cache/completion text tokens |
| `GET /image/{prompt}` | Single images with a fixed per-image price |
| `POST /v1/images/generations` | The same image models, with `response_format: "b64_json"` |
| `POST /v1/audio/speech` | Character-priced speech, for example `elevenflash` |

Send a unique `Idempotency-Key` header. The initial `402` response advertises a maximum in `PAYMENT-REQUIRED`; an x402-capable client authorizes that ceiling and retries with `PAYMENT-SIGNATURE`. The final charge uses measured usage at the model's Pollen price, with a $0.001 minimum, and cannot exceed the authorization. The authorization permits settlement for up to 16 minutes.

Retry a disconnected request with the same URL, body, safety header, idempotency key and payment signature. Completed responses and payment receipts are retained for 30 days. Use a new key for a new generation. Requests and generated bodies are currently limited to 20 MiB, excluding the final payment receipt.

For streaming chat, the initial challenge is still an ordinary JSON `402`. Once payment authorization is verified, the retry returns `200 text/event-stream` with chat events immediately. Actual usage is settled at the end. Before `[DONE]`, a Pollinations-specific `event: x402.payment` carries `data: {"paymentResponse":"<encoded PAYMENT-RESPONSE>"}`. Live responses cannot carry the eventual receipt in HTTP headers; completed replays also include the `PAYMENT-RESPONSE` header. Wait for the receipt and `[DONE]` to confirm completion. A generation or payment failure emits an error event without `[DONE]`; retry with the same key and signature. Disconnecting does not cancel generation or settlement. Retries replay from the beginning, not from an event offset. Use a direct streaming-capable client; a payment proxy may buffer the response.

Video, uploads, token-priced images, duration-priced audio, search and community endpoints are not included in this preview. Requests without a supported ceiling must use a Pollinations API key. Supplying `Authorization` or a `key` query parameter always selects normal Pollen authentication, even if the credential is invalid.
