## x402 Prepaid Keys

Buy a prepaid API key with USDC on Base, without creating a Pollinations account. Choose any amount from $0.01 to $10,000 in cents; the key receives the same amount of Pollen.

1. `GET https://enter.pollinations.ai/api/x402/keys/0.50` requests a $0.50 key. `POST` works too. The first response is `402` with payment terms in `PAYMENT-REQUIRED`.
2. Use an x402-capable wallet or client to sign those terms, then retry the same request with `PAYMENT-SIGNATURE`. The response contains the secret `key` and its `pollen` budget.
3. Send `Authorization: Bearer <key>` to normal `gen.pollinations.ai` generation endpoints. Check the key's remaining budget at `GET https://gen.pollinations.ai/account/balance`.

Each payment creates a new key. Keep it secret. `GET https://enter.pollinations.ai/api/x402/keys` lists preset amounts; you can also put your own amount in the URL.
