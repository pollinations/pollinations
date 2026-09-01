# Pollinations OAuth browser demo

A minimal OAuth authorization-code + PKCE app. OAuth and generation requests
go directly from the browser to Pollinations; `server.js` only serves the local
HTML file.

## Run

1. Create an **App Key** at https://enter.pollinations.ai/keys.
2. Add `http://localhost:8789/` to its redirect URIs.
3. Replace `pk_your_app_key` in `index.html` with the App Key.
4. Run:

```bash
npm start
```

Then open http://localhost:8789.

The example keeps the delegated key in memory. Production apps should do the
same, or use `sessionStorage` when the key must survive a page reload. A backend
is only needed when the app specifically wants server-side sessions or API
calls.
