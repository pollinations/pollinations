# Sign in with Pollinations — demo client

Minimal OAuth 2.1 client (authorization code + PKCE S256, public client, no
client secret) against `enter.pollinations.ai`. Zero dependencies, Node ≥ 18.
This is the reference for third-party sites integrating "Log in with
Pollinations" — the same shape alp.anondrop.net-style clients use.

## Register a client

1. Sign in at https://enter.pollinations.ai and create an **App Key** (`pk_…`).
2. Add `http://localhost:8789/callback` to the key's **redirect URIs**
   (loopback redirects match any port per RFC 8252 §7.3).

## Run

```bash
CLIENT_ID=pk_your_app_key npm start
# open http://localhost:8789
```

Env vars: `CLIENT_ID` (required), `ISSUER` (default
`https://enter.pollinations.ai`), `PORT` (8789), `REDIRECT_URI`, `SCOPE`
(default `profile`), `GEN_URL` (default `https://gen.pollinations.ai`).

## What it demonstrates

- **Discovery**: fetches `/.well-known/oauth-authorization-server` (RFC 8414)
  and uses the advertised endpoints — no hardcoded paths.
- **Authorization request**: `response_type=code` with `state` (CSRF) and a
  fresh PKCE S256 `code_challenge` per login.
- **Token exchange**: form-encoded `POST` to the token endpoint with
  `code_verifier`; the access token is an opaque `sk_` key.
- **Userinfo**: `Bearer` call to the advertised `userinfo_endpoint`.
- **Delegated API access**: a chat completion against `gen.pollinations.ai`
  paid from the signed-in user's pollen, within the budget/expiry they
  approved on the consent screen.

Sessions and pending logins are in-memory — restart logs everyone out. That is
intentional; this is a protocol demo, not a production template.
