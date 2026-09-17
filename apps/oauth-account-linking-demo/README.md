# Pollinations OAuth account-linking demo

An optional server-backed example for apps that already have users and a
database. It binds OAuth state to the current app user, stores the delegated key
encrypted, and later uses that key for a server-side Pollinations request.

The demo seeds one local `Demo User`. In a real app, replace `currentUser()` with
your existing authenticated-session lookup; the OAuth code does not implement a
second login system.

## Run

1. Create an **App Key** at https://enter.pollinations.ai/keys.
2. Add `http://localhost:8790/callback` to its redirect URIs.
3. Run with a temporary local encryption key:

```bash
CLIENT_ID=pk_your_app_key TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32) npm start
```

Then open http://localhost:8790.

The SQLite schema contains only the pieces relevant to account linking:

```text
users(id)
oauth_logins(state, user_id, verifier, expires_at)
provider_connections(user_id, provider_user_id, encrypted_access_token)
```

Production apps should use their existing database migrations and session
authentication, and load `TOKEN_ENCRYPTION_KEY` from their secret manager.
